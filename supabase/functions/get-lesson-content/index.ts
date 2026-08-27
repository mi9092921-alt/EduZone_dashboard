import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'private, no-store, max-age=0',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// get_lesson_content()'s p_ip parameter is `inet`. x-forwarded-for can be a
// comma-separated proxy chain (or absent/malformed), which Postgres would
// fail to cast -- take only the first hop and validate it loosely so a bad
// header can never turn into a failed RPC call / hidden 500.
function parseClientIp(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  if (!first) return null;
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (ipv4.test(first) || ipv6.test(first)) return first;
  return null;
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { lesson_id, device_id } = await req.json();

    if (!lesson_id || typeof lesson_id !== "string") {
      return jsonResponse({ error: "Missing lesson_id" }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    // SECTION-09 CRITICAL FIX: access control must be evaluated, and the
    // access decision logged, atomically and server-side -- not by the
    // edge function re-implementing the check itself.
    //
    // The previous version called check_lesson_access() (which returns a
    // JSON object such as {"allowed": false, "reason": "not_enrolled"})
    // and then branched on `!access`. A non-null JS object is always
    // truthy, so that condition only ever caught an actual RPC error --
    // never a legitimate access denial. Any authenticated user, from any
    // tenant, could request a signed video URL for any lesson_id and
    // receive one. It also tried to audit-log the access with
    // `.from("audit.lesson_access_log")`, but the `audit` schema is not in
    // config.toml's exposed api.schemas, so that insert silently failed on
    // every call -- there was no real audit trail for video access either.
    //
    // Fix: call the existing public.get_lesson_content() RPC as the user
    // (so it runs against their real auth.uid()/tenant). That function
    // already performs the enrollment/tenant/preview/teacher/admin check,
    // inserts into audit.lesson_access_log for both allowed and denied
    // attempts (bypassing PostgREST/api schema exposure since it's a
    // regular in-database INSERT inside a SECURITY DEFINER function), and
    // raises a plain 'ACCESS_DENIED' / 'LESSON_NOT_FOUND' / 'AUTH_REQUIRED'
    // exception when the caller may not proceed. There is no boolean/JSON
    // truthiness trap here: an exception is the only non-success outcome.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: lessonContent, error: accessError } = await userClient.rpc(
      "get_lesson_content",
      {
        p_lesson_id: lesson_id,
        p_ip: parseClientIp(req.headers.get('x-forwarded-for')),
        p_device_id: typeof device_id === "string" ? device_id : null,
      },
    );

    if (accessError || !lessonContent) {
      const reason = accessError?.message ?? "";
      if (reason.includes("AUTH_REQUIRED")) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      if (reason.includes("LESSON_NOT_FOUND")) {
        return jsonResponse({ error: "Lesson not found" }, 404);
      }
      // ACCESS_DENIED and any other unexpected failure are both a 403 from
      // the caller's point of view -- do not leak the raw Postgres error
      // (schema/constraint/internal detail) to the client.
      return jsonResponse({ error: "Access denied" }, 403);
    }

    const videoPath: string | null = lessonContent.videoPath ?? null;
    const captionsPath: string | null = lessonContent.captionsPath ?? null;
    const provider: string | null = lessonContent.provider ?? null;

    // Signed URL generation needs storage access the user-scoped client
    // doesn't have; the service-role client is used ONLY here, after
    // authorization has already been established above.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    let videoUrl = videoPath;
    let captionsUrl = captionsPath;

    if (provider !== 'youtube' && videoPath) {
      const { data: signedVideo } = await adminClient.storage
        .from("videos")
        .createSignedUrl(videoPath, 180);

      if (signedVideo) videoUrl = signedVideo.signedUrl;

      if (captionsPath) {
        const { data: signedCaptions } = await adminClient.storage
          .from("videos")
          .createSignedUrl(captionsPath, 180);

        if (signedCaptions) captionsUrl = signedCaptions.signedUrl;
      }
    }

    return jsonResponse(
      {
        has_access: true,
        video_url: videoUrl,
        provider,
        duration: lessonContent.durationSec ?? null,
        captions_url: captionsUrl,
      },
      200,
    );
  } catch (error) {
    console.error("Unhandled error in get-lesson-content:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
