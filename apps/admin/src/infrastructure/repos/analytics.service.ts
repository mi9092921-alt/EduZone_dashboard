import type { UserStats } from '@eduzone/types';

import { container } from '@/container';
import type {
  MvDailyRevenue,
  DailyCount,
  CourseWithStats,
  MvCourseStats,
  GeoPoint,
} from '@/domain/types/analytics.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Analytics service — Supabase queries for materialized views
 * and aggregate analytics data.
 * v13: Optimized to use RPCs for heavy aggregations.
 */

/**
 * M9 DTO: what `get_user_stats_summary` actually returns. The RPC adds a
 * `refreshed_at` column that the shared `UserStats` type doesn't declare;
 * declaring it here (instead of double-casting in the UI) keeps the
 * DB→UI boundary typed without changing the shared package contract.
 */
export type UserStatsDto = UserStats & { refreshed_at?: string };

// ── User stats from RPC ──────────────────────────────────────────
export async function getUserStats(tenantId?: string): Promise<UserStatsDto> {
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

  return data as UserStatsDto;
}

// ── System health from RPC (M11: moved from adapters/queries) ────
export interface SystemHealthDto {
  pending_jobs: number;
  unflushed_activity: number;
  active_tenants: number;
  database_time: string;
  timestamp: string;
  processing_jobs?: number | undefined;
  failed_jobs?: number | undefined;
  partition_leaks?: number | undefined;
}

function emptySystemHealth(): SystemHealthDto {
  const now = new Date().toISOString();
  return {
    pending_jobs: 0,
    unflushed_activity: 0,
    active_tenants: 0,
    database_time: now,
    timestamp: now,
  };
}

/**
 * get_system_health — privileged (is_admin_with_session_validation inside).
 * Returns zeroed counters on RPC failure so dashboards degrade gracefully.
 */
export async function getSystemHealth(): Promise<SystemHealthDto> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('get_system_health');
  if (error) {
    // PostgrestError properties are non-enumerable — extract explicitly.
    console.error('[analytics.service] get_system_health failed:', {
      message: error.message,
      code: error.code,
    });
    return emptySystemHealth();
  }

  // DB returns camelCase JSONB keys: { pendingJobs, unflushedActivity, activeTenants, databaseTime }
  const raw = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const opt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    pending_jobs: num(raw['pendingJobs']),
    unflushed_activity: num(raw['unflushedActivity']),
    active_tenants: num(raw['activeTenants']),
    database_time:
      typeof raw['databaseTime'] === 'string'
        ? raw['databaseTime']
        : new Date().toISOString(),
    timestamp: new Date().toISOString(),
    processing_jobs: opt(raw['processingJobs']),
    failed_jobs: opt(raw['failedJobs']),
    partition_leaks: opt(raw['partitionLeaks']),
  };
}

// ── Course stats from vw_course_stats (admin read — bypasses RLS) ───────────
export async function getCourseStats(tenantId?: string): Promise<CourseWithStats[]> {
  try {
    const admin = createAdminClient();

    let query = admin.from('vw_course_stats').select('*');
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data, error } = await query.order('enrolled', { ascending: false }).limit(20);
    if (error || !data) return [];

    const courseIds = data.map((d: MvCourseStats) => d.course_id);
    const { data: courses } = await admin
      .from('courses')
      .select('id, title')
      .in('id', courseIds)
      .is('deleted_at', null);

    const titleMap = new Map(
      (courses ?? []).map((c: { id: string; title: string }) => [c.id, c.title]),
    );

    return data.map((d: MvCourseStats) => ({
      ...d,
      title: titleMap.get(d.course_id) ?? 'Unknown',
    }));
  } catch {
    return [];
  }
}

// ── Daily activity from RPC ──────────────────────────────────────
export async function getDailyActivity(tenantId?: string, days = 30): Promise<MvDailyRevenue[]> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('get_daily_activity', {
    p_tenant_id: tenantId,
    p_days: days,
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
