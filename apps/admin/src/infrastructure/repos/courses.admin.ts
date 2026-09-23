import 'server-only';

import { mapDbError } from '@/domain/errors';
import type { CourseStats, PaginatedResult, VideoView } from '@/domain/types/course.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Courses privileged reads/writes (SERVER-ONLY).
 *
 * P1 FIX (server/client boundary): every function here uses the service-role
 * client (bypasses RLS). The `server-only` guard makes any client-bundled
 * import fail the production build. Browser-safe course reads/writes live in
 * `./courses.service` (browser Supabase client via the DI container + RLS).
 *
 * MUST only be called from tenant-scoped server actions / repositories —
 * never trust a client-supplied tenant id.
 */

/**
 * Looks up the owning tenant_id for a course via the service-role client.
 * Used by the action boundary to assert the caller (unless super_admin)
 * may only mutate courses within their own tenant — courses.tenant_id is
 * NOT NULL, every course belongs to exactly one tenant. Returns null when
 * the course does not exist.
 */
export async function getCourseTenantId(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('courses')
    .select('tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return (data.tenant_id as string) ?? null;
}

export async function deleteCourse(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('courses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw mapDbError(error, 'courses.admin.ts');
}

export async function getCourseStats(courseId: string): Promise<CourseStats | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('vw_course_stats')
      .select('*')
      .eq('course_id', courseId)
      .maybeSingle();
    if (error) return null;
    return (data as CourseStats) ?? null;
  } catch (err: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[getCourseStats] Stats not available:', err);
    }
    return null;
  }
}

/**
 * Admin (service_role) variant of getVideoViewsByUser.
 *
 * Root cause for Activities → Views showing incomplete data: `video_views`
 * is a partitioned table (PARTITION BY RANGE viewed_at) and every child
 * partition carries `partition_deny_direct USING (false)` for the
 * authenticated role (see supabase/schema/09_rls.sql). Postgres evaluates
 * partition policies even when querying the parent, so any browser-client
 * (authenticated JWT) read returns zero/incomplete rows. The title
 * enrichment (courses/lessons via RLS) suffers the same filtering.
 *
 * This variant uses the service-role client (bypasses RLS, including the
 * partition deny) and MUST only be called from a tenant-scoped server
 * action (see activities.actions.ts) that authenticates, authorizes and
 * asserts same-tenant before invoking it. `tenantId` scopes the read to
 * the target user's tenant when provided.
 */
export async function getVideoViewsByUserAdmin(
  userId: string,
  page: number,
  pageSize: number,
  tenantId?: string,
): Promise<PaginatedResult<VideoView>> {
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('video_views')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .range(from, to);
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error, 'courses.admin.ts');

  const rows = (data ?? []) as Record<string, unknown>[];
  const courseIds = [
    ...new Set(
      rows.map((row) => row.course_id).filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const lessonIds = [
    ...new Set(
      rows.map((row) => row.lesson_id).filter((id): id is string => typeof id === 'string'),
    ),
  ];

  const [coursesRes, lessonsRes] = await Promise.all([
    courseIds.length
      ? admin.from('courses').select('id, title').in('id', courseIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    lessonIds.length
      ? admin.from('lessons').select('id, title').in('id', lessonIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const courseTitles = new Map(
    ((coursesRes.data ?? []) as { id: string; title: string }[]).map((row) => [
      row.id,
      row.title,
    ]),
  );
  const lessonTitles = new Map(
    ((lessonsRes.data ?? []) as { id: string; title: string }[]).map((row) => [
      row.id,
      row.title,
    ]),
  );

  const views = rows.map((row) => ({
    ...row,
    course_title: courseTitles.get(row.course_id as string),
    lesson_title: lessonTitles.get(row.lesson_id as string),
  })) as VideoView[];

  return {
    data: views,
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}
