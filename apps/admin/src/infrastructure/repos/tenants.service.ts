import { container } from '@/container';
import type {
  Tenant,
  TenantFilters,
  CreateTenantInput,
  UpdateTenantInput,
  PaginatedResult,
} from '@/domain/types/tenant.types';
import type { ActivityLog, AuditFilters } from '@/domain/types/audit.types';
import {
  createTenantAction,
  updateTenantAction,
  suspendTenantAction,
  deleteTenantAction,
} from '@/application/actions/tenants.actions';

type TenantWithUsage = Tenant & {
  current_users: number;
  current_courses: number;
  current_storage_bytes: number;
};

async function withTenantUsage(tenants: Tenant[]): Promise<TenantWithUsage[]> {
  const { supabase } = container;

  return Promise.all(
    tenants.map(async (tenant) => {
      const [usersRes, coursesRes] = await Promise.all([
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null),
        supabase
          .from('courses')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .is('deleted_at', null),
      ]);

      return {
        ...tenant,
        current_users: usersRes.count ?? 0,
        current_courses: coursesRes.count ?? 0,
        current_storage_bytes: 0,
      };
    }),
  );
}

/**
 * Tenants service — all Supabase queries for tenant management.
 * Super-admin only.
 */

// ── List tenants (paginated + filtered) ─────────────────────────
export async function getTenants(
  filters: TenantFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Tenant>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('tenants')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`);
  }
  if (filters.plan) query = query.eq('plan', filters.plan);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.region_id) query = query.eq('region_id', filters.region_id);

  const { data, count, error } = await query;
  if (error) throw error;

  const total = count ?? 0;
  const tenants = await withTenantUsage((data ?? []) as Tenant[]);

  return {
    data: tenants,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── Get single tenant ───────────────────────────────────────────
export async function getTenantById(id: string): Promise<Tenant> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  const [tenant] = await withTenantUsage([data as Tenant]);
  return tenant as Tenant;
}

// ── Create tenant ───────────────────────────────────────────────
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  // Always use the server action (service role) to bypass RLS
  return createTenantAction(input);
}

// ── Update tenant ───────────────────────────────────────────────
export async function updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant> {
  // Always use the server action (service role) to bypass RLS
  return updateTenantAction(id, input);
}

// ── Suspend tenant ──────────────────────────────────────────────
export async function suspendTenant(id: string, reason: string): Promise<void> {
  // Always use the server action (service role) to bypass RLS
  return suspendTenantAction(id, reason);
}

// ── Soft delete tenant ──────────────────────────────────────────
export async function deleteTenant(id: string): Promise<void> {
  // Always use the server action (service role) to bypass RLS
  return deleteTenantAction(id);
}

// ── Tenant audit logs ───────────────────────────────────────────
export async function getTenantAuditLogs(
  tenantId: string,
  filters: AuditFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<ActivityLog>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.activity_type && filters.activity_type.length > 0) {
    query = query.in('activity_type', filters.activity_type);
  }
  if (filters.risk_level && filters.risk_level.length > 0) {
    query = query.in('risk_level', filters.risk_level);
  }
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

  const { data, count, error } = await query;
  if (error) throw error;

  const total = count ?? 0;
  return {
    data: (data ?? []) as ActivityLog[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
