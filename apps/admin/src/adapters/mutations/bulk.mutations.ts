import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import type { BulkAction } from '@/domain/types/bulk.types';
import type { UserFilters } from '@/domain/types/user.types';
import {
  submitBulkAction,
  cancelBulkJob,
} from '@/infrastructure/repos/bulk.service';

/**
 * Mutation hooks for bulk operations.
 */

export function useSubmitBulkAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      action: BulkAction;
      filters: UserFilters;
      selectedIds?: string[];
      params?: Record<string, unknown>;
    }) => submitBulkAction(vars.action, vars.filters, vars.selectedIds, vars.params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      qc.invalidateQueries({ queryKey: queryKeys.warnings.all });
      qc.invalidateQueries({ queryKey: queryKeys.analytics.dashboard });
      qc.invalidateQueries({ queryKey: queryKeys.audit.all });
    },
  });
}

export function useCancelBulkJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => cancelBulkJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      qc.invalidateQueries({ queryKey: queryKeys.analytics.dashboard });
    },
  });
}
