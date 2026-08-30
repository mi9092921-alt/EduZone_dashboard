import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import {
  retryJob,
  cancelJob,
  releaseStaleJobs,
} from '@/infrastructure/repos/jobs.service';

/**
 * Mutation hooks for job queue actions.
 */

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useReleaseStaleJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => releaseStaleJobs(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}
