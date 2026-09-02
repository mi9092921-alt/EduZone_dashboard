import { container } from '@/container';
import type {
  Warning,
  WarningFilters,
  TeacherStudent,
  StudentProgress,
  PaginatedResult,
} from '@/domain/types/warning.types';

/**
 * Warnings service — all Supabase queries for the warnings domain.
 * Uses base tables with explicit soft-delete filters so the app does not
 * depend on optional active-view grants.
 */

// ══════════════════════════════════════════════════
// WARNINGS
// ══════════════════════════════════════════════════

export async function getWarnings(
  filters: WarningFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Warning>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // v13: Use warnings base table (warnings are not soft-deleted).
  // Join to users_with_pii_access to get decrypted email.
  // Issuer only needs display name — no PII needed.
  let query = supabase
    .from('warnings')
    .select(
      '*, student:users!user_id(first_name, last_name, email, avatar_url), issuer:users!issued_by(first_name, last_name)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.issued_by) query = query.eq('issued_by', filters.issued_by);
  if (filters.severity) query = query.eq('severity', filters.severity);

  const { data, error, count } = await query;
  if (error) throw error;

  const total = count ?? 0;
  const warnings = (data ?? []).map((row: Record<string, unknown>) => {
    const student = row.student as Record<string, string> | null;
    const issuer = row.issuer as Record<string, string> | null;
    const { student: _s, issuer: _i, ...rest } = row;
    return {
      ...rest,
      student_name: student
        ? [student.first_name, student.last_name].filter(Boolean).join(' ')
        : undefined,
      // v13: email is now in the decrypted column from the PII view
      student_email: student?.email ?? null,
      student_avatar_url: student?.avatar_url,
      issuer_name: issuer
        ? [issuer.first_name, issuer.last_name].filter(Boolean).join(' ')
        : undefined,
    } as Warning;
  });

  return {
    data: warnings,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function issueWarning(
  userId: string,
  reason: string,
  severity: number,
  action: string,
): Promise<string> {
  const { issueWarningAction } = await import('@/adapters/actions/user.actions');
  const result = await issueWarningAction(userId, reason, severity as 1 | 2 | 3, action);
  if (!result.success) throw new Error(result.error);
  return result.warningId ?? '';
}

// ══════════════════════════════════════════════════
// TEACHER STUDENTS (for warning student selector)
// ══════════════════════════════════════════════════

export async function getTeacherStudents(teacherId: string): Promise<TeacherStudent[]> {
  const { supabase } = container;

  // v13: courses_active already filters deleted_at IS NULL
  const { data: courses, error: courseErr } = await supabase
    .from('courses')
    .select('id, title')
    .eq('teacher_id', teacherId)
    .is('deleted_at', null);

  if (courseErr) throw courseErr;
  if (!courses || courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);
  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.title]));

  // v13: enrollments_active includes only active/completed non-deleted enrollments.
  // Join to users_with_pii_access for decrypted email.
  const { data: enrollments, error: enrErr } = await supabase
    .from('enrollments')
    .select('user_id, course_id, users!user_id(first_name, last_name, email, avatar_url)')
    .in('course_id', courseIds)
    .is('deleted_at', null);

  if (enrErr) throw enrErr;

  // Deduplicate students
  const seen = new Set<string>();
  const students: TeacherStudent[] = [];

  for (const row of enrollments ?? []) {
    const user = (row as Record<string, unknown>).users as Record<string, string> | null;
    const key = `${row.user_id}-${row.course_id}`;
    if (seen.has(key) || !user) continue;
    seen.add(key);
    students.push({
      id: row.user_id,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      // v13: use decrypted PII column
      email: user.email ?? null,
      avatar_url: user.avatar_url ?? null,
      course_title: courseMap[row.course_id] ?? 'Unknown',
    });
  }

  return students;
}

// ══════════════════════════════════════════════════
// STUDENT PROGRESS (for P4-TEACHER-003)
// ══════════════════════════════════════════════════

export async function getStudentProgress(
  courseId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<StudentProgress>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // v13: enrollments_active; join to users_with_pii_access for decrypted email.
  const { data, error, count } = await supabase
    .from('enrollments')
    .select(
      'user_id, status, enrolled_at, completed_at, progress_pct, last_watched_at, users!user_id(first_name, last_name, email, avatar_url)',
      { count: 'exact' },
    )
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('enrolled_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const total = count ?? 0;
  // M9: map DB row → StudentProgress DTO here (typed), so the UI receives
  // the domain type directly with no `as unknown as` cast downstream.
  const students: StudentProgress[] = (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as Record<string, string | null> | null;
    return {
      user_id: String(row.user_id),
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      // v13: use decrypted PII column
      email: user?.email ?? null,
      avatar_url: user?.avatar_url ?? null,
      progress_pct: Number(row.progress_pct ?? 0),
      last_watched: (row.last_watched_at as string | null) ?? null,
      completed: row.status === 'completed',
    };
  });

  return {
    data: students,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
