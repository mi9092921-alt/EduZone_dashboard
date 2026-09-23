import 'server-only';

import { mapDbError } from '@/domain/errors';
import type { ActivityLog, ActivityLogQueueEntry, AuditFilters } from '@/domain/types/audit.types';
import type { PaginatedResult } from '@/domain/types/user.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Audit privileged reads (SERVER-ONLY).
 *
 * P1 FIX (server/client boundary): every function here uses the service-role
 * client (bypasses RLS / partition deny). The `server-only` guard makes any
 * client-bundled import fail the production build. Browser-safe audit reads
 * live in `./audit.service` (browser Supabase client via the DI container).
 *
 * MUST only be called from tenant-scoped server actions — never trust a
 * client-supplied tenant id.
 */

/**
 * Admin (service_role) variant of getActivityLogs.
 *
 * Same partitioned-table root cause as video_views: `activity_logs` child
 * partitions carry `partition_deny_direct USING (false)` for authenticated,
 * so browser-client reads return incomplete rows. Uses the service-role
 * client and MUST only be called from a tenant-scoped server action.
 * `tenantScope` pins the read to the target user's tenant when provided.
 */
export async function getActivityLogsAdmin(
  filters: AuditFilters,
  page: number,
  pageSize: number,
  tenantScope?: string,
): Promise<PaginatedResult<ActivityLog>> {
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('seq', { ascending: false })
    .range(from, to);

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.activity_type && filters.activity_type.length > 0) {
    query = query.in('activity_type', filters.activity_type);
  }
  if (filters.risk_level && filters.risk_level.length > 0) {
    query = query.in('risk_level', filters.risk_level);
  }
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  // Explicit tenant scoping wins over caller-supplied filter (the action
  // boundary already validated same-tenant; never trust a client tenant).
  const effectiveTenant = tenantScope ?? filters.tenant_id;
  if (effectiveTenant) query = query.eq('tenant_id', effectiveTenant);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error, 'audit.admin.ts');

  const total = count ?? 0;
  return {
    data: (data ?? []) as ActivityLog[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── Get queued (unflushed) activities ───────────────────────────────────
// activity_log_queue has REVOKE ALL for anon/authenticated + deny-all RLS.
// Must use service_role admin client to bypass permission gate.
//
// IDOR guard: activity_log_queue.tenant_id is NOT NULL and rows carry
// user_id/ip_address/details (not the "non-PII" data the old call site
// assumed) — a service-role read here MUST be tenant-scoped by the
// caller. `tenantId` should be the caller's own tenant, or omitted only
// for super_admin — see getQueuedActivitiesAction.
export async function getQueuedActivities(
  limit: number = 200,
  tenantId?: string,
): Promise<ActivityLogQueueEntry[]> {
  const admin = createAdminClient();
  let query = admin.from('activity_log_queue').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw mapDbError(error, 'audit.admin.ts');
  return (data ?? []) as ActivityLogQueueEntry[];
}
