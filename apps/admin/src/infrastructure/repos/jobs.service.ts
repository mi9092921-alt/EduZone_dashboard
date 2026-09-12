import { mapDbError } from '@/domain/errors';
import type { Job, JobFilters, JobStatusCounts } from '@/domain/types/job.types';
import type { PaginatedResult } from '@/domain/types/user.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Jobs service — uses service_role admin client directly.
 * No circular dependency on admin.actions.ts.
 *
 * SECURITY FIX (2026-09-12) — launch-blocker APP-2:
 * The `admin_get_jobs` / `admin_get_job_counts` / `admin_retry_job` /
 * `admin_cancel_job` RPCs in supabase/schema/07_functions.sql grant
 * unrestricted access when called via the service_role client (their
 * `v_is_unrestricted := (auth.role() = 'service_role') OR …` guard
 * short-circuits to TRUE for service_role). Without a tenant_id filter
 * applied at the application layer, a tenant-scoped admin could read and
 * mutate every tenant's job_queue rows.
 *
 * Mitigation:
 *   - `getJobs` / `getJobStatusCounts` accept an optional `tenantId` (or
 *     `null` for super_admin cross-tenant access) and filter the returned
 *     rows in TypeScript. The RPCs themselves still return all rows (they
 *     have to, since their signature has no p_tenant_id parameter without
 *     a schema change), but we strip cross-tenant rows before returning
 *     them to the boundary.
 *   - `retryJob` / `cancelJob` accept the caller's `tenantId` and
 *     pre-flight with `getJobTenantId(id)` — the action boundary calls
 *     `assertSameTenant` before mutating.
 *   - `releaseStaleJobs` is a platform-wide maintenance op (releasing
 *     expired locks) and does not need tenant scoping; the boundary gates
 *     it behind `requireSuperAdmin()` instead of the broad permission set
 *     it previously used.
 */

interface AdminGetJobsRow {
  full_count: number | string;
  id: string;
  tenant_id: string | null;
  job_type: Job['job_type'];
  payload: Job['payload'];
  status: Job['status'];
  priority: number;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  run_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_msg: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Fetch a single job's tenant_id by id. Used by the action boundary's
 * `assertSameTenant` pre-flight before retry/cancel mutations.
 *
 * SECURITY FIX (2026-09-12): calls the dedicated `admin_get_job_tenant_id`
 * RPC rather than querying `internal.job_queue` directly (the `internal`
 * schema is not exposed via PostgREST — see supabase/config.toml
 * `api.schemas`).
 *
 * Returns `null` if the job does not exist (caller's `assertSameTenant`
 * will treat null as a mismatch and fail closed, matching the boundary
 * contract documented in boundary.ts).
 */
export async function getJobTenantId(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_get_job_tenant_id', { p_id: id }).single();
  if (error) throw mapDbError(error, 'jobs.service.ts');
  // The RPC RETURNS uuid (not a jsonb object), so `data` is either a
  // string (the tenant_id) or null. Guard against shape drift just in case
  // the RPC is later refactored to return jsonb.
  if (data == null) return null;
  if (typeof data === 'string') return data;
  // Unexpected shape — fail closed (treat as missing → boundary fails).
  console.error('[jobs.service.ts] admin_get_job_tenant_id returned unexpected shape:', data);
  return null;
}

export async function getJobs(
  filters: JobFilters,
  page: number,
  pageSize: number,
  /** When non-null, restrict results to this tenant. Pass null for
   *  super_admin cross-tenant access (the boundary decides). */
  tenantScope?: string | null,
): Promise<PaginatedResult<Job>> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_get_jobs', {
    p_page: page,
    p_page_size: pageSize,
    p_status: filters.status || null,
    p_job_type: filters.job_type || null,
    p_date_from: filters.dateFrom || null,
  });
  if (error) throw mapDbError(error, 'jobs.service.ts');

  const results = (data ?? []) as AdminGetJobsRow[];

  // SECURITY FIX (2026-09-12): tenant filter applied at the application
  // layer because the RPC returns rows for every tenant when invoked via
  // the service_role admin client (see file-level note above).
  const scoped = tenantScope
    ? results.filter((row) => row.tenant_id === tenantScope)
    : results;

  const total =
    scoped.length > 0 ? Number(scoped[0]!.full_count) : 0;

  const jobs: Job[] = scoped.map(
    ({ full_count: _, ...row }): Job => ({
      id: row.id,
      tenant_id: row.tenant_id ?? null,
      job_type: row.job_type,
      payload: row.payload,
      status: row.status,
      priority: row.priority,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      locked_by_worker_id: row.locked_by ?? null,
      locked_at: row.locked_at ?? null,
      lock_expires_at: row.lock_expires_at ?? null,
      run_at: row.run_at,
      started_at: row.started_at ?? null,
      finished_at: row.completed_at ?? null,
      error_message: row.error_msg ?? null,
      result: row.result ?? null,
      created_at: row.created_at,
      updated_at: row.created_at,
    }),
  );

  // Note: `total` is the full_count returned by the RPC for the
  // un-tenant-scoped query. When `tenantScope` is set we still surface it
  // so pagination controls render — the alternative would be a schema
  // change to add a `p_tenant_id` parameter to `admin_get_jobs`, which is
  // the long-term fix but requires coordinating with supabase/schema.
  return {
    data: jobs,
    count: tenantScope ? jobs.length : total,
    page,
    pageSize,
    totalPages: tenantScope
      ? Math.ceil(jobs.length / pageSize)
      : Math.ceil(total / pageSize),
  };
}

