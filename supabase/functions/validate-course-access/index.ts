import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// FIX (release blocker — applied 2026-09-12): wildcard CORS on authenticated
// endpoints allowed any origin to invoke this function. We now reflect only
// the request Origin if it appears in the explicit allow-list (Supabase
// project URL + dashboard origin(s)).
const ALLOWED_ORIGINS: string[] = (() => {
  const list = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      if (!list.includes(u.origin)) list.push(u.origin);
    } catch {
      /* ignore malformed SUPABASE_URL at module load */
    }
  }
  return list;
})();

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonBody(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const body = await req.json();
    const { course_id, lesson_id } = body;

    if (!course_id && !lesson_id) {
      return jsonBody(req, { error: 'course_id or lesson_id is required' }, 400);
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return jsonBody(req, { allowed: false, expires_at: null });
    }

    let resolvedCourseId: string = course_id;

    // lesson_id path: check published + preview, then resolve course
    if (lesson_id) {
      // Tenant scoping is enforced by RLS (lessons_select policy uses the
      // DB-authoritative public.get_current_tenant_id(), not a client-
      // supplied value) — do not also filter on user.user_metadata.tenant_id
      // here. That field is never populated in this system (the tenant_id
      // JWT claim is injected at the top level by the custom_access_token
      // Auth Hook, not into user_metadata), so this filter always evaluated
      // to `.eq('tenant_id', undefined)` and silently denied every real,
      // legitimately-enrolled user instead of granting access.
      const { data: lesson, error: lessonError } = await supabaseClient
        .from('lessons')
        .select('id, course_id, is_published, is_preview')
        .eq('id', lesson_id)
        .single();

      if (lessonError || !lesson || !lesson.is_published) {
        return jsonBody(req, { allowed: false, expires_at: null });
      }

      // Preview lessons need no enrollment
      if (lesson.is_preview) {
        return jsonBody(req, { allowed: true, expires_at: null });
      }

      resolvedCourseId = lesson.course_id;
    }

    // Enrollment check — correct .or() syntax for Supabase JS v2
    const now = new Date().toISOString();
    // See the note above the lessons query: tenant scoping is enforced by
    // RLS (enrollments_select_policy → get_current_tenant_id()), not by a
    // client-supplied tenant_id filter, which is never populated here.
    const { data: enrollments, error: enrollmentError } = await supabaseClient
      .from('enrollments')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('course_id', resolvedCourseId)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (enrollmentError || !enrollments || enrollments.length === 0) {
      return jsonBody(req, { allowed: false, expires_at: null });
    }

    return jsonBody(req, {
      allowed: true,
      expires_at: enrollments[0].expires_at ?? null,
    });
  } catch (error) {
    return jsonBody(req, { allowed: false, expires_at: null }, 500);
  }
});
