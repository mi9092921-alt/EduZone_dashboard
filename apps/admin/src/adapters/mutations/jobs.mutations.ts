import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  retryJobAction,
  cancelJobAction,
  releaseStaleJobsAction,
} from '@/adapters/actions/admin.actions';
import { queryKeys } from '@/adapters/queries/keys';

/**
 * Mutation hooks for job queue actions.
 *
 * M-CLIENT-ADMIN: jobs.service.ts writes exclusively via the
 * service-role client (bypasses RLS) and must never be imported into
 * client-rendered code. Route through the server actions instead.
 */

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryJobAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelJobAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

export function useReleaseStaleJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => releaseStaleJobsAction(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}
