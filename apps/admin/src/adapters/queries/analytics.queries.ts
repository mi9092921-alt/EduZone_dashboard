import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { container } from '@/container';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { getDashboardStats, type DashboardStats } from '@/infrastructure/stats-service';

export type { DashboardStats };

/**
 * Fetches high-level dashboard metrics using the optimized get_dashboard_stats RPC.
 */
export function useDashboardStats(tenantId?: string) {
  return useQuery({
    queryKey: [...queryKeys.analytics.dashboard, tenantId],
    queryFn: () => getDashboardStats(tenantId),
    staleTime: 60_000,
  });
}

/**
 * Fetches dashboard metrics scoped to the current teacher.
 */
export function useTeacherDashboardStats() {
  const user = useAuthUser();
  const teacherId = user?.id;

  return useQuery({
    queryKey: [...queryKeys.analytics.dashboard, 'teacher', teacherId],
    queryFn: async (): Promise<DashboardStats> => {
      const { supabase } = container;
      if (!teacherId) throw new Error('Teacher ID is required');

      try {
        // 1. Get teacher's active course IDs first to filter enrollments
        // v13: courses_active view excludes soft-deleted courses
        const { data: teacherCourses } = await supabase
          .from('courses')
          .select('id')
          .eq('teacher_id', teacherId)
          .is('deleted_at', null);
        
        const courseIds = teacherCourses?.map(c => c.id) ?? [];

        // 2. Fetch all stats in parallel
        const [publishedRes, draftRes, archivedRes, deletedRes, warningsRes, studentsRes, lessonsRes, viewsRes, enrollmentsRes, devicesRes] = await Promise.all([
          // v13: courses_active already filters deleted_at IS NULL
          supabase
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .is('deleted_at', null)
            .eq('status', 'published'),
          supabase
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .is('deleted_at', null)
            .eq('status', 'draft'),
          supabase
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .is('deleted_at', null)
            .eq('status', 'archived'),
          // Deleted courses: query the base table directly since _active excludes them
          supabase
            .from('courses')
            .select('id', { count: 'exact', head: true })
            .not('deleted_at', 'is', null)
            .eq('teacher_id', teacherId),
          supabase
            .from('warnings')
            .select('id', { count: 'exact', head: true })
            .eq('issued_by', teacherId)
            .eq('is_acknowledged', false),
          // v13: enrollments_active filters soft-deleted enrollments
          courseIds.length > 0 
            ? supabase
                .from('enrollments')
                .select('user_id', { count: 'exact', head: true })
                .in('course_id', courseIds)
                .is('deleted_at', null)
            : Promise.resolve({ count: 0 }),
          // Count total lessons across teacher's courses
          // v13: lessons_active filters soft-deleted lessons
          courseIds.length > 0
            ? supabase
                .from('lessons')
                .select('id', { count: 'exact', head: true })
                .in('course_id', courseIds)
                .is('deleted_at', null)
            : Promise.resolve({ count: 0 }),
          // Count total views
          courseIds.length > 0
            ? supabase
                .from('video_views')
                .select('id', { count: 'exact', head: true })
                .in('course_id', courseIds)
            : Promise.resolve({ count: 0 }),
          // Get average progress via enrollments_active
          courseIds.length > 0
            ? supabase
                .from('enrollments')
                .select('progress_pct')
                .in('course_id', courseIds)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] }),
          // Count devices of enrolled students via enrollments_active
          courseIds.length > 0
            ? supabase
                .from('devices')
                .select('id', { count: 'exact', head: true })
                .in('user_id', (
                  await supabase
                    .from('enrollments')
                    .select('user_id')
                    .in('course_id', courseIds)
                    .is('deleted_at', null)
                ).data?.map(e => e.user_id) || []
                )
            : Promise.resolve({ count: 0 })
        ]);

        const avgProgress = (enrollmentsRes.data as any[])?.length 
          ? (enrollmentsRes.data as any[]).reduce((acc, curr) => acc + (curr.progress_pct || 0), 0) / (enrollmentsRes.data as any[]).length
          : 0;

        return {
          totalUsers:       studentsRes.count ?? 0,
          activeUsers:      studentsRes.count ?? 0,
          activeCourses:    publishedRes.count ?? 0,
          draftCourses:     draftRes.count ?? 0,
          archivedCourses:  archivedRes.count ?? 0,
          deletedCourses:   deletedRes.count ?? 0,
          totalEnrollments: studentsRes.count ?? 0,
          dailySessions:    0,
          pendingWarnings:  warningsRes.count ?? 0,
          totalViews:       viewsRes.count ?? 0,
          totalProgress:    Math.round(avgProgress),
          totalTenants:     0,
          totalLessons:     lessonsRes.count ?? 0,
          totalTodos:       0,
          totalDevices:     devicesRes.count ?? 0,
          refreshedAt:      new Date().toISOString(),
        };
      } catch (err) {
        return {
          totalUsers:       0,
          activeUsers:      0,
          activeCourses:    0,
          draftCourses:     0,
          archivedCourses:  0,
          deletedCourses:   0,
          totalEnrollments: 0,
          dailySessions:    0,
          pendingWarnings:  0,
          totalViews:       0,
          totalProgress:    0,
          totalTenants:     0,
          totalLessons:     0,
          totalTodos:       0,
          totalDevices:     0,
          refreshedAt:      new Date().toISOString(),
        };
      }
    },
    enabled: !!teacherId,
  });
}

export interface SystemHealth {
  /** Pending background jobs in internal.job_queue */
  pending_jobs: number;
  /** Activity log rows not yet flushed */
  unflushed_activity: number;
  /** Active tenants (approximates system load) */
  active_tenants: number;
  /** Database server time */
  database_time: string;
  /** Client-side timestamp of the last fetch */
  timestamp: string;
  processing_jobs?: number | undefined;
  failed_jobs?: number | undefined;
  partition_leaks?: number | undefined;
}

/**
 * Fetches background job health and infrastructure alerts securely via RPC.
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: [...queryKeys.analytics.dashboard, 'systemHealth'],
    queryFn: async (): Promise<SystemHealth> => {
      const { supabase } = container;
      const { data, error } = await supabase.rpc('get_system_health');

      if (error) {
        // PostgrestError properties are non-enumerable — extract explicitly
        return {
          pending_jobs: 0,
          unflushed_activity: 0,
          active_tenants: 0,
          database_time: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        };
      }

      // DB returns camelCase JSONB keys: { pendingJobs, unflushedActivity, activeTenants, databaseTime }
      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        pending_jobs:       Number(raw['pendingJobs']       ?? 0),
        unflushed_activity: Number(raw['unflushedActivity'] ?? 0),
        active_tenants:     Number(raw['activeTenants']     ?? 0),
        database_time:      String(raw['databaseTime']      ?? new Date().toISOString()),
        timestamp:          new Date().toISOString(),
        processing_jobs:    raw['processingJobs'] !== undefined ? Number(raw['processingJobs']) : undefined,
        failed_jobs:        raw['failedJobs'] !== undefined ? Number(raw['failedJobs']) : undefined,
        partition_leaks:    raw['partitionLeaks'] !== undefined ? Number(raw['partitionLeaks']) : undefined,
      };
    },
    refetchInterval: 15000, // Refresh every 15s to monitor health
  });
}
