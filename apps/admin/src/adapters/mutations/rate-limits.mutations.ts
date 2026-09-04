import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  toggleRateLimitRuleAction,
  clearRateLimitBlockAction,
} from '@/adapters/actions/admin.actions';
import { queryKeys } from '@/adapters/queries/keys';

/**
 * Mutation hooks for rate limit actions.
 *
 * M-CLIENT-ADMIN: rate-limits.service.ts writes exclusively via the
 * service-role client (bypasses RLS) and must never be imported into
 * client-rendered code. Route through the server actions — clearBlock in
 * particular is tenant-guarded via assertSameTenant in
 * clearRateLimitBlockAction.
 */

export function useToggleRateLimitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: string; isActive: boolean }) =>
      toggleRateLimitRuleAction(vars.action, vars.isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rateLimits.rules });
    },
  });
}

export function useClearBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clearRateLimitBlockAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rateLimits.active });
    },
  });
}
