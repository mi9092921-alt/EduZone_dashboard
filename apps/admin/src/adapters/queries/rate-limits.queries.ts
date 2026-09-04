import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import {
  getActiveBlocksAction,
  getRateLimitRulesAction,
  getTopOffendersAction,
} from '@/adapters/actions/admin.actions';

/**
 * React Query hooks for rate limits domain data.
 *
 * M-CLIENT-ADMIN: rate-limits.service.ts reads exclusively via the
 * service-role client (bypasses RLS) and must never be imported into
 * client-rendered code. Route through the tenant-scoped server actions.
 */

export function useActiveBlocks() {
  return useQuery({
    queryKey: queryKeys.rateLimits.active,
    queryFn: () => getActiveBlocksAction(),
    refetchInterval: 30_000,
  });
}

export function useRateLimitRules() {
  return useQuery({
    queryKey: queryKeys.rateLimits.rules,
    queryFn: () => getRateLimitRulesAction(),
  });
}

export function useTopOffenders() {
  return useQuery({
    queryKey: queryKeys.rateLimits.topOffenders,
    queryFn: () => getTopOffendersAction(),
    refetchInterval: 30_000,
  });
}
