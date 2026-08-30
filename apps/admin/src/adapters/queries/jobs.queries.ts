import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import type { JobFilters } from '@/domain/types/job.types';
import {
  getJobs,
  getJobStatusCounts,
} from '@/infrastructure/repos/jobs.service';

/**
 * React Query hooks for job queue domain data.
 */

export function useJobs(filters: JobFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.jobs.list({ ...filters, page, pageSize }),
    queryFn: () => getJobs(filters, page, pageSize),
    placeholderData: (prev) => prev,
  });
}

export function useJobStatusCounts() {
  return useQuery({
    queryKey: queryKeys.jobs.statusCounts,
    queryFn: () => getJobStatusCounts(),
    refetchInterval: 10_000,
  });
}
