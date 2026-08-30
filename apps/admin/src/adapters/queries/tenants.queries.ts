import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { queryKeys } from './keys';

import type { AuditFilters } from '@/domain/types/audit.types';
import type { TenantFilters } from '@/domain/types/tenant.types';
import {
  getTenants,
  getTenantById,
  getTenantAuditLogs,
} from '@/infrastructure/repos/tenants.service';

export function useTenants(filters: TenantFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.tenants.list({ ...filters, page, pageSize }),
    queryFn: () => getTenants(filters, page, pageSize),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useTenantDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.tenants.detail(id),
    queryFn: () => getTenantById(id),
    enabled: !!id,
  });
}

export function useTenantAuditLogs(
  tenantId: string,
  filters: AuditFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: queryKeys.tenants.audit(tenantId, { ...filters, page, pageSize }),
    queryFn: () => getTenantAuditLogs(tenantId, filters, page, pageSize),
    enabled: !!tenantId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
