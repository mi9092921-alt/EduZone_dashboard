import { getYoutubeMetadataAction } from '@/adapters/actions/video.actions';
import { container } from '@/container';
import { mapDbError } from '@/domain/errors';
import { ConflictError, InfrastructureError, UnauthorizedError } from '@/domain/errors';
import type {
  Course,
  CourseDetail,
  CourseFilters,
  CourseStats,
  CoursesOverviewStats,
  Section,
  Lesson,
  Enrollment,
  CreateCourseInput,
  UpdateCourseInput,
  CreateSectionInput,
  CreateLessonInput,
  PaginatedResult,
  VideoView,
  CourseLearningObjective,
  CoursePrerequisite,
} from '@/domain/types/course.types';
import { parseVideoUrl } from '@/domain/video.utils';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Courses service — all Supabase queries for the courses domain.
 * No UI, no React — pure async functions.
 */

// ══════════════════════════════════════════════════
// COURSES
// ══════════════════════════════════════════════════

export async function getCourses(
  filters: CourseFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Course>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('courses')
    .select(
      '*, lesson_count:lessons(count), teacher:users!courses_teacher_id_fkey(first_name, last_name)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.search) {
    query = query.ilike('title', `%${filters.search}%`);
  }
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.level) query = query.eq('level', filters.level);
  if (filters.is_free === true) {
    query = query.or('is_free.eq.true,price.eq.0');
  } else if (filters.is_free === false) {
    query = query.eq('is_free', false).gt('price', 0);
  }
  if (filters.teacher_id) query = query.eq('teacher_id', filters.teacher_id);
  if (filters.tenant_id) query = query.eq('tenant_id', filters.tenant_id);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error, 'courses.service.ts');

  const total = count ?? 0;
  const courses = (data ?? []).map((row: Record<string, unknown>) => {
    const teacher = row.teacher as Record<string, string> | null;
    const { teacher: _t, ...rest } = row;
    return {
      ...rest,
      teacher_name: teacher
        ? [teacher.first_name, teacher.last_name].filter(Boolean).join(' ')
        : undefined,
      lesson_count:
        (row.lesson_count as { count: number }[] | null)?.[0]?.count ??
        (row.total_lessons as number) ??
        0,
    } as Course;
  });

  return {
    data: courses,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCourseById(id: string): Promise<CourseDetail | null> {
  const { supabase } = container;

  // Fetch course
  const { data: course, error } = await supabase
    .from('courses')
    .select('*, teacher:users!courses_teacher_id_fkey(first_name, last_name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle(); // Use maybeSingle to avoid 406 if deleted
  if (error) throw mapDbError(error, 'courses.service.ts');
  if (!course) return null;

  // Fetch sections with lessons and their secured content (v11 model)
  const { data: sections, error: secErr } = await supabase
    .from('sections')
    .select('*, lessons:lessons(*, content:lesson_contents!lesson_contents_lesson_tenant_fkey(*))')
    .eq('course_id', id)
    .is('deleted_at', null)
    .order('order_index', { ascending: true });
  if (secErr) throw secErr;

  // Sort lessons within each section
  const sortedSections = (sections ?? []).map((sec: Record<string, unknown>) => ({
    ...sec,
    lessons: ((sec.lessons as Lesson[]) ?? [])
      .filter((l) => !l.deleted_at)
      .sort((a, b) => a.order_index - b.order_index),
  })) as Section[];

  const teacher = course.teacher as Record<string, string> | null;
  const { teacher: _t, ...courseRest } = course;

  return {
    ...courseRest,
    teacher_name: teacher
      ? [teacher.first_name, teacher.last_name].filter(Boolean).join(' ')
      : undefined,
    sections: sortedSections,
    lesson_count: sortedSections.reduce((acc, sec) => acc + (sec.lessons?.length ?? 0), 0),
  } as CourseDetail;
}

export async function createCourse(data: CreateCourseInput): Promise<Course> {
  const { supabase } = container;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError('Not authenticated');

  // Get tenant_id from the current user
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .single();

  if (userError || !userData?.tenant_id) {
    throw new InfrastructureError(
      'Could not determine tenant access. Please contact support.',
      `createCourse tenant lookup: ${userError?.message ?? 'missing tenant_id'}`,
    );
  }

  // v13: is_free is a generated column, do not insert it.
  // Instead, ensure price is 0 if is_free was passed as true.
  const { is_free, ...cleanData } = data;
  const finalPrice = is_free === true ? 0 : (cleanData.price ?? 0);

  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      ...cleanData,
      tenant_id: userData.tenant_id,
      teacher_id: user.id,
      price: finalPrice,
    })
    .select()
    .single();

  if (error) throw mapDbError(error, 'courses.service.ts');
  return course as Course;
}

