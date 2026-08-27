// @ts-nocheck — Deno edge function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Inlined from _shared/cors.ts ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function errorResponse(code: string, message: string, status = 400, extra?: Record<string, unknown>): Response {
  return jsonResponse({ error: code, message, ...extra }, status);
}

function requireServiceRole(req: Request): Response | null {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!expected || !authorization || authorization !== `Bearer ${expected}`) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }
  return null;
}

// --- Inlined from _shared/supabaseAdmin.ts ---
function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Apply user filters — mirrors route.ts: user_ids override search/filters.
 */
function applyUserFilters(
  query: ReturnType<ReturnType<typeof getSupabaseAdmin>["from"]>,
  f: Record<string, unknown>,
) {
  if (f.user_ids && Array.isArray(f.user_ids) && f.user_ids.length > 0) {
    query = query.in("id", f.user_ids as string[]);
    if (f.tenant_id) query = query.eq("tenant_id", f.tenant_id as string);
    return query;
  }
  if (f.search) {
    query = query.or(
      `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
    );
  }
  if (f.primary_role) query = query.eq("primary_role", f.primary_role as string);
  if (f.account_status) query = query.eq("account_status", f.account_status as string);
  if (f.tenant_id) query = query.eq("tenant_id", f.tenant_id as string);
  if (f.region_id) query = query.eq("region_id", f.region_id as string);
  return query;
}

async function updateBulkJob(
  admin: ReturnType<typeof getSupabaseAdmin>,
  jobId: string,
  opts: {
    status?: string;
    errorMessage?: string;
    finishedAt?: string;
    releaseLock?: boolean;
  },
): Promise<void> {
  const { error } = await admin.rpc("worker_update_bulk_job", {
    p_id: jobId,
    p_status: opts.status ?? null,
    p_error_message: opts.errorMessage ?? null,
    p_finished_at: opts.finishedAt ?? null,
    p_release_lock: opts.releaseLock ?? false,
  });
  if (error) throw new Error(`worker_update_bulk_job: ${error.message}`);
}

/**
 * Called by bulk-worker when job_type = 'bulk_export'.
 * Collects user data, generates JSON/CSV, uploads to Supabase Storage,
 * creates a signed download URL.
 */

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceRoleError = requireServiceRole(req);
  if (serviceRoleError) return serviceRoleError;

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Only POST", 405);
  }

  const admin = getSupabaseAdmin();
  let jobId: string | null = null;

  try {
    const body = await req.json();
    jobId = body.job_id ?? null;
    const payload = body.payload;

    if (!jobId || !payload) {
      return errorResponse("INVALID_REQUEST", "Missing job_id or payload");
    }

    const filters = payload.filters as Record<string, unknown>;
    const format = (payload.params?.export_format as string) ?? "json";

    const tenantId = filters.tenant_id as string | undefined;
    if (!tenantId) {
      throw new Error("Missing tenant scope");
    }

    // ── Fetch user data ──────────────────────────────────────
    let userQuery = admin
      .from("users")
      .select(
        "id, email, first_name, last_name, phone, primary_role, account_status, " +
        "warning_count, login_count, created_at, last_login, last_seen_at, tenant_id, region_id",
      )
      .is("deleted_at", null)
      .limit(500);

    userQuery = applyUserFilters(userQuery, filters);

    const { data: users, error: usersErr } = await userQuery;
    if (usersErr) throw usersErr;

    if (!users || users.length === 0) {
      await updateBulkJob(admin, jobId, {
        status: "done",
        finishedAt: new Date().toISOString(),
        errorMessage: JSON.stringify({ processed: 0, error: "No users found" }),
        releaseLock: true,
      });
      return jsonResponse({ message: "No users to export" });
    }

    const userIds = users.map((u: { id: string }) => u.id);

    // ── Fetch related data ───────────────────────────────────
    const [
      { data: enrollments },
      { data: warnings },
      { data: devices },
    ] = await Promise.all([
      admin
        .from("enrollments")
        .select("user_id, course_id, status, enrolled_at, expires_at")
        .in("user_id", userIds),
      admin
        .from("warnings")
        .select("user_id, reason, severity, action_taken, created_at")
        .in("user_id", userIds),
      admin
        .from("devices")
        .select("user_id, device_id, platform, is_active, bound_at, last_seen")
        .in("user_id", userIds),
    ]);

    // ── Build export data ────────────────────────────────────
    const exportData = users.map((user: Record<string, unknown>) => ({
      ...user,
      enrollments: (enrollments ?? []).filter(
        (e: { user_id: string }) => e.user_id === user.id,
      ),
      warnings: (warnings ?? []).filter(
        (w: { user_id: string }) => w.user_id === user.id,
      ),
      devices: (devices ?? []).filter(
        (d: { user_id: string }) => d.user_id === user.id,
      ),
    }));

    // Update progress
    await updateBulkJob(admin, jobId, {
      errorMessage: JSON.stringify({
        processed: users.length,
        total: users.length,
        in_progress: true,
        phase: "generating_file",
      }),
    });

    // ── Generate file content ────────────────────────────────
    let fileContent: string;
    let ext: string;
    let contentType: string;

    if (format === "csv") {
      fileContent = generateCsv(exportData);
      ext = "csv";
      contentType = "text/csv";
    } else {
      fileContent = JSON.stringify(exportData, null, 2);
      ext = "json";
      contentType = "application/json";
    }

    // ── Upload to Supabase Storage ───────────────────────────
    const filePath = `exports/${tenantId}/${jobId}.${ext}`;
    const { error: uploadErr } = await admin.storage
      .from("exports")
      .upload(filePath, new Blob([fileContent], { type: contentType }), {
        contentType,
        upsert: true,
      });

    if (uploadErr) {
      // If bucket doesn't exist, try creating it
      if (uploadErr.message?.includes("not found") || uploadErr.message?.includes("Bucket")) {
        await admin.storage.createBucket("exports", {
          public: false,
          fileSizeLimit: 52428800, // 50MB
        });
        // Retry upload
        const { error: retryErr } = await admin.storage
          .from("exports")
          .upload(filePath, new Blob([fileContent], { type: contentType }), {
            contentType,
            upsert: true,
          });
        if (retryErr) throw retryErr;
      } else {
        throw uploadErr;
      }
    }

    const downloadFilename = `users-export-${jobId}.${ext}`;

    // ── Create signed URL (1 hour, force attachment download) ─
    const { data: signedUrl, error: signErr } = await admin.storage
      .from("exports")
      .createSignedUrl(filePath, 3600, { download: downloadFilename });

    if (signErr) throw signErr;

    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    // ── Update job with download URL ─────────────────────────
    await updateBulkJob(admin, jobId, {
      status: "done",
      finishedAt: new Date().toISOString(),
      errorMessage: JSON.stringify({
        processed: users.length,
        total: users.length,
        download_url: signedUrl.signedUrl,
        expires_at: expiresAt,
        format: ext,
      }),
      releaseLock: true,
    });

    // ── Log completion ───────────────────────────────────────
    await admin.rpc("log_activity_async", {
      p_user_id: payload.initiator_id,
      p_type: "bulk_export_completed",
      p_details: {
        job_id: jobId,
        user_count: users.length,
        format: ext,
      },
      p_risk_level: "low",
    });

    return jsonResponse({
      job_id: jobId,
      processed: users.length,
      download_url: signedUrl.signedUrl,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("bulk-export error:", err);

    try {
      if (jobId) {
        await updateBulkJob(admin, jobId, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          errorMessage: JSON.stringify({ error: String(err) }),
          releaseLock: true,
        });
      }
    } catch (updateErr) {
      console.error("bulk-export failed to update job status:", updateErr);
    }

    return errorResponse("EXPORT_ERROR", "Unable to complete export", 500);
  }
});

/**
 * Generate a CSV string from export data.
 */
function generateCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  const userFields = [
    "id", "email", "first_name", "last_name", "phone",
    "primary_role", "account_status", "warning_count",
    "login_count", "created_at", "last_login", "tenant_id",
  ];

  const rows: string[] = [];

  // Header
  rows.push([
    ...userFields,
    "enrollments_count", "warnings_count", "devices_count",
  ].join(","));

  // Data rows
  for (const row of data) {
    const values = userFields.map((field) => {
      const val = row[field];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape commas and quotes in CSV
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });

    const enrollmentCount = Array.isArray(row.enrollments) ? row.enrollments.length : 0;
    const warningCount = Array.isArray(row.warnings) ? row.warnings.length : 0;
    const deviceCount = Array.isArray(row.devices) ? row.devices.length : 0;

    values.push(String(enrollmentCount), String(warningCount), String(deviceCount));
    rows.push(values.join(","));
  }

  return rows.join("\n");
}
