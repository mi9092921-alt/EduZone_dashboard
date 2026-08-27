import {
  getJobsAction,
  getJobStatusCountsAction,
  retryJobAction,
  cancelJobAction,
  releaseStaleJobsAction,
} from '@/application/actions/admin.actions';
import type { Job, JobFilters, JobStatusCounts } from '@/domain/types/job.types';
import type { PaginatedResult } from '@/domain/types/user.types';

/**
 * Jobs service — all calls delegate to server actions that use the admin
 * (service-role) client, bypassing the session-guarded RPCs.
 */

export async function getJobs(
  filters: JobFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Job>> {
  return getJobsAction(filters, page, pageSize);
}

export async function getJobStatusCounts(): Promise<JobStatusCounts> {
  return getJobStatusCountsAction();
}

export async function retryJob(id: string): Promise<void> {
  return retryJobAction(id);
}

export async function cancelJob(id: string): Promise<void> {
  return cancelJobAction(id);
}

export async function releaseStaleJobs(): Promise<number> {
  return releaseStaleJobsAction();
}