export async function updateCourse(id: string, data: UpdateCourseInput): Promise<Course> {
  const { supabase } = container;

  // v13: is_free is a generated column, do not update it.
  const { is_free, ...cleanData } = data;
  const updatePayload: Partial<UpdateCourseInput> & { updated_at: string; price?: number } = {
    ...cleanData,
    updated_at: new Date().toISOString(),
  };

  if (is_free === true) {
    updatePayload.price = 0;
  } else if (is_free === false && updatePayload.price === 0) {
    // If explicitly setting is_free to false but price is 0, we might need a default non-zero price?
    // But usually the UI handles this by showing the price input.
  }

  const { data: course, error } = await supabase
    .from('courses')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw mapDbError(error, 'courses.service.ts');
  return course as Course;
}

export async function deleteCourse(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('courses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw mapDbError(error, 'courses.service.ts');
}

// ══════════════════════════════════════════════════
// SECTIONS
// ══════════════════════════════════════════════════

export async function getCourseSections(courseId: string): Promise<Section[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('sections')
    .select('*, lessons:lessons(*, content:lesson_contents!lesson_contents_lesson_tenant_fkey(*))')
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('order_index', { ascending: true });

  if (error) throw mapDbError(error, 'courses.service.ts');

  return (data ?? []).map((sec: Record<string, unknown>) => ({
    ...sec,
    lessons: ((sec.lessons as Lesson[]) ?? [])
      .filter((l) => !l.deleted_at)
      .sort((a, b) => a.order_index - b.order_index),
  })) as Section[];
}

export async function createSection(courseId: string, data: CreateSectionInput): Promise<Section> {
  const { supabase } = container;

  // v13: sections require tenant_id — derive from course
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('tenant_id')
    .eq('id', courseId)
    .is('deleted_at', null)
    .single();
  if (courseErr || !course?.tenant_id) throw courseErr || new Error('Course not found');

  // Query the actual MAX(order_index) to avoid duplicate key violations.
  // Soft-deleted sections still occupy their order_index in the unique constraint,
  // so we cannot trust the client-supplied value.
  const { data: maxRow } = await supabase
    .from('sections')
    .select('order_index')
    .eq('course_id', courseId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const safeOrderIndex = (maxRow?.order_index ?? -1) + 1;

  const { data: section, error } = await supabase
    .from('sections')
    .insert({
      ...data,
      order_index: safeOrderIndex,
      course_id: courseId,
      tenant_id: course.tenant_id,
    })
    .select()
    .single();

  if (error) throw mapDbError(error, 'courses.service.ts');
  return section as Section;
}

export async function updateSection(
  id: string,
  data: Partial<CreateSectionInput>,
): Promise<Section> {
  const { supabase } = container;
  const { data: section, error } = await supabase
    .from('sections')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw mapDbError(error, 'courses.service.ts');
  return section as Section;
}

export async function deleteSection(id: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase
    .from('sections')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw mapDbError(error, 'courses.service.ts');
}

export async function reorderSections(
  courseId: string,
  orderedIds: string[],
): Promise<void> {
  const { supabase } = container;

  // v13: reorder_course_sections(course_id, ordered_ids) — atomic reordering.
  // M11 fix: the call previously sent `p_section_updates` (a shape the SQL
  // function never accepted), so every reorder silently failed and fell back
  // to non-atomic per-row updates. Called with the real signature now.
  const { error } = await supabase.rpc('reorder_course_sections', {
    p_course_id: courseId,
    p_ordered_ids: orderedIds,
  });

  if (error) {
    console.error('[reorderSections] RPC failed, falling back to batch updates:', error);
    // Fallback if RPC fails or is not yet available in the environment
    await Promise.all(
      orderedIds.map((id, order_index) =>
        supabase.from('sections').update({ order_index }).eq('id', id),
      ),
    );
  }
}

// ══════════════════════════════════════════════════
// LESSONS
// ══════════════════════════════════════════════════

export async function createLesson(sectionId: string, data: CreateLessonInput): Promise<Lesson> {
  const { supabase } = container;

  // v13: lessons + lesson_contents require tenant_id — derive from section → course
  const { data: sectionData, error: sectionErr } = await supabase
    .from('sections')
    .select('course_id, tenant_id')
    .eq('id', sectionId)
    .single();

  if (sectionErr || !sectionData?.tenant_id) {
    console.error('[createLesson] Tenant context missing:', sectionErr);
    throw new UnauthorizedError(
      'TENANT_CONTEXT_REQUIRED: تأكد من تسجيل الدخول بشكل صحيح وأن حسابك مرتبط بمؤسسة.',
    );
  }

  const courseId = sectionData.course_id;
  const tenantId = sectionData.tenant_id;

  // v13: duration fetch from YouTube
  let duration = data.duration_sec ?? 0;
  if (data.video_url && !data.duration_sec) {
    const parsed = parseVideoUrl(data.video_url);
    if (parsed.provider === 'youtube') {
      console.log('[createLesson] Fetching YouTube metadata for:', data.video_url);
      const res = await getYoutubeMetadataAction(data.video_url);
      console.log('[createLesson] Metadata result:', res);
      if (res.success && res.data) {
        duration = res.data.duration_sec;
      }
    }
  } else {
    console.log('[createLesson] Using provided duration:', duration);
  }

  // 1. Create Lesson Metadata
  const { data: lesson, error } = await supabase
    .from('lessons')
    .insert({
      section_id: sectionId,
      course_id: courseId,
      tenant_id: tenantId,
      title: data.title,
      order_index: data.order_index ?? 0,
      is_published: data.is_published ?? true,
      is_preview: data.is_preview ?? false,
      duration_sec: duration,
    })
    .select()
    .single();

  if (error) throw mapDbError(error, 'courses.service.ts');

  // 2. Create Lesson Content (v13 security model)
  if (data.video_url) {
    const parsed = parseVideoUrl(data.video_url);

    const { error: contentErr } = await supabase.from('lesson_contents').insert({
      lesson_id: lesson.id,
      course_id: courseId,
      section_id: sectionId,
      tenant_id: tenantId,
      video_path: parsed.video_path,
      provider: parsed.provider,
      duration_sec: duration, // Use the fetched duration here too
      updated_at: new Date().toISOString(),
    });

    if (contentErr) {
      console.error('[createLesson] Failed to insert lesson_contents:', {
        message: contentErr.message,
        code: contentErr.code,
        details: contentErr.details,
        hint: contentErr.hint,
      });
      // Clean up the created lesson metadata to preserve database integrity
      await supabase.from('lessons').delete().eq('id', lesson.id);
      throw new InfrastructureError(
        'تعذر حفظ محتوى الفيديو. حاول مرة أخرى أو تواصل مع الدعم.',
        `createLesson lesson_contents: ${contentErr.message}`,
      );
    }
  }

  return lesson as Lesson;
}

export async function createLessons(
  sectionId: string,
  data: CreateLessonInput[],
): Promise<Lesson[]> {
  const { supabase } = container;

  // v13: Derive course_id + tenant_id from section
  const { data: section, error: sectionErr } = await supabase
    .from('sections')
    .select('course_id, tenant_id')
    .eq('id', sectionId)
    .single();
  const courseId = section?.course_id;
  const tenantId = section?.tenant_id;

  if (sectionErr || !courseId || !tenantId) {
    console.error('[createLessons] Tenant context missing:', sectionErr);
    throw new UnauthorizedError(
      'TENANT_CONTEXT_REQUIRED: تأكد من تسجيل الدخول بشكل صحيح وأن حسابك مرتبط بمؤسسة.',
    );
  }

  // v13: Batch fetch YouTube durations
  const enrichedData = await Promise.all(
    data.map(async (item) => {
      let duration = item.duration_sec ?? 0;
      if (item.video_url && !item.duration_sec) {
        const parsed = parseVideoUrl(item.video_url);
        if (parsed.provider === 'youtube') {
          console.log('[createLessons] Fetching YouTube metadata for:', item.video_url);
          const res = await getYoutubeMetadataAction(item.video_url);
          console.log('[createLessons] Metadata result:', res);
          if (res.success && res.data) {
            duration = res.data.duration_sec;
          }
        }
      }
      return { ...item, duration_sec: duration };
    }),
  );

  // 2. Insert Lessons
  const { data: lessons, error } = await supabase
    .from('lessons')
    .insert(
      enrichedData.map((item) => ({
        title: item.title,
        section_id: sectionId,
        course_id: courseId,
        tenant_id: tenantId,
        order_index: item.order_index ?? 0,
        is_published: item.is_published ?? true,
        is_preview: item.is_preview ?? false,
        duration_sec: item.duration_sec,
      })),
    )
    .select();

  if (error) throw mapDbError(error, 'courses.service.ts');

  // 3. Insert Lesson Contents (v13)
  const contents = lessons
    .map((lesson, idx) => {
      const input = enrichedData[idx];
      if (!input || !input.video_url) return null;
      const parsed = parseVideoUrl(input.video_url);

      return {
        lesson_id: lesson.id,
        course_id: courseId,
        section_id: sectionId,
        tenant_id: tenantId,
        video_path: parsed.video_path,
        provider: parsed.provider,
        duration_sec: lesson.duration_sec,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (contents.length > 0) {
    const { error: batchErr } = await supabase.from('lesson_contents').insert(contents);
    if (batchErr) {
      console.error('[createLessons] Failed to insert lesson_contents batch:', batchErr);
      // Clean up the created lessons metadata to preserve database integrity
      const lessonIds = lessons.map((l) => l.id);
      await supabase.from('lessons').delete().in('id', lessonIds);
      throw new InfrastructureError(
        'تعذر حفظ محتويات الفيديو للدروس المستوردة. حاول مرة أخرى أو تواصل مع الدعم.',
        `createLessons lesson_contents batch: ${batchErr.message}`,
      );
    }
  }

  return lessons as Lesson[];
}

export async function updateLesson(id: string, data: Partial<CreateLessonInput>): Promise<Lesson> {
  const { supabase } = container;

  // v13: duration fetch from YouTube on update
  let duration = data.duration_sec;
  if (data.video_url && !duration) {
    const parsed = parseVideoUrl(data.video_url);
    if (parsed.provider === 'youtube') {
      const res = await getYoutubeMetadataAction(data.video_url);
      if (res.success && res.data) {
        duration = res.data.duration_sec;
      }
    }
  }

  // 1. Update Lesson Metadata
  const metadata: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.title !== undefined) metadata.title = data.title;
  if (data.order_index !== undefined) metadata.order_index = data.order_index;
  if (data.is_published !== undefined) metadata.is_published = data.is_published;
  if (data.is_preview !== undefined) metadata.is_preview = data.is_preview;
  if (duration !== undefined) metadata.duration_sec = duration;

  const { data: lesson, error } = await supabase
    .from('lessons')
    .update(metadata)
    .eq('id', id)
    .select()
    .single();

  if (error) throw mapDbError(error, 'courses.service.ts');

  // 2. Sync Lesson Content
  if (data.video_url !== undefined) {
    const parsed = parseVideoUrl(data.video_url);

    const { error: contentErr } = await supabase.from('lesson_contents').upsert({
      lesson_id: lesson.id,
      course_id: lesson.course_id,
      section_id: lesson.section_id,
      tenant_id: lesson.tenant_id,
      video_path: parsed.video_path,
      provider: parsed.provider,
      duration_sec: lesson.duration_sec,
      updated_at: new Date().toISOString(),
    });

    if (contentErr) {
      console.error('[updateLesson] Failed to sync lesson_contents:', contentErr);
      throw new InfrastructureError(
        'تعذر تحديث رابط الفيديو. حاول مرة أخرى أو تواصل مع الدعم.',
        `updateLesson lesson_contents: ${contentErr.message}`,
      );
    }
  } else if (duration !== undefined) {
    // If only duration changed (rare but possible), update lesson_contents too
    const { error: durationErr } = await supabase
      .from('lesson_contents')
      .update({
        duration_sec: duration,
        updated_at: new Date().toISOString(),
      })
      .eq('lesson_id', id);

    if (durationErr) {
      console.error('[updateLesson] Failed to update lesson_contents duration:', durationErr);
      throw new InfrastructureError(
        'تعذر تحديث مدة الفيديو. حاول مرة أخرى أو تواصل مع الدعم.',
        `updateLesson duration: ${durationErr.message}`,
      );
    }
  }

  return lesson as Lesson;
}

export async function deleteLesson(id: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase
    .from('lessons')
    .update({
      deleted_at: new Date().toISOString(),
      is_published: false,
    })
    .eq('id', id);

  if (error) throw mapDbError(error, 'courses.service.ts');
}

export async function reorderLessons(
  updates: { id: string; order_index: number }[],
): Promise<void> {
  const { supabase } = container;
  await Promise.all(
    updates.map((u) =>
      supabase.from('lessons').update({ order_index: u.order_index }).eq('id', u.id),
    ),
  );
}

// ══════════════════════════════════════════════════
// ENROLLMENTS
// ══════════════════════════════════════════════════

export async function getCourseEnrollments(
  courseId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Enrollment>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('enrollments')
    .select('*, users:users!enrollments_user_id_fkey(email, first_name, last_name, avatar_url)', {
      count: 'exact',
    })
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('enrolled_at', { ascending: false })
    .range(from, to);

  if (error) throw mapDbError(error, 'courses.service.ts');

  const total = count ?? 0;
  const enrollments = (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as Record<string, string> | null;
    const { users: _u, ...rest } = row;
    return {
      ...rest,
      user_email: user?.email,
      user_first_name: user?.first_name,
      user_last_name: user?.last_name,
      user_avatar_url: user?.avatar_url,
    } as Enrollment;
  });

  return {
    data: enrollments,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAllCourseEnrollments(courseId: string): Promise<Enrollment[]> {
  const { supabase } = container;

  const { data, error } = await supabase
    .from('enrollments')
    .select('*, users:users!enrollments_user_id_fkey(email, first_name, last_name)')
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('enrolled_at', { ascending: false });

  if (error) throw mapDbError(error, 'courses.service.ts');

  return (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as Record<string, string> | null;
    const { users: _u, ...rest } = row;
    return {
      ...rest,
      user_email: user?.email,
      user_first_name: user?.first_name,
      user_last_name: user?.last_name,
    } as Enrollment;
  });
}

export async function enrollStudent(
  userId: string,
  courseId: string,
  _enrolledBy: string,
  expiresAt?: string,
): Promise<string> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('enroll_student', {
    p_user_id: userId,
    p_course_id: courseId,
    p_expires_at: expiresAt || null,
  });

  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      throw new ConflictError('Student is already enrolled in this course');
    }
    throw new InfrastructureError(undefined, `enrollStudent: ${error.message}`);
  }
  return data as string;
}

export async function revokeEnrollment(
  enrollmentId: string,
  _revokedBy: string,
  reason: string,
): Promise<void> {
  const { supabase } = container;

  // The v13 RPC requires user_id and course_id.
  // We fetch them from the enrollment record first.
  const { data: enrollment, error: fetchError } = await supabase
    .from('enrollments')
    .select('user_id, course_id')
    .eq('id', enrollmentId)
    .is('deleted_at', null)
    .single();

  if (fetchError || !enrollment) throw fetchError || new Error('Enrollment not found');

  const { error } = await supabase.rpc('revoke_enrollment', {
    p_user_id: enrollment.user_id,
    p_course_id: enrollment.course_id,
    p_reason: reason,
  });

  if (error) throw mapDbError(error, 'courses.service.ts');
}

// ══════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════

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

export async function getCoursesOverviewStats(tenantId?: string): Promise<CoursesOverviewStats> {
  const { supabase } = container;

  const buildQuery = (status?: string) => {
    let q = supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (status) q = q.eq('status', status);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q;
  };

  const [total, published, draft, archived] = await Promise.all([
    buildQuery(),
    buildQuery('published'),
    buildQuery('draft'),
    buildQuery('archived'),
  ]);

  return {
    total: total.count ?? 0,
    published: published.count ?? 0,
    draft: draft.count ?? 0,
    archived: archived.count ?? 0,
  };
}

// ══════════════════════════════════════════════════
// VIDEO VIEWS
// ══════════════════════════════════════════════════

export async function getVideoViewsByUser(
  userId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<VideoView>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('video_views')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .range(from, to);

  if (error) throw mapDbError(error, 'courses.service.ts');

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
      ? supabase.from('courses').select('id, title').in('id', courseIds)
      : Promise.resolve({ data: [] }),
    lessonIds.length
      ? supabase.from('lessons').select('id, title').in('id', lessonIds)
      : Promise.resolve({ data: [] }),
  ]);

  const courseTitles = new Map(
    (coursesRes.data ?? []).map((row: { id: string; title: string }) => [row.id, row.title]),
  );
  const lessonTitles = new Map(
    (lessonsRes.data ?? []).map((row: { id: string; title: string }) => [row.id, row.title]),
  );

  const views = (data ?? []).map((row: Record<string, unknown>) => ({
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

// ══════════════════════════════════════════════════
// LEARNING OBJECTIVES & PREREQUISITES
// ══════════════════════════════════════════════════

export async function getLearningObjectives(courseId: string): Promise<CourseLearningObjective[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('course_learning_objectives')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });
  if (error) throw mapDbError(error, 'courses.service.ts');
  return data || [];
}

export async function saveLearningObjectives(
  courseId: string,
  objectives: string[],
): Promise<void> {
  const { supabase } = container;

  // Delete old
  const { error: delErr } = await supabase
    .from('course_learning_objectives')
    .delete()
    .eq('course_id', courseId);
  if (delErr) throw delErr;

  if (objectives.length === 0) return;

  // Insert new
  const rows = objectives.map((obj, index) => ({
    course_id: courseId,
    objective: obj,
    order_index: index,
  }));

  const { error: insErr } = await supabase.from('course_learning_objectives').insert(rows);
  if (insErr) throw insErr;
}

export async function getPrerequisites(courseId: string): Promise<CoursePrerequisite[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('course_prerequisites')
    .select('*, prerequisite:courses!course_prerequisites_prereq_tenant_fkey(title, level)')
    .eq('course_id', courseId);
  if (error) throw mapDbError(error, 'courses.service.ts');
  return (data || []).map(
    (row: {
      course_id: string;
      prerequisite_course_id: string;
      tenant_id: string;
      prerequisite?: { title: string; level: string } | null;
    }) => ({
      course_id: row.course_id,
      prerequisite_course_id: row.prerequisite_course_id,
      tenant_id: row.tenant_id,
      ...(row.prerequisite?.title !== undefined && { prerequisite_title: row.prerequisite.title }),
      ...(row.prerequisite?.level !== undefined && { prerequisite_level: row.prerequisite.level }),
    }),
  );
}

export async function savePrerequisites(
  courseId: string,
  prerequisiteCourseIds: string[],
  tenantId: string,
): Promise<void> {
  const { supabase } = container;

  // Delete old
  const { error: delErr } = await supabase
    .from('course_prerequisites')
    .delete()
    .eq('course_id', courseId);
  if (delErr) throw delErr;

  if (prerequisiteCourseIds.length === 0) return;

  // Insert new
  const rows = prerequisiteCourseIds.map((prereqId) => ({
    course_id: courseId,
    prerequisite_course_id: prereqId,
    tenant_id: tenantId,
  }));

  const { error: insErr } = await supabase.from('course_prerequisites').insert(rows);
  if (insErr) throw insErr;
}

export async function getPrerequisiteOptions(
  courseId: string,
  tenantId: string,
): Promise<Course[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('courses')
    .select('id, title, level, category')
    .eq('tenant_id', tenantId)
    .neq('id', courseId)
    .is('deleted_at', null)
    .order('title', { ascending: true });
  if (error) throw mapDbError(error, 'courses.service.ts');
  return data || [];
}