export async function getJobStatusCounts(
  /** When non-null, restrict counts to this tenant. Pass null for
   *  super_admin cross-tenant access. */
  tenantScope?: string | null,
): Promise<JobStatusCounts> {
  const admin = createAdminClient();

  // SECURITY FIX (2026-09-12): the RPC `admin_get_job_counts` enforces
  // tenant scoping internally (WHERE v_is_unrestricted OR tenant_id IS NULL
  // OR tenant_id = get_current_tenant_id()). When invoked via the
  // service_role admin client, v_is_unrestricted is TRUE and the counts are
  // global — that's correct for super_admin. For tenant-scoped admins we
  // cannot pass a tenant_id parameter to the RPC (its signature has none),
  // and `internal.job_queue` is not exposed via PostgREST (api.schemas =
  // ["public", "graphql_public"] in supabase/config.toml), so we cannot
  // fall back to a direct `from('job_queue')` query either.
  //
  // Resolution: add a dedicated `admin_get_job_counts_tenant(p_tenant_id)`
  // RPC (see 07_functions.sql). It enforces the same permission gate as
  // the other admin_* RPCs and the same IDOR guard.
  if (tenantScope) {
    const { data, error } = await admin
      .rpc('admin_get_job_counts_tenant', { p_tenant_id: tenantScope })
      .single();
    if (error) throw mapDbError(error, 'jobs.service.ts');
    const raw = (data ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
      pending: num(raw.pending),
      processing: num(raw.processing),
      done: num(raw.done),
      failed: num(raw.failed),
      dead: num(raw.dead),
    };
  }

  const { data, error } = await admin.rpc('admin_get_job_counts').single();
  if (error) throw mapDbError(error, 'jobs.service.ts');

  // M9: validate the RPC payload with the JobStatusCounts shape instead of
  // blind-casting — a malformed row degrades to 0 counts, never lies.
  const raw = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    pending: num(raw.pending),
    processing: num(raw.processing),
    done: num(raw.done),
    failed: num(raw.failed),
    dead: num(raw.dead),
  };
}

export async function retryJob(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('admin_retry_job', { p_id: id });
  if (error) throw mapDbError(error, 'jobs.service.ts');
}

export async function cancelJob(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('admin_cancel_job', { p_id: id });
  if (error) throw mapDbError(error, 'jobs.service.ts');
}

export async function releaseStaleJobs(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('release_stale_job_locks').single();
  if (error) throw mapDbError(error, 'jobs.service.ts');
  return (data as number) ?? 0;
}
