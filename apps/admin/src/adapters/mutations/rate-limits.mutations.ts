import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import { toggleRateLimitRule, clearBlock } from '@/infrastructure/repos/rate-limits.service';

/**
 * Mutation hooks for rate limit actions.
 */

export function useToggleRateLimitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: string; isActive: boolean }) =>
      toggleRateLimitRule(vars.action, vars.isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rateLimits.rules });
    },
  });
}

export function useClearBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clearBlock(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rateLimits.active });
    },
  });
}
