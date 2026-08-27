import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import {
  getActivityLogs,
  getAuditChainState,
  getQueuedActivities,
} from '@/infrastructure/repos/audit.service';
import type { AuditFilters } from '@/domain/types/audit.types';

/**
 * React Query hooks for audit domain data.
 */

export function useActivityLogs(filters: AuditFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.audit.logs({ ...filters, page, pageSize }),
    queryFn: () => getActivityLogs(filters, page, pageSize),
    placeholderData: (prev) => prev,
  });
}

export function useAuditChainState() {
  return useQuery({
    queryKey: queryKeys.audit.chainState,
    queryFn: () => getAuditChainState(),
    staleTime: 30_000,
  });
}

export function useQueuedActivities(limit: number = 200) {
  return useQuery({
    queryKey: queryKeys.audit.queue,
    queryFn: () => getQueuedActivities(limit),
    refetchInterval: 5_000,
  });
}
