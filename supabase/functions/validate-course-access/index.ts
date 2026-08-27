import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )

    const body = await req.json()
    const { course_id, lesson_id } = body

    if (!course_id && !lesson_id) {
      return new Response(
        JSON.stringify({ error: 'course_id or lesson_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ allowed: false, expires_at: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let resolvedCourseId: string = course_id

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
        .single()

      if (lessonError || !lesson || !lesson.is_published) {
        return new Response(
          JSON.stringify({ allowed: false, expires_at: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Preview lessons need no enrollment
      if (lesson.is_preview) {
        return new Response(
          JSON.stringify({ allowed: true, expires_at: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      resolvedCourseId = lesson.course_id
    }

    // Enrollment check — correct .or() syntax for Supabase JS v2
    const now = new Date().toISOString()
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
      .limit(1)

    if (enrollmentError || !enrollments || enrollments.length === 0) {
      return new Response(
        JSON.stringify({ allowed: false, expires_at: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        expires_at: enrollments[0].expires_at ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ allowed: false, expires_at: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})