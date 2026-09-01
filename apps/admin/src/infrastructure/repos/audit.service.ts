import { container } from '@/container';
import { AppError } from '@/domain/errors/AppError';
import type {
  ActivityLog,
  ActivityLogQueueEntry,
  AuditChainState,
  AuditFilters,
} from '@/domain/types/audit.types';
import type { PaginatedResult } from '@/domain/types/user.types';

/**
 * Audit service — Supabase queries for audit chain domain.
 * No UI, no React — pure async functions.
 */

// ── Get paginated activity logs ──────────────────────────────────
export async function getActivityLogs(
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
    .order('seq', { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters.activity_type && filters.activity_type.length > 0) {
    query = query.in('activity_type', filters.activity_type);
  }
  if (filters.risk_level && filters.risk_level.length > 0) {
    query = query.in('risk_level', filters.risk_level);
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }
  if (filters.tenant_id) {
    query = query.eq('tenant_id', filters.tenant_id);
  }

  const { data, error, count } = await query;
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

// ── Get all logs in a date range (for chain verification) ────────
export async function getActivityLogsForVerification(
  dateFrom: string,
  dateTo: string,
): Promise<ActivityLog[]> {
  const { supabase } = container;

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

// ── Get audit chain state ────────────────────────────────────────
export async function getAuditChainState(): Promise<AuditChainState> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('audit_chain_state')
    .select('last_seq, last_hash, updated_at')
    .eq('id', 1)
    .single();

  if (error) throw error;
  return data as AuditChainState;
}

// ── Flush activity logs (RPC) ────────────────────────────────────
export async function flushActivityLogs(batchSize: number = 200): Promise<number> {
  const { supabase } = container;
  const { data, error } = await supabase
    .rpc('flush_activity_logs', { p_batch_size: batchSize })
    .single();

  if (error) {
    if (error.message.includes('lock') || error.code === '55P03') {
      throw new AppError('LOCK_CONTENTION', 'In use — retry later');
    }
    throw error;
  }
  return (data as number) ?? 0;
}

// ── Get queued (unflushed) activities ─────────────────────────────
// activity_log_queue has REVOKE ALL for anon/authenticated + a deny-all RLS policy.
// Direct browser-client queries always return 403 Forbidden.
// We delegate to a 'use server' action that runs with the service-role key.
export async function getQueuedActivities(limit: number = 200): Promise<ActivityLogQueueEntry[]> {
  // Dynamic import avoids bundling 'use server' code in the client bundle
  const { getQueuedActivitiesAction } = await import('@/application/actions/admin.actions');
  return getQueuedActivitiesAction(limit);
}
