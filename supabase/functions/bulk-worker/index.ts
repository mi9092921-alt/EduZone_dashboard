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
/** Hard ceiling per job — mirrors MAX_BULK_SIZE in bulk-action (PERF-04). */
const MAX_USERS_PER_JOB = 500;

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
    /** PERF-02 FIX: structured progress/outcome → job_queue.result */
    result?: unknown;
    /** PERF-02 FIX: clear error_message when writing progress/outcome */
    clearErrorMessage?: boolean;
  },
): Promise<void> {
  const { error } = await admin.rpc('worker_update_bulk_job', {
    p_id: jobId,
    p_status: opts.status ?? null,
    p_error_message: opts.errorMessage ?? null,
    p_finished_at: opts.finishedAt ?? null,
    p_release_lock: opts.releaseLock ?? false,
    p_result: opts.result ?? null,
    p_clear_error_message: opts.clearErrorMessage ?? false,
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
    // PERF-04 FIX (T4): re-verify the real filter size right before
    // processing. payload.estimated_count was snapshotted at submit time;
    // if the filter grew past MAX_USERS_PER_JOB between submit and run,
    // process the first MAX_USERS_PER_JOB and record `truncated` + the
    // remaining count in result instead of silently dropping users.
    let countQuery = admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    countQuery = applyUserFilters(countQuery, payload.filters);
    const { count: actualCount, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    const totalMatching = actualCount ?? 0;
    const truncated = totalMatching > MAX_USERS_PER_JOB;
    const remaining = truncated ? totalMatching - MAX_USERS_PER_JOB : 0;
    if (truncated) {
      console.warn(
        `Job ${job.id}: filter matched ${totalMatching} users (> ${MAX_USERS_PER_JOB}); ` +
          `processing the first ${MAX_USERS_PER_JOB}, ${remaining} remain (truncated).`,
      );
    }

    let userQuery = admin.from('users').select('id').is('deleted_at', null);

    userQuery = applyUserFilters(userQuery, payload.filters);

    const { data: userRows, error: usersErr } = await userQuery.limit(MAX_USERS_PER_JOB);
    if (usersErr) throw usersErr;

    // PERF-02 FIX (T2): resume from the checkpoint. On a retry the job row
    // carries result.succeeded_ids from the previous (crashed) run — skip
    // those users so actions like `warn` are never double-applied (F-02).
    // admin_retry_job / release_stale_job_locks deliberately preserve
    // `result`, which is what makes this checkpoint survive retries.
    const previousResult = (job.result ?? null) as { succeeded_ids?: unknown } | null;
    const alreadySucceeded = new Set<string>(
      Array.isArray(previousResult?.succeeded_ids)
        ? (previousResult.succeeded_ids as string[])
        : [],
    );

    const userIds: string[] = ((userRows ?? []) as Array<{ id: string }>)
      .map((u: { id: string }) => u.id)
      .filter((id: string) => !alreadySucceeded.has(id));

    const total = userIds.length;
    let processed = 0;
    const succeededIds: string[] = [...alreadySucceeded];
    const failedIds: string[] = [];

    // ── Process in batches (parallel within each batch) ──────
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      // PERF-07 FIX: Promise.allSettled instead of a serial for..of — a
      // 50-user batch costs ≈ one RPC round trip instead of 50, directly
      // reducing the odds of hitting the Edge Function wall clock (F-01).
      // A per-user failure stays isolated inside its own settled result.
      const settled = await Promise.allSettled(
        batch.map((userId) =>
          processAction(admin, payload.action, userId, payload.params, payload.initiator_id),
        ),
      );

      settled.forEach((outcome, idx) => {
        const userId = batch[idx]!;
        processed++;
        if (outcome.status === 'fulfilled') {
          succeededIds.push(userId);
        } else {
          console.error(`Failed for user ${userId}:`, outcome.reason);
          failedIds.push(userId);
        }
      });

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

      // PERF-02 FIX: progress + checkpoint go to the dedicated `result`
      // column (error_message stays reserved for fatal errors), and
      // succeeded_ids lands incrementally so a crash between batches resumes
      // cleanly after release_stale_job_locks / retry.
      await updateBulkJob(admin, job.id as string, {
        result: {
          processed,
          total,
          succeeded: succeededIds.length,
          failed: failedIds.length,
          succeeded_ids: succeededIds,
          failed_ids: failedIds,
          in_progress: true,
          truncated,
          ...(truncated ? { remaining } : {}),
        },
        clearErrorMessage: true,
      });
    }

    // ── Mark job as done ─────────────────────────────────────
    const result = {
      processed,
      succeeded: succeededIds.length,
      failed: failedIds.length,
      total,
      succeeded_ids: succeededIds,
      failed_ids: failedIds,
      truncated,
      ...(truncated ? { remaining } : {}),
    };

    await updateBulkJob(admin, job.id as string, {
      status: 'done',
      finishedAt: new Date().toISOString(),
      result,
      clearErrorMessage: true,
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
