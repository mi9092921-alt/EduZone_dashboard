import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { mapDbError } from '@/domain/errors';
import type { TeacherEngagementStats } from '@/infrastructure/stats-service';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Teacher engagement stats (SERVER-ONLY).
 *
 * P1 FIX (server/client boundary): reads via the service-role client.
 * The `server-only` guard makes any client-bundled import fail the
 * production build. Browser-safe dashboard stats (`getDashboardStats`) live
 * in `./stats-service` (browser Supabase client via the DI container).
 *
 * MUST only be called from a server action that authenticates the caller,
 * requires courses.read/reports.read, and passes the teacher id from the
 * trusted session — never a client argument
 * (see adapters/actions/teacher-dashboard.actions.ts).
 */

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
  if (error) throw mapDbError(error, 'stats.admin.ts');

  return count ?? 0;
}

export async function getTeacherEngagementStatsAdmin(
  teacherId: string,
): Promise<TeacherEngagementStats> {
  const admin = createAdminClient();

  const { data: teacherCourses, error: coursesError } = await admin
    .from('courses')
    .select('id')
    .eq('teacher_id', teacherId)
    .is('deleted_at', null);
  if (coursesError) throw mapDbError(coursesError, 'stats.admin.ts');

  const courseIds = (teacherCourses ?? []).map((course) => course.id as string);
  if (courseIds.length === 0) return { totalViews: 0, dailySessions: 0 };

  const { data: enrolledRows, error: enrolledError } = await admin
    .from('enrollments')
    .select('user_id')
    .in('course_id', courseIds)
    .is('deleted_at', null);
  if (enrolledError) throw mapDbError(enrolledError, 'stats.admin.ts');

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
  if (viewsRes.error) throw mapDbError(viewsRes.error, 'stats.admin.ts');

  return { totalViews: viewsRes.count ?? 0, dailySessions };
}
