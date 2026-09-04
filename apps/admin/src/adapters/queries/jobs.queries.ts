import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getJobsAction, getJobStatusCountsAction } from '@/adapters/actions/admin.actions';
import type { JobFilters } from '@/domain/types/job.types';

/**
 * React Query hooks for job queue domain data.
 *
 * M-CLIENT-ADMIN: jobs.service.ts reads exclusively via the service-role
 * client (bypasses RLS) and must never be imported into client-rendered
 * code — it throws at runtime in the browser. Route through the server
 * actions, which already exist in admin.actions.ts.
 */

export function useJobs(filters: JobFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.jobs.list({ ...filters, page, pageSize }),
    queryFn: () => getJobsAction(filters, page, pageSize),
    placeholderData: (prev) => prev,
  });
}

export function useJobStatusCounts() {
  return useQuery({
    queryKey: queryKeys.jobs.statusCounts,
    queryFn: () => getJobStatusCountsAction(),
    refetchInterval: 10_000,
  });
}
