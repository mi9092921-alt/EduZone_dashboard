// @ts-nocheck — Deno edge function, not processed by project's TS config
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS & Responses ──────────────────────────────────────────
// FIX (release blocker — applied 2026-09-12): wildcard CORS on authenticated
// endpoints allowed any origin to invoke this function with a victim's
// session cookie/JWT. We now reflect only the request Origin if it appears
// in the explicit allow-list (Supabase project URL + dashboard origin(s)).
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
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

// ── Supabase Admin ────────────────────────────────────────────
function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── Auth & Permissions ────────────────────────────────────────
class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

async function requirePermission(req: Request, permission?: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
  }

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
  if (userData.account_status !== 'active') {
    throw new AuthError(403, 'ACCOUNT_INACTIVE', `Account is ${userData.account_status}`);
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

  return { id: user.id, role: userData.primary_role, tenant_id: userData.tenant_id };
}

/** Valid bulk actions */
const VALID_ACTIONS = [
  'lock',
  'unlock',
  'suspend',
  'ban',
  'warn',
  'terminate_sessions',
  'reset_devices',
  'export',
  'delete',
] as const;

type BulkAction = (typeof VALID_ACTIONS)[number];

/** Permission required per action */
const ACTION_PERMISSIONS: Record<BulkAction, string> = {
  lock: 'users.lock',
  unlock: 'users.lock',
  suspend: 'users.lock',
  ban: 'users.lock',
  warn: 'warnings.write',
  terminate_sessions: 'users.write',
  reset_devices: 'users.write',
  export: 'users.read',
  delete: 'users.write',
};

/** Max records per bulk operation */
const MAX_BULK_SIZE = 500;
// PERF-03 FIX: the dead `MAX_PENDING_JOBS = 10_000` constant was removed.
// The only real queue cap lives inside the admin_enqueue_bulk_job RPC (per
// tenant, since the PERF-03 fairness fix) — duplicating a different number
// here invited drift between the two layers. JOB_QUEUE_FULL arrives from
// the RPC and is surfaced verbatim below.

interface BulkRequest {
  action: BulkAction;
  filters: Record<string, unknown>;
  params?: Record<string, unknown>;
  dry_run: boolean;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse(req, 'METHOD_NOT_ALLOWED', 'Only POST is accepted', 405);
  }

  try {
    // ── Parse and validate body ──────────────────────────────
    const body = (await req.json()) as BulkRequest;

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(
        req,
        'INVALID_ACTION',
        `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
      );
    }

    if (!body.filters || typeof body.filters !== 'object') {
      return errorResponse(req, 'INVALID_FILTERS', 'filters must be an object');
    }

    // ── Authenticate + authorize ─────────────────────────────
    const permission = ACTION_PERMISSIONS[body.action];
    const user = await requirePermission(req, permission);

    // ── Build user query with filters ────────────────────────
    const admin = getSupabaseAdmin();

    let query = admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    // Apply filters (same pattern as users.service.ts)
    const f = { ...body.filters };

    if (f.search !== undefined) {
      if (typeof f.search !== 'string' || f.search.length > 100 || /[,()]/.test(f.search)) {
        return errorResponse(req, 'INVALID_FILTERS', 'Invalid search filter');
      }
    }
    if (
      f.user_ids !== undefined &&
      (!Array.isArray(f.user_ids) ||
        f.user_ids.length > MAX_BULK_SIZE ||
        f.user_ids.some((id) => typeof id !== 'string'))
    ) {
      return errorResponse(req, 'INVALID_FILTERS', 'Invalid user_ids filter');
    }

    // Tenant scope is derived from the authenticated database profile. A
    // caller may only override it when the server-side primary role is the
    // explicit cross-tenant super_admin role.
    if (f.tenant_id !== undefined && typeof f.tenant_id !== 'string') {
      return errorResponse(req, 'INVALID_FILTERS', 'Invalid tenant_id filter');
    }
    if (
      f.tenant_id !== undefined &&
      f.tenant_id !== user.tenant_id &&
      user.role !== 'super_admin'
    ) {
      return errorResponse(req, 'PERMISSION_DENIED', 'Cross-tenant bulk actions are not permitted', 403);
    }
    if (user.role !== 'super_admin') {
      f.tenant_id = user.tenant_id;
    }

    if (f.search) {
      query = query.or(
        `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
      );
    }
    if (f.primary_role) query = query.eq('primary_role', f.primary_role);
    if (f.account_status) query = query.eq('account_status', f.account_status);
    if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id);
    if (f.region_id) query = query.eq('region_id', f.region_id);
    if (f.user_ids && Array.isArray(f.user_ids)) {
      query = query.in('id', f.user_ids);
    }

    const { count: estimatedCount, error: countErr } = await query;
    if (countErr) {
      console.error('bulk-action count query failed', countErr);
      return errorResponse(req, 'INVALID_FILTERS', 'Unable to evaluate filters', 400, { count: 0 });
    }

    const count = estimatedCount ?? 0;

    if (count === 0) {
      return errorResponse(req, 'INVALID_FILTERS', 'No users match the given filters', 400, {
        count: 0,
      });
    }

    // ── Dry run → return count only ──────────────────────────
    if (body.dry_run) {
      return jsonResponse(req, { estimated_count: count, dry_run: true });
    }

    // ── Submit → validate limits ─────────────────────────────
    if (count > MAX_BULK_SIZE) {
      return errorResponse(
        req,
        'PAYLOAD_TOO_LARGE',
        `Bulk operations are limited to ${MAX_BULK_SIZE} users. Found ${count}.`,
        400,
        { max: MAX_BULK_SIZE, count },
      );
    }

    // Check job queue isn't full
    // ── Insert job into queue ────────────────────────────────
    const jobType = body.action === 'export' ? 'bulk_export' : `bulk_${body.action}`;

    const { data: job, error: insertErr } = await admin.rpc('admin_enqueue_bulk_job', {
      p_job_type: jobType,
      p_payload: {
        action: body.action,
        filters: f,
        params: body.params ?? {},
        initiator_id: user.id,
        estimated_count: count,
      },
      p_initiator_id: user.id,
    });

    if (insertErr) {
      if (insertErr.message?.includes('JOB_QUEUE_FULL')) {
        return errorResponse(
          req,
          'JOB_QUEUE_FULL',
          'Too many pending jobs. Please try again later.',
          429,
        );
      }
      if (insertErr.message?.includes('uq_job_dedupe')) {
        return errorResponse(
          req,
          'DUPLICATE_JOB',
          'An identical bulk action is already processing. Please wait for it to finish.',
          409,
        );
      }
      console.error('bulk-action queue insert failed', insertErr);
      return errorResponse(req, 'QUEUE_ERROR', 'Unable to queue bulk action', 500);
    }

    // ── Log the activity ─────────────────────────────────────
    await admin.rpc('log_activity_async', {
      p_user_id: user.id,
      p_type: 'bulk_action_queued',
      p_details: {
        action: body.action,
        estimated_count: count,
        job_id: job.id,
        filters: f,
      },
      p_risk_level: 'medium',
      p_tenant_id: user.tenant_id,
    });

    // ── Return 202 Accepted ──────────────────────────────────
    return jsonResponse(
      req,
      {
        job_id: job.id,
        estimated_count: count,
        status: job.status,
        created_at: job.created_at,
      },
      202,
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(req, err.code, err.message, err.status);
    }
    console.error('bulk-action error:', err);
    return errorResponse(req, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
