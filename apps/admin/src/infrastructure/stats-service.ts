import type { SupabaseClient } from '@supabase/supabase-js';

import { container } from '@/container';
import { mapDbError } from '@/domain/errors';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Stats Service
 *
 * Fetches consolidated analytical data and system statistics.
 * Utilizes high-performance SQL views and RPCs to minimize client-side processing.
 */

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  activeCourses: number;
  draftCourses: number;
  archivedCourses: number;
  totalEnrollments: number;
  pendingWarnings: number;
  // UI Compatibility fields (defaulting to 0 if not in RPC)
  dailySessions: number;
  totalViews: number;
  totalProgress: number;
  totalTenants: number;
  totalLessons: number;
  totalTodos: number;
  totalDevices: number;
  deletedCourses: number;
  // Metadata
  refreshedAt: string;
}

/**
 * Fetches high-level dashboard metrics using the optimized get_dashboard_stats RPC.
 * Adheres to RBAC; Super Admins can optionally filter by tenant.
 *
 * @param tenantId Optional tenant ID for targeted stats
 */
export async function getDashboardStats(tenantId?: string): Promise<DashboardStats> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    p_tenant_id: tenantId || null,
  });

  if (error) {
    // PostgrestError properties are non-enumerable — extract explicitly
    return {
      totalUsers: 0,
      activeUsers: 0,
      activeCourses: 0,
      draftCourses: 0,
      archivedCourses: 0,
      totalEnrollments: 0,
      pendingWarnings: 0,
      dailySessions: 0,
      totalViews: 0,
      totalProgress: 0,
      totalTenants: 0,
      totalLessons: 0,
      totalTodos: 0,
      totalDevices: 0,
      deletedCourses: 0,
      refreshedAt: new Date().toISOString(),
    };
  }

  // DB returns snake_case JSONB: { total_users, total_courses, total_enrollments, active_sessions }
  const raw = (data ?? {}) as Record<string, unknown>;

  return {
    totalUsers: Number(raw['total_users'] ?? 0),
    activeUsers: Number(raw['total_users'] ?? 0), // no separate active_users in RPC
    activeCourses: Number(raw['total_courses'] ?? 0),
    draftCourses: Number(raw['draft_courses'] ?? 0),
    archivedCourses: 0,
    totalEnrollments: Number(raw['total_enrollments'] ?? 0),
    pendingWarnings: Number(raw['warnings_count'] ?? 0),
    dailySessions: Number(raw['active_sessions'] ?? 0),
    totalViews: Number(raw['total_views'] ?? 0),
    totalProgress: Math.round(Number(raw['total_progress'] ?? 0)),
    totalTenants: 0,
    totalLessons: Number(raw['total_lessons'] ?? 0),
    totalTodos: Number(raw['total_todos'] ?? 0),
    totalDevices: Number(raw['total_devices'] ?? 0),
    deletedCourses: Number(raw['deleted_courses'] ?? 0),
    refreshedAt: new Date().toISOString(),
  };
}

export interface TeacherEngagementStats {
  /** All-time video_views rows across the teacher's non-deleted courses. */
  totalViews: number;
  /** Sessions started today (UTC) by students enrolled in the teacher's courses. */
  dailySessions: number;
}

async function countSessionsTodayAdmin(
  admin: SupabaseClient,
  userIds: string[],
  sinceIso: string,
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { count, error } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .in('user_id', userIds)
    .gte('started_at', sinceIso);
  if (error) throw mapDbError(error, 'stats-service.ts');

  return count ?? 0;
}

/**
 * Teacher-scoped engagement counts (Total Views + Sessions Today), read via
 * the service-role client.
 *
 * Why not the browser client: video_views / sessions are partitioned tables
 * whose child partitions deny authenticated reads (partition_deny_direct in
 * 09_rls.sql), and the parent policies only ever expose the caller's OWN
 * rows — a teacher counting through the browser client would always get 0.
 * MUST only be called from a server action that authenticates the caller,
 * requires courses.read/reports.read, and passes the teacher id from the
 * trusted session — never a client argument
 * (see adapters/actions/teacher-dashboard.actions.ts).
 */
export async function getTeacherEngagementStatsAdmin(
  teacherId: string,
): Promise<TeacherEngagementStats> {
  const admin = createAdminClient();

  const { data: teacherCourses, error: coursesError } = await admin
    .from('courses')
    .select('id')
    .eq('teacher_id', teacherId)
    .is('deleted_at', null);
  if (coursesError) throw mapDbError(coursesError, 'stats-service.ts');

  const courseIds = (teacherCourses ?? []).map((course) => course.id as string);
  if (courseIds.length === 0) return { totalViews: 0, dailySessions: 0 };

  const { data: enrolledRows, error: enrolledError } = await admin
    .from('enrollments')
    .select('user_id')
    .in('course_id', courseIds)
    .is('deleted_at', null);
  if (enrolledError) throw mapDbError(enrolledError, 'stats-service.ts');

  const studentIds = [...new Set((enrolledRows ?? []).map((row) => row.user_id as string))];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [viewsRes, dailySessions] = await Promise.all([
    admin
      .from('video_views')
      .select('id', { count: 'exact', head: true })
      .in('course_id', courseIds),
    countSessionsTodayAdmin(admin, studentIds, startOfDay.toISOString()),
  ]);
  if (viewsRes.error) throw mapDbError(viewsRes.error, 'stats-service.ts');

  return { totalViews: viewsRes.count ?? 0, dailySessions };
}
