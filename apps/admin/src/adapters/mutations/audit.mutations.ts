import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import { flushActivityLogs } from '@/infrastructure/repos/audit.service';

/**
 * Mutation hooks for audit actions.
 */

export function useFlushActivityLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchSize: number) => flushActivityLogs(batchSize),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.audit.queue });
      qc.invalidateQueries({ queryKey: queryKeys.audit.all });
    },
  });
}
