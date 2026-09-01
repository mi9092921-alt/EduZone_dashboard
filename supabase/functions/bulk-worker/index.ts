// @ts-nocheck — Deno edge function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Inlined from _shared/cors.ts ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function errorResponse(
  code: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: code, message, ...extra }, status);
}

function requireServiceRole(req: Request): Response | null {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!expected || !authorization || authorization !== `Bearer ${expected}`) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }
  return null;
}

// --- Inlined from _shared/supabaseAdmin.ts ---
function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Bulk Worker Edge Function
 * Triggered by cron (60s) or HTTP to process bulk jobs from the queue.
 * Dequeues a job, fetches matching users, processes in batches of 50,
 * broadcasts progress via pg_notify, handles partial failures.
 */

const BATCH_SIZE = 50;
const LOCK_TTL_SECONDS = 1800; // 30 minutes

const BULK_JOB_TYPES = [
  'bulk_lock',
  'bulk_unlock',
  'bulk_suspend',
  'bulk_ban',
  'bulk_warn',
  'bulk_terminate_sessions',
  'bulk_reset_devices',
  'bulk_delete',
  'bulk_export',
];

/** Apply user filters — mirrors route.ts: user_ids override search/filters. */
function applyUserFilters(
  query: ReturnType<ReturnType<typeof getSupabaseAdmin>['from']>,
  f: Record<string, unknown>,
) {
  if (f.user_ids && Array.isArray(f.user_ids) && f.user_ids.length > 0) {
    query = query.in('id', f.user_ids as string[]);
    if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id as string);
    return query;
  }
  if (f.search) {
    query = query.or(
      `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
    );
  }
  if (f.primary_role) query = query.eq('primary_role', f.primary_role as string);
  if (f.account_status) query = query.eq('account_status', f.account_status as string);
  if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id as string);
  if (f.region_id) query = query.eq('region_id', f.region_id as string);
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
  const { error } = await admin.rpc('worker_update_bulk_job', {
    p_id: jobId,
    p_status: opts.status ?? null,
    p_error_message: opts.errorMessage ?? null,
    p_finished_at: opts.finishedAt ?? null,
    p_release_lock: opts.releaseLock ?? false,
  });
  if (error) throw new Error(`worker_update_bulk_job: ${error.message}`);
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceRoleError = requireServiceRole(req);
  if (serviceRoleError) return serviceRoleError;

  const admin = getSupabaseAdmin();
  let currentJobId: string | null = null;

  try {
    // ── Dequeue a job ────────────────────────────────────────
    const { data: jobs, error: dequeueErr } = await admin.rpc('dequeue_job', {
      p_worker_id: 'bulk-worker',
      p_job_types: BULK_JOB_TYPES,
      p_lock_ttl_seconds: LOCK_TTL_SECONDS,
    });

    if (dequeueErr) {
      console.error('dequeue_job error:', dequeueErr);
      return errorResponse('DEQUEUE_ERROR', 'Unable to dequeue bulk job', 500);
    }

    if (!jobs || jobs.length === 0) {
      return jsonResponse({ message: 'No jobs to process' });
    }

    const job = jobs[0];
    currentJobId = job.id as string;
    const payload = job.payload as {
      action: string;
      filters: Record<string, unknown>;
      params: Record<string, unknown>;
      initiator_id: string;
      estimated_count: number;
    };

    // Security boundary: the queued job row is authoritative for tenant scope.
    // Never trust a tenant_id embedded in client-derived payload/filter data.
    if (!job.tenant_id) {
      throw new Error('Bulk job is missing tenant scope');
    }

    payload.filters = {
      ...(payload.filters ?? {}),
      tenant_id: job.tenant_id,
    };

    console.log(`Processing job ${job.id}: ${job.job_type}`, {
      action: payload.action,
      tenant_id: job.tenant_id,
      initiator_id: payload.initiator_id,
    });

    // ── Handle export separately ─────────────────────────────
    if (job.job_type === 'bulk_export') {
      // Delegate to bulk-export function
      const exportUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/bulk-export`;
      const res = await fetch(exportUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ job_id: job.id, payload }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Export delegation failed: ${errText}`);
      }

      return jsonResponse({ processed: job.id, type: 'export_delegated' });
    }

    // ── Fetch user IDs matching filters ──────────────────────
    let userQuery = admin.from('users').select('id').is('deleted_at', null);

    userQuery = applyUserFilters(userQuery, payload.filters);

    const { data: userRows, error: usersErr } = await userQuery.limit(500);
    if (usersErr) throw usersErr;

    const userIds: string[] = (userRows ?? []).map((u: { id: string }) => u.id);
    const total = userIds.length;
    let processed = 0;
    const failedIds: string[] = [];

    // ── Process in batches ───────────────────────────────────
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      for (const userId of batch) {
        try {
          await processAction(admin, payload.action, userId, payload.params, payload.initiator_id);
          processed++;
        } catch (err) {
          console.error(`Failed for user ${userId}:`, err);
          failedIds.push(userId);
          processed++;
        }
      }

      // ── Broadcast progress via pg_notify ─────────────────
      await admin.rpc('log_activity_async', {
        p_user_id: payload.initiator_id,
        p_type: 'bulk_action_progress',
        p_details: {
          job_id: job.id,
          processed,
          total,
          failed_count: failedIds.length,
        },
        p_risk_level: 'low',
      });

      // Update job payload with progress
      await updateBulkJob(admin, job.id as string, {
        errorMessage: JSON.stringify({
          processed,
          total,
          failed: failedIds.length,
          succeeded: processed - failedIds.length,
          failed_ids: failedIds,
          in_progress: true,
        }),
      });
    }

    // ── Mark job as done ─────────────────────────────────────
    const result = {
      processed,
      succeeded: processed - failedIds.length,
      failed: failedIds.length,
      total,
      failed_ids: failedIds,
    };

    await updateBulkJob(admin, job.id as string, {
      status: 'done',
      finishedAt: new Date().toISOString(),
      errorMessage: JSON.stringify(result),
      releaseLock: true,
    });

    // ── Log completion ───────────────────────────────────────
    await admin.rpc('log_activity_async', {
      p_user_id: payload.initiator_id,
      p_type: 'bulk_action_completed',
      p_details: {
        job_id: job.id,
        action: payload.action,
        ...result,
      },
      p_risk_level: failedIds.length > 0 ? 'medium' : 'low',
    });

    return jsonResponse({
      job_id: job.id,
      ...result,
    });
  } catch (err) {
    console.error('bulk-worker fatal error:', err);

    if (currentJobId) {
      try {
        const { error: failErr } = await admin.rpc('worker_fail_bulk_job', {
          p_id: currentJobId,
          p_error_message: JSON.stringify({ error: String(err) }),
        });
        if (failErr) console.error('worker_fail_bulk_job error:', failErr);
      } catch (releaseErr) {
        console.error('Failed to release job after worker error:', releaseErr);
      }
    }

    return errorResponse('WORKER_ERROR', 'Bulk worker failed', 500);
  }
});

/**
 * Execute a single action against a single user.
 */
async function processAction(
  admin: ReturnType<typeof getSupabaseAdmin>,
  action: string,
  userId: string,
  params: Record<string, unknown>,
  initiatorId: string,
): Promise<void> {
  switch (action) {
    case 'lock': {
      const { error } = await admin.rpc('worker_control_user_account', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
        p_action: 'lock',
        p_reason: (params.reason as string) ?? 'Bulk lock operation',
      });
      if (error) throw error;
      break;
    }
    case 'unlock': {
      const { error } = await admin.rpc('worker_control_user_account', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
        p_action: 'unlock',
      });
      if (error) throw error;
      break;
    }
    case 'suspend': {
      const { error } = await admin.rpc('worker_control_user_account', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
        p_action: 'suspend',
        p_reason: (params.reason as string) ?? 'Bulk suspend operation',
        p_suspend_hours: (params.suspend_hours as number) ?? 24,
      });
      if (error) throw error;
      break;
    }
    case 'ban': {
      const { error } = await admin.rpc('worker_control_user_account', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
        p_action: 'ban',
        p_reason: (params.reason as string) ?? 'Bulk ban operation',
      });
      if (error) throw error;
      break;
    }
    case 'warn': {
      const { error } = await admin.rpc('worker_issue_warning', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
        p_reason: (params.reason as string) ?? 'Bulk warning',
        p_severity: (params.severity as number) ?? 1,
      });
      if (error) throw error;
      break;
    }
    case 'terminate_sessions': {
      const { error } = await admin.rpc('worker_terminate_user_sessions', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
        p_reason: (params.reason as string) ?? 'Bulk session termination',
      });
      if (error) throw error;
      break;
    }
    case 'reset_devices': {
      const { error } = await admin.rpc('worker_reset_user_device', {
        p_initiator_id: initiatorId,
        p_user_id: userId,
      });
      if (error) throw error;
      break;
    }
    case 'delete': {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      await admin
        .from('users')
        .update({
          deleted_at: new Date().toISOString(),
          account_status: 'banned',
        })
        .eq('id', userId);
      if (deleteError && !deleteError.message.includes('not found')) {
        throw deleteError;
      }
      break;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
