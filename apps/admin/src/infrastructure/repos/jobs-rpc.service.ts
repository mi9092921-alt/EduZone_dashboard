import type { SupabaseClient } from '@supabase/supabase-js';

import { mapDbError } from '@/domain/errors';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Jobs RPC service (M11 — RPC Boundary).
 *
 * Owns the admin_* job-queue RPC call sites that previously lived directly
 * inside the bulk-action API route. The route now depends on these wrappers,
 * keeping .rpc() call sites inside infrastructure (see rpc-catalog.ts).
 *
 * All functions here MUST be called with a service-role (admin) client.
 */

export async function enqueueBulkJob(
  admin: SupabaseClient,
  jobType: string,
  payload: Record<string, unknown>,
  initiatorId: string,
): Promise<{ id: string; created_at: string }> {
  const { data: job, error } = await admin.rpc('admin_enqueue_bulk_job', {
    p_job_type: jobType,
    p_payload: payload,
    p_initiator_id: initiatorId,
  });

  if (error) {
    if (error.message.includes('JOB_QUEUE_FULL')) {
      throw mapDbError({ code: 'JOB_QUEUE_FULL', message: 'Too many pending jobs' }, 'bulk-action');
    }
    if (error.message.includes('uq_job_dedupe')) {
      throw mapDbError(
        { code: 'DUPLICATE_JOB', message: 'An identical job is already processing' },
        'bulk-action',
      );
    }
    throw mapDbError(error, 'jobs-rpc.service.ts:admin_enqueue_bulk_job');
  }

  return job as { id: string; created_at: string };
}

export async function workerUpdateBulkJob(
  admin: SupabaseClient,
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
  if (error) throw mapDbError(error, 'jobs-rpc.service.ts:worker_update_bulk_job');
}

/**
 * M16 (F16-1): atomic bulk warning — inserts the warning row and bumps the
 * target user's warning_count with a relative increment in one SQL statement.
 * The function re-verifies the initiator's warnings.write permission and
 * tenant server-side, so concurrent bulk runs can no longer lose increments
 * (the previous read-modify-write path wrote back a snapshotted count).
 */
export async function workerIssueWarning(
  admin: SupabaseClient,
  input: {
    initiatorId: string;
    userId: string;
    reason: string;
    severity: number;
  },
): Promise<void> {
  const { error } = await admin.rpc('worker_issue_warning', {
    p_initiator_id: input.initiatorId,
    p_user_id: input.userId,
    p_reason: input.reason,
    p_severity: input.severity,
  });
  if (error) throw mapDbError(error, 'jobs-rpc.service.ts:worker_issue_warning');
}

export async function logActivityAsync(
  admin: SupabaseClient,
  input: {
    userId: string;
    type: string;
    details: Record<string, unknown>;
    riskLevel?: string;
    tenantId?: string | null;
  },
): Promise<void> {
  const { error } = await admin.rpc('log_activity_async', {
    p_user_id: input.userId,
    p_type: input.type,
    p_details: input.details,
    p_risk_level: input.riskLevel ?? 'low',
    p_tenant_id: input.tenantId ?? null,
  });
  if (error) throw mapDbError(error, 'jobs-rpc.service.ts:log_activity_async');
}

export async function userHasPermission(
  client: SupabaseClient,
  userId: string,
  permission: string,
  tenantId: string | null,
): Promise<boolean> {
  const { data: hasPerm, error } = await client.rpc('user_has_permission', {
    p_user_id: userId,
    p_permission: permission,
    p_tenant_id: tenantId,
  });
  if (error) throw mapDbError(error, 'jobs-rpc.service.ts:user_has_permission');
  return hasPerm === true;
}

export async function logUserHasPermissionSafe(
  client: SupabaseClient,
  userId: string,
  permission: string,
  tenantId: string | null,
): Promise<boolean | null> {
  // Non-throwing variant for authorization gates that must degrade to "deny".
  const { data: hasPerm, error } = await client.rpc('user_has_permission', {
    p_user_id: userId,
    p_permission: permission,
    p_tenant_id: tenantId,
  });
  if (error) return null;
  return hasPerm === true;
}

// ── Cron routine RPCs (service-role only) ─────────────────────────

export async function managePartitions(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.rpc('manage_partitions');
  if (error) throw mapDbError(error, 'cron-rpc.service.ts:manage_partitions');
}

export async function pruneExpiredAccessCache(admin: SupabaseClient): Promise<unknown> {
  const { data, error } = await admin.rpc('prune_expired_access_cache');
  if (error) throw mapDbError(error, 'cron-rpc.service.ts:prune_expired_access_cache');
  return data;
}

export async function processUpdateEnrollmentTotalsJobs(
  admin: SupabaseClient,
  limit: number,
): Promise<unknown> {
  const { data, error } = await admin.rpc('process_update_enrollment_totals_jobs', {
    p_limit: limit,
  });
  if (error) throw mapDbError(error, 'cron-rpc.service.ts:process_update_enrollment_totals_jobs');
  return data;
}

export async function processCachePurges(
  admin: SupabaseClient,
  workerId: string,
  limit: number,
): Promise<unknown> {
  const { data, error } = await admin.rpc('process_cache_purges', {
    p_worker_id: workerId,
    p_limit: limit,
  });
  if (error) throw mapDbError(error, 'cron-rpc.service.ts:process_cache_purges');
  return data;
}

export async function processNotificationFanoutJobs(
  admin: SupabaseClient,
  workerId: string,
  limit: number,
): Promise<unknown> {
  const { data, error } = await admin.rpc('process_notification_fanout_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
  });
  if (error) throw mapDbError(error, 'cron-rpc.service.ts:process_notification_fanout_jobs');
  return data;
}

/**
 * Creates the default admin client for this service (exported so route
 * handlers keep a single construction site).
 */
export function jobsAdminClient(): SupabaseClient {
  return createAdminClient();
}
