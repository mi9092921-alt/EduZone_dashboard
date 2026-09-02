import type { Job, JobFilters, JobStatusCounts } from '@/domain/types/job.types';
import type { PaginatedResult } from '@/domain/types/user.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Jobs service — uses service_role admin client directly.
 * No circular dependency on admin.actions.ts.
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
  created_at: string;
}

export async function getJobs(
  filters: JobFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Job>> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_get_jobs', {
    p_page: page,
    p_page_size: pageSize,
    p_status: filters.status || null,
    p_job_type: filters.job_type || null,
    p_date_from: filters.dateFrom || null,
  });
  if (error) throw error;

  const results = (data ?? []) as AdminGetJobsRow[];
  const total = results.length > 0 ? Number(results[0]!.full_count) : 0;

  const jobs: Job[] = results.map(
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
      created_at: row.created_at,
      updated_at: row.created_at,
    }),
  );

  return {
    data: jobs,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getJobStatusCounts(): Promise<JobStatusCounts> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_get_job_counts').single();
  if (error) throw error;

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
  if (error) throw error;
}

export async function cancelJob(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('admin_cancel_job', { p_id: id });
  if (error) throw error;
}

export async function releaseStaleJobs(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('release_stale_job_locks').single();
  if (error) throw error;
  return (data as number) ?? 0;
}
