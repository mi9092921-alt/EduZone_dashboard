// @ts-nocheck — Deno edge function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Inlined from _shared/cors.ts ---
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  return null;
}
function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
function errorResponse(
  req: Request,
  code: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse(req, { error: code, message, ...extra }, status);
}

// --- Inlined from _shared/supabaseAdmin.ts ---
function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// --- Inlined from _shared/auth.ts ---
export interface AuthUser {
  id: string;
  role: string;
  tenant_id: string;
  token_version: number;
}
export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
async function requirePermission(req: Request, permission?: string): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer '))
    throw new AuthError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
  const jwt = authHeader.replace('Bearer ', '');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);
  if (error || !user) throw new AuthError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('primary_role, tenant_id, token_version, account_status, deleted_at')
    .eq('id', user.id)
    .is('deleted_at', null)
    .single();
  if (userErr || !userData) throw new AuthError(401, 'UNAUTHORIZED', 'User not found');
  if (userData.account_status !== 'active')
    throw new AuthError(403, 'ACCOUNT_INACTIVE', `Account is ${userData.account_status}`);

  // HARDENING-2026-09-25: server-side session-revocation check (same rationale
  // as bulk-action/create-user): a suspended-and-revoked admin whose JWT is
  // still unexpired must not be able to export reports until token expiry.
  const { data: sessionValid, error: sessionErr } = await supabase.rpc(
    'validate_user_session',
  );
  if (sessionErr || sessionValid !== true) {
    throw new AuthError(401, 'UNAUTHORIZED', 'Session revoked or invalid');
  }
  if (permission) {
    const { data: hasPermission } = await supabase.rpc('user_has_permission', {
      p_user_id: user.id,
      p_permission: permission,
      p_tenant_id: userData.tenant_id,
    });
    if (!hasPermission)
      throw new AuthError(403, 'PERMISSION_DENIED', `Missing permission: ${permission}`);
  }
  return {
    id: user.id,
    role: userData.primary_role,
    tenant_id: userData.tenant_id,
    token_version: userData.token_version,
  };
}

/**
 * Export Report Edge Function
 * Generates CSV reports from materialized views and uploads to Storage.
 * Returns a signed download URL.
 */

const VALID_REPORT_TYPES = ['user_stats', 'course_stats', 'activity'] as const;
type ReportType = (typeof VALID_REPORT_TYPES)[number];

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse(req, 'METHOD_NOT_ALLOWED', 'Only POST', 405);
  }

  try {
    // Authenticate
    const user = await requirePermission(req, 'reports.read');

    const body = await req.json();
    const reportType = body.report_type as ReportType;
    const requestedTenantId = body.tenant_id as string | undefined;
    if (requestedTenantId !== undefined && typeof requestedTenantId !== 'string') {
      return errorResponse(req, 'INVALID_TENANT', 'Invalid tenant identifier', 400);
    }
    const tenantId =
      user.role === 'super_admin' ? (requestedTenantId ?? user.tenant_id) : user.tenant_id;
    if (requestedTenantId && requestedTenantId !== tenantId) {
      return errorResponse(req, 'PERMISSION_DENIED', 'Cross-tenant reports are not permitted', 403);
    }
    const format = (body.format as string) ?? 'csv';
    if (format !== 'csv') {
      return errorResponse(req, 'INVALID_FORMAT', 'Only CSV reports are supported', 400);
    }

    if (!reportType || !VALID_REPORT_TYPES.includes(reportType)) {
      return errorResponse(
        req,
        'INVALID_REPORT_TYPE',
        `Must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
      );
    }

    const admin = getSupabaseAdmin();
    let csvContent: string;
    let filename: string;

    switch (reportType) {
      case 'user_stats': {
        // EXPORT-REPORT-BACKEND (2026-09-25): mv_user_stats lives in the
        // `private` schema, which PostgREST does not expose, so the previous
        // direct .from('mv_user_stats') query always failed with 500. Read
        // through the guarded RPC instead (tenant-pinned + reports.read
        // inside the body; the service-role path trusts this function's own
        // requirePermission validation above).
        const { data, error } = await admin.rpc('admin_export_user_stats', {
          p_tenant_id: tenantId ?? null,
        });
        if (error) throw error;
        csvContent = toCsv(Array.isArray(data) ? data : []);
        filename = `user-stats-${Date.now()}`;
        break;
      }
      case 'course_stats': {
        let q = admin.from('mv_course_stats').select('*');
        if (tenantId) q = q.eq('tenant_id', tenantId);
        const { data, error } = await q.order('enrolled', { ascending: false });
        if (error) throw error;

        // Enrich with course titles
        const courseIds = (data ?? []).map((d: { course_id: string }) => d.course_id);
        const { data: courses } = await admin
          .from('courses')
          .select('id, title')
          .in('id', courseIds);
        const titleMap = new Map(
          (courses ?? []).map((c: { id: string; title: string }) => [c.id, c.title]),
        );

        const enriched = (data ?? []).map((d: { course_id: string }) => ({
          ...d,
          title: titleMap.get(d.course_id) ?? 'Unknown',
        }));

        csvContent = toCsv(enriched);
        filename = `course-stats-${Date.now()}`;
        break;
      }
      case 'activity': {
        // EXPORT-REPORT-BACKEND (2026-09-25): mv_daily_activity does not
        // exist in any schema — the real table is
        // private.mv_daily_activity_30d (columns: activity_date,
        // unique_users, total_events, lesson_views, logins). The old query
        // also ordered by a nonexistent `hour_bucket` column. Use the
        // guarded RPC (orders by activity_date DESC internally).
        const { data, error } = await admin.rpc('admin_export_daily_activity', {
          p_tenant_id: tenantId ?? null,
        });
        if (error) throw error;
        csvContent = toCsv(Array.isArray(data) ? data : []);
        filename = `activity-${Date.now()}`;
        break;
      }
    }

    const ext = 'csv';
    const contentType = 'text/csv';
    const filePath = `reports/${user.tenant_id}/${filename}.${ext}`;

    // Ensure bucket exists
    try {
      await admin.storage.createBucket('reports', {
        public: false,
        fileSizeLimit: 52428800,
      });
    } catch {
      // Bucket likely already exists
    }

    const { error: uploadErr } = await admin.storage
      .from('reports')
      .upload(filePath, new Blob([csvContent], { type: contentType }), {
        contentType,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    const { data: signedUrl, error: signErr } = await admin.storage
      .from('reports')
      .createSignedUrl(filePath, 3600);

    if (signErr) throw signErr;

    // Log
    await admin.rpc('log_activity_async', {
      p_user_id: user.id,
      p_type: 'report_exported',
      p_details: {
        report_type: reportType,
        format: ext,
        tenant_id: tenantId,
      },
      p_risk_level: 'low',
      p_tenant_id: user.tenant_id,
    });

    return jsonResponse(req, {
      download_url: signedUrl.signedUrl,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      format: ext,
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      const authErr = err as { status: number; code: string; message: string };
      return errorResponse(
        req,
        authErr.code,
        authErr.status === 401
          ? 'Unauthorized'
          : authErr.status === 403
            ? 'Permission denied'
            : 'Request failed',
        authErr.status,
      );
    }
    console.error('export-report error:', err);
    return errorResponse(req, 'EXPORT_ERROR', 'Report export failed', 500);
  }
});

/**
 * Convert an array of objects to CSV string.
 */
function toCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const keys = Object.keys(data[0]!);
  const rows = [
    keys.join(','),
    ...data.map((row) =>
      keys
        .map((k) => {
          const val = row[k];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    ),
  ];
  return rows.join('\n');
}
