/**
 * Tenant domain types — mirrors the `tenants` table schema.
 */

import type { Tenant as BaseTenant } from '@eduzone/types';

export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

// Counters removed from table in v13; use dashboard_stats_cache if needed
export type Tenant = BaseTenant;

export interface TenantFilters {
  search?: string | undefined;
  plan?: TenantPlan | undefined;
  status?: TenantStatus | undefined;
  region_id?: string | undefined;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  plan?: TenantPlan | undefined;
  region_id?: string | undefined;
  max_users?: number | undefined;
  max_courses?: number | undefined;
  max_storage_bytes?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface UpdateTenantInput {
  name?: string | undefined;
  plan?: TenantPlan | undefined;
  region_id?: string | undefined;
  max_users?: number | undefined;
  max_courses?: number | undefined;
  max_storage_bytes?: number | undefined;
  status?: TenantStatus | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/** v13: Full paginated result with page metadata */
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
