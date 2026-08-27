import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import {
  getActiveBlocks,
  getRateLimitRules,
  getTopOffenders,
} from '@/infrastructure/repos/rate-limits.service';

/**
 * React Query hooks for rate limits domain data.
 */

export function useActiveBlocks() {
  return useQuery({
    queryKey: queryKeys.rateLimits.active,
    queryFn: () => getActiveBlocks(),
    refetchInterval: 30_000,
  });
}

export function useRateLimitRules() {
  return useQuery({
    queryKey: queryKeys.rateLimits.rules,
    queryFn: () => getRateLimitRules(),
  });
}

export function useTopOffenders() {
  return useQuery({
    queryKey: queryKeys.rateLimits.topOffenders,
    queryFn: () => getTopOffenders(),
    refetchInterval: 30_000,
  });
}
