import { container } from '@/container';
import { AppError } from '@/domain/errors/AppError';
import type {
  ActivityLog,
  ActivityLogQueueEntry,
  AuditChainState,
  AuditFilters,
} from '@/domain/types/audit.types';
import type { PaginatedResult } from '@/domain/types/user.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

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

/**
 * Independently fetch the entry_hash of the log immediately preceding
 * `seq` (i.e. the row at `seq - 1`).
 *
 * This is the trust anchor for hash-chain verification of a date-range
 * window: the correct genesis hash for verifying logs starting at `seq`
 * is the *actual* entry_hash of the row before it — fetched separately by
 * its own seq, not read off the window's first row's own prev_hash field
 * (which is exactly the value an attacker would have to forge, so trusting
 * it verifies nothing). Mirrors the server's own verify_audit_chain()
 * SQL function, which anchors the same way (SELECT entry_hash INTO
 * v_prev_hash FROM activity_logs WHERE seq = p_start_seq - 1).
 *
 * Returns null if `seq` is 1 (the very first log ever — no predecessor)
 * or if the predecessor row can't be found.
 */
export async function getPrecedingLogEntryHash(seq: number): Promise<string | null> {
  if (seq <= 1) return null;

  const { supabase } = container;
  const { data, error } = await supabase
    .from('activity_logs')
    .select('entry_hash')
    .eq('seq', seq - 1)
    .maybeSingle();

  if (error) throw error;
  return (data as { entry_hash: string } | null)?.entry_hash ?? null;
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

// ── Get queued (unflushed) activities ───────────────────────────────────
// activity_log_queue has REVOKE ALL for anon/authenticated + deny-all RLS.
// Must use service_role admin client to bypass permission gate.
export async function getQueuedActivities(limit: number = 200): Promise<ActivityLogQueueEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('activity_log_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLogQueueEntry[];
}
