import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getActivityLogsAction } from '@/adapters/actions/activities.actions';
import { getQueuedActivitiesAction } from '@/adapters/actions/admin.actions';
import type { AuditFilters } from '@/domain/types/audit.types';
import {
  getAuditChainState,
  getSecurityAlerts,
} from '@/infrastructure/repos/audit.service';

/**
 * React Query hooks for audit domain data.
 */

export function useActivityLogs(filters: AuditFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.audit.logs({ ...filters, page, pageSize }),
    // M-ACTIVITIES-FULL: activity_logs is partitioned with deny-all on child
    // partitions for authenticated — browser reads are incomplete. Route
    // through the tenant-scoped service-role server action instead.
    queryFn: () => getActivityLogsAction(filters, page, pageSize),
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
    // M-CLIENT-ADMIN: getQueuedActivities() reads via the service-role
    // client (bypasses RLS) and must never be called from browser code —
    // route through the tenant-scoped server action instead.
    queryFn: () => getQueuedActivitiesAction(limit),
    refetchInterval: 5_000,
  });
}

export function useSecurityAlerts(limit: number = 5) {
  return useQuery({
    queryKey: queryKeys.dashboard.securityAlerts,
    queryFn: () => getSecurityAlerts(limit),
    refetchInterval: 30_000,
  });
}
