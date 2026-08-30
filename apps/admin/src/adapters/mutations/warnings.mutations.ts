import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import { issueWarningAction } from '@/application/actions/user.actions';
import type { IssueWarningInput } from '@/domain/types/warning.types';

/**
 * Mutation hooks for warning management.
 */

export function useIssueWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: IssueWarningInput) => {
      const result = await issueWarningAction(
        data.user_id,
        data.reason,
        data.severity as 1 | 2 | 3,
        data.action,
      );
      if (!result.success) throw new Error(result.error);
      return result.warningId;
    },
    onSuccess: (_warningId, data) => {
      qc.invalidateQueries({ queryKey: queryKeys.warnings.all });
      qc.invalidateQueries({ queryKey: queryKeys.users.warnings(data.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(data.user_id) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
