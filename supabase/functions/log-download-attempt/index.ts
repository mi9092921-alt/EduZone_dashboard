import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Called by Flutter after a download completes successfully, purely to
// write an analytics/audit record. Offline playback itself is authorized
// entirely client-side by OfflinePolicyEngine against locally HMAC-signed
// metadata — this function and download_logs have no bearing on that
// decision. The access_expires_at written here is re-derived from the
// caller's real active enrollment (see below), not trusted from the
// request body, so this audit trail can't be falsified by the client.

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

    // SECTION-12 FIX: `access_expires_at` used to be taken verbatim from the
    // request body and written straight into download_logs -- an
    // authenticated caller could send any value here (e.g. a far-future
    // date) and it would land in the audit trail unchecked. This table
    // carries no authorization power today (offline playback is gated
    // entirely by OfflinePolicyEngine against locally-signed metadata, not
    // by download_logs), but it exists specifically to be a trustworthy
    // audit/observability record (project instructions require honest,
    // unspoofable audit data, per §12/§15 and P6.23 "Metadata Authenticity").
    // The client-supplied value is no longer trusted; it is only read as a
    // hint for logging when the real server-side lookup below can't
    // resolve one (e.g. a legitimately preview/free lesson has none).
    const { lesson_id, quality, access_expires_at: clientReportedExpiresAt } = await req.json();

    if (!lesson_id || !quality) {
      return jsonBody(req, { error: 'lesson_id and quality are required' }, 400);
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return jsonBody(req, { error: 'Unauthorized' }, 401);
    }

    // Resolve course_id from lesson.
    // Tenant scoping is enforced by RLS (lessons_select policy, DB-
    // authoritative get_current_tenant_id()), not by a client-supplied
    // tenant_id filter — see the matching note in validate-course-access.
    // user.user_metadata.tenant_id is never populated in this system, so
    // filtering on it here always evaluated to `.eq('tenant_id', undefined)`
    // and would break this lookup for every real download instead of
    // narrowing it safely.
    const { data: lesson, error: lessonError } = await supabaseClient
      .from('lessons')
      .select('id, course_id')
      .eq('id', lesson_id)
      .single();

    if (lessonError || !lesson) {
      return jsonBody(req, { error: 'Lesson not found' }, 404);
    }

    // Re-derive the real entitlement expiry server-side instead of trusting
    // the client-supplied value -- same active-enrollment lookup
    // validate-course-access uses (RLS-scoped to this user/tenant, so this
    // can only ever see the caller's own enrollment). A missing/expired
    // enrollment here (e.g. a preview lesson, or entitlement revoked
    // between the earlier validate-course-access call and this one) simply
    // logs a null expiry rather than the caller's claimed one.
    const now = new Date().toISOString();
    const { data: enrollments } = await supabaseClient
      .from('enrollments')
      .select('expires_at')
      .eq('user_id', user.id)
      .eq('course_id', lesson.course_id)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const serverVerifiedExpiresAt =
      enrollments && enrollments.length > 0 ? (enrollments[0].expires_at ?? null) : null;

    if (clientReportedExpiresAt && serverVerifiedExpiresAt !== clientReportedExpiresAt) {
      console.warn(
        'log-download-attempt: client-reported access_expires_at did not ' +
          'match server-verified enrollment expiry; using server value',
        { lesson_id, user_id: user.id },
      );
    }

    // Insert download log
    const { error: logError } = await supabaseClient.from('download_logs').insert({
      user_id: user.id,
      lesson_id,
      course_id: lesson.course_id,
      quality,
      downloaded_at: new Date().toISOString(),
      access_expires_at: serverVerifiedExpiresAt,
    });

    if (logError) {
      // Download already succeeded — log the error but don't fail the request
      console.error('Log insert failed:', logError);
    }

    return jsonBody(req, { success: true });
  } catch (error) {
    console.error('log-download-attempt unexpected failure', error);
    return jsonBody(req, { error: 'Internal server error' }, 500);
  }
});
