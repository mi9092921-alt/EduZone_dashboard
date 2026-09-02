import type {
  RateLimitRule,
  RateLimitWithEmail,
  TopOffender,
} from '@/domain/types/rate-limit.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Rate limits service — uses service_role admin client directly.
 * No circular dependency on admin.actions.ts.
 */

// ── Get active blocks (blocked_until > now) ──────────────────────
export async function getActiveBlocks(): Promise<RateLimitWithEmail[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('rate_limits')
    .select('*, users!rate_limits_user_id_fkey(email)')
    .not('blocked_until', 'is', null)
    .gt('blocked_until', new Date().toISOString())
    .order('blocked_until', { ascending: false });
  if (error) throw error;

  // M9: map the joined row explicitly instead of `as unknown as` spreading
  // the whole row — only the whitelisted RateLimit fields cross the boundary.
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: (row.user_id as string | null) ?? null,
    ip_address: (row.ip_address as string | null) ?? null,
    device_id: (row.device_id as string | null) ?? null,
    tenant_id: row.tenant_id as string,
    action: row.action as string,
    window_start: row.window_start as string,
    hit_count: Number(row.hit_count ?? 0),
    blocked_until: (row.blocked_until as string | null) ?? null,
    user_email: (row.users as Record<string, string> | null)?.email ?? null,
  }));
}

// ── Get rate limit rules ─────────────────────────────────────────
export async function getRateLimitRules(): Promise<RateLimitRule[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('rate_limit_rules').select('*').order('action');
  if (error) throw error;
  return (data ?? []) as RateLimitRule[];
}

// ── Toggle rule active state ─────────────────────────────────────
export async function toggleRateLimitRule(action: string, isActive: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('rate_limit_rules')
    .update({ is_active: isActive })
    .eq('action', action);
  if (error) throw error;
}

// ── Clear a specific block ───────────────────────────────────────
export async function clearBlock(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('rate_limits').delete().eq('id', id);
  if (error) throw error;
}

// ── Top offenders (last 24h) ─────────────────────────────────────
export async function getTopOffenders(): Promise<TopOffender[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { data, error } = await admin
    .from('rate_limits')
    .select('user_id, ip_address, action, hit_count, users!rate_limits_user_id_fkey(email)')
    .gte('window_start', since)
    .order('hit_count', { ascending: false })
    .limit(100);
  if (error) throw error;

  const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    user_email: (row.users as Record<string, string> | null)?.email ?? null,
  }));

  return aggregateTopOffenders(mapped);
}

function aggregateTopOffenders(rows: Record<string, unknown>[]): TopOffender[] {
  const map = new Map<string, TopOffender>();
  for (const row of rows) {
    const key = (row.user_id as string) || (row.ip_address as string) || 'unknown';
    const existing = map.get(key);
    const action = row.action as string;
    if (existing) {
      existing.total_hits += (row.hit_count as number) || 0;
      if (!existing.actions.includes(action)) existing.actions.push(action);
    } else {
      map.set(key, {
        user_id: (row.user_id as string) || null,
        ip_address: (row.ip_address as string) || null,
        user_email: (row.user_email as string) || null,
        total_hits: (row.hit_count as number) || 0,
        actions: [action],
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.total_hits - a.total_hits)
    .slice(0, 20);
}

