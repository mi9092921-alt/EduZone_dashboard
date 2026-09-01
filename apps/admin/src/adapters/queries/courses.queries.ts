import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { queryKeys } from './keys';

import type { CourseFilters } from '@/domain/types/course.types';
import {
  getCourses,
  getCourseById,
  getCourseSections,
  getCourseEnrollments,
  getCourseStats,
  getCoursesOverviewStats,
  getVideoViewsByUser,
  getLearningObjectives,
  getPrerequisites,
  getPrerequisiteOptions,
} from '@/infrastructure/repos/courses.service';

/**
 * React Query hooks for courses domain data.
 */

export function useCourses(filters: CourseFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.courses.list({ ...filters, page, pageSize }),
    queryFn: () => getCourses(filters, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

export function useCourseById(id: string | null) {
  return useQuery({
    queryKey: queryKeys.courses.detail(id!),
    queryFn: () => getCourseById(id!),
    enabled: !!id,
  });
}

export function useCourseSections(courseId: string | null) {
  return useQuery({
    queryKey: queryKeys.courses.sections(courseId!),
    queryFn: () => getCourseSections(courseId!),
    enabled: !!courseId,
  });
}

export function useCourseEnrollments(courseId: string | null, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.enrollments.byCourse(courseId!),
    queryFn: () => getCourseEnrollments(courseId!, page, pageSize),
    enabled: !!courseId,
    placeholderData: (prev) => prev,
  });
}

export function useCourseStats(courseId: string | null) {
  return useQuery({
    queryKey: queryKeys.courses.stats(courseId!),
    queryFn: () => getCourseStats(courseId!),
    enabled: !!courseId,
    staleTime: 60_000,
  });
}

export function useCoursesOverviewStats(tenantId?: string) {
  return useQuery({
    queryKey: [...queryKeys.courses.overviewStats, tenantId],
    queryFn: () => getCoursesOverviewStats(tenantId),
    staleTime: 60_000,
  });
}

export function useVideoViews(userId: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['video_views', userId, page, pageSize],
    queryFn: () => getVideoViewsByUser(userId, page, pageSize),
    enabled: !!userId,
  });
}

export function useCourseLearningObjectives(courseId: string | null) {
  return useQuery({
    queryKey: queryKeys.courses.objectives(courseId!),
    queryFn: () => getLearningObjectives(courseId!),
    enabled: !!courseId,
  });
}

export function useCoursePrerequisites(courseId: string | null) {
  return useQuery({
    queryKey: queryKeys.courses.prerequisites(courseId!),
    queryFn: () => getPrerequisites(courseId!),
    enabled: !!courseId,
  });
}

export function useCoursePrerequisiteOptions(courseId: string | null, tenantId: string | null) {
  return useQuery({
    queryKey: queryKeys.courses.prerequisiteOptions(courseId!),
    queryFn: () => getPrerequisiteOptions(courseId!, tenantId!),
    enabled: !!courseId && !!tenantId,
  });
}
