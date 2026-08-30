import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { useAuthUser } from '@/adapters/stores/auth.store';
import type { CourseFilters } from '@/domain/types/course.types';
import type { WarningFilters } from '@/domain/types/warning.types';
import { getCourses } from '@/infrastructure/repos/courses.service';
import {
  getWarnings,
  getTeacherStudents,
  getStudentProgress,
} from '@/infrastructure/repos/warnings.service';

/**
 * React Query hooks for teacher-scoped data.
 */

export function useTeacherCourses(filters: CourseFilters, page: number, pageSize: number) {
  const user = useAuthUser();
  const teacherId = user?.id ?? '';
  const teacherFilters: CourseFilters = { ...filters, teacher_id: teacherId };
  return useQuery({
    queryKey: queryKeys.teacher.myCourses({ ...teacherFilters, page, pageSize }),
    queryFn: () => getCourses(teacherFilters, page, pageSize),
    enabled: !!teacherId,
    placeholderData: keepPreviousData,
  });
}

export function useStudentProgress(courseId: string | null, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.teacher.studentProgress(courseId!, { page, pageSize }),
    queryFn: () => getStudentProgress(courseId!, page, pageSize),
    enabled: !!courseId,
    placeholderData: keepPreviousData,
  });
}

export function useTeacherStudents() {
  const user = useAuthUser();
  return useQuery({
    queryKey: queryKeys.teacher.students(user?.id ?? ''),
    queryFn: () => getTeacherStudents(user!.id),
    enabled: !!user?.id,
  });
}

export function useTeacherWarnings(filters: WarningFilters, page: number, pageSize: number) {
  const user = useAuthUser();
  const isTeacher = user?.primary_role === 'teacher';
  const resolvedFilters = isTeacher ? { ...filters, issued_by: user?.id } : filters;
  return useQuery({
    queryKey: queryKeys.warnings.list({ ...resolvedFilters, page, pageSize }),
    queryFn: () => getWarnings(resolvedFilters, page, pageSize),
    enabled: !!user?.id,
    placeholderData: keepPreviousData,
  });
}

export function useTeacherCourseStats(courseId: string | null) {
  return useQuery({
    queryKey: queryKeys.teacher.analytics(courseId!),
    queryFn: async () => {
      const { getCourseStats } = await import('@/infrastructure/repos/courses.service');
      return getCourseStats(courseId!);
    },
    enabled: !!courseId,
    staleTime: 60_000,
  });
}
