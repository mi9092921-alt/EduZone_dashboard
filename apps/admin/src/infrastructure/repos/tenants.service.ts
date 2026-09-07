import { container } from '@/container';
import { mapDbError } from '@/domain/errors';
import type { ActivityLog, AuditFilters } from '@/domain/types/audit.types';
import type {
  Tenant,
  TenantFilters,
  PaginatedResult,
} from '@/domain/types/tenant.types';
import { sanitizePostgrestSearchTerm } from '@/infrastructure/supabase/postgrest-filter';

type TenantWithUsage = Tenant & {
  current_users: number;
  current_courses: number;
  current_storage_bytes: number;
};

async function withTenantUsage(tenants: Tenant[]): Promise<TenantWithUsage[]> {
  const { supabase } = container;

  if (tenants.length === 0) return [];

  // PERF-05 FIX: one batched RPC for the whole page instead of 2 head-count
  // queries per tenant — a 50-tenant page went from ~100 network round trips
  // to exactly 1.
  const tenantIds = tenants.map((tenant) => tenant.id);
  const { data, error } = await supabase.rpc('get_tenants_usage', {
    p_tenant_ids: tenantIds,
  });
  if (error) throw mapDbError(error, 'tenants.service.ts');

  const usage = new Map<string, { user_count: number; course_count: number }>();
  for (const row of (data ?? []) as Array<{
    tenant_id: string;
    user_count: number | string;
    course_count: number | string;
  }>) {
    usage.set(row.tenant_id, {
      user_count: Number(row.user_count ?? 0),
      course_count: Number(row.course_count ?? 0),
    });
  }

  return tenants.map((tenant) => ({
    ...tenant,
    current_users: usage.get(tenant.id)?.user_count ?? 0,
    current_courses: usage.get(tenant.id)?.course_count ?? 0,
    current_storage_bytes: 0,
  }));
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
    // Sanitize before interpolating into the raw .or() filter string -- an
    // unescaped ',' or '(' / ')' could inject additional filter conditions.
    const safeSearch = sanitizePostgrestSearchTerm(filters.search);
    query = query.or(`name.ilike.%${safeSearch}%,slug.ilike.%${safeSearch}%`);
  }
  if (filters.plan) query = query.eq('plan', filters.plan);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.region_id) query = query.eq('region_id', filters.region_id);

  const { data, count, error } = await query;
  if (error) throw mapDbError(error, 'tenants.service.ts');

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
  const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single();

  if (error) throw mapDbError(error, 'tenants.service.ts');
  const [tenant] = await withTenantUsage([data as Tenant]);
  return tenant as Tenant;
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
  if (error) throw mapDbError(error, 'tenants.service.ts');

  const total = count ?? 0;
  return {
    data: (data ?? []) as ActivityLog[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
