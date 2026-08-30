import type { UserStats } from '@eduzone/types';

import { container } from '@/container';
import type {
  MvDailyRevenue,
  DailyCount,
  CourseWithStats,
  GeoPoint,
} from '@/domain/types/analytics.types';

/**
 * Analytics service — Supabase queries for materialized views
 * and aggregate analytics data.
 * v13: Optimized to use RPCs for heavy aggregations.
 */

// ── User stats from RPC ──────────────────────────────────────────
export async function getUserStats(tenantId?: string): Promise<UserStats> {
  const { supabase } = container;
  
  const { data, error } = await supabase.rpc('get_user_stats_summary', {
    p_tenant_id: tenantId,
  });

  if (error || !data) {
    // Fallback if RPC fails
    return {
      total_users: 0,
      active_users: 0,
      locked_users: 0,
      suspended_users: 0,
      banned_users: 0,
      dau: 0,
      wau: 0,
      mau: 0,
      last_updated: new Date().toISOString(),
    };
  }

  return data as UserStats;
}

// ── Course stats from vw_course_stats ────────────────────────────
export async function getCourseStats(tenantId?: string): Promise<CourseWithStats[]> {
  try {
    const { getAnalyticsCourseStatsAction } = await import('@/application/actions/admin.actions');
    return await getAnalyticsCourseStatsAction(tenantId);
  } catch {
    return [];
  }
}

// ── Daily activity from RPC ──────────────────────────────────────
export async function getDailyActivity(
  tenantId?: string,
  days = 30,
): Promise<MvDailyRevenue[]> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('get_daily_activity', {
    p_tenant_id: tenantId,
    p_days: days
  });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    enrollment_date: String(row.enrollment_date ?? row.activity_date ?? row.date ?? ''),
    tenant_id: String(row.tenant_id ?? tenantId ?? ''),
    new_enrollments: Number(row.new_enrollments ?? row.count ?? row.total_events ?? 0),
    completions: Number(row.completions ?? 0),
    daily_revenue: Number(row.daily_revenue ?? 0),
  }));
}

// ── User registration trend ──────────────────────────────────────
export async function getUserRegistrationTrend(
  days = 90,
  tenantId?: string,
): Promise<DailyCount[]> {
  const { supabase } = container;

  const since = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]!;

  // v13: users_active view already excludes deleted users
  let q = supabase
    .from('users')
    .select('created_at')
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data } = await q;
  if (!data || data.length === 0) return [];

  // Group by date
  const countMap = new Map<string, number>();
  for (const u of data) {
    const day = u.created_at.split('T')[0]!;
    countMap.set(day, (countMap.get(day) ?? 0) + 1);
  }

  // Fill in missing days
  const result: DailyCount[] = [];
  const current = new Date(since);
  const today = new Date();
  while (current <= today) {
    const key = current.toISOString().split('T')[0]!;
    result.push({ date: key, count: countMap.get(key) ?? 0 });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

// ── Geographic distribution (from users region_id) ───────────────
export async function getGeographicDistribution(tenantId?: string): Promise<GeoPoint[]> {
  const { supabase } = container;

  // v13: users_active view already excludes deleted users
  let q = supabase
    .from('users')
    .select('region_id')
    .is('deleted_at', null)
    .not('region_id', 'is', null);

  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data } = await q;
  if (!data || data.length === 0) return [];

  const countMap = new Map<string, number>();
  for (const u of data) {
    const region = (u.region_id as string) ?? 'unknown';
    countMap.set(region, (countMap.get(region) ?? 0) + 1);
  }

  return Array.from(countMap.entries())
    .map(([country_code, user_count]) => ({ country_code, user_count }))
    .sort((a, b) => b.user_count - a.user_count);
}
