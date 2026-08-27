import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/adapters/queries/keys';
import {
  createCourse,
  updateCourse,
  deleteCourse,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createLesson,
  createLessons,
  updateLesson,
  deleteLesson,
  reorderLessons,
  enrollStudent,
  revokeEnrollment,
  saveLearningObjectives,
  savePrerequisites,
} from '@/infrastructure/repos/courses.service';
import { container } from '@/container';
import type {
  CreateCourseInput,
  UpdateCourseInput,
  CreateSectionInput,
  CreateLessonInput,
} from '@/domain/types/course.types';

/**
 * Mutation hooks for course management actions.
 */

// ── Course mutations ─────────────────────────────────────────────

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCourseInput) => createCourse(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.all });
    },
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; data: UpdateCourseInput }) =>
      updateCourse(vars.id, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.all });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.id) });
    },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCourse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.all });
    },
  });
}

// ── Section mutations ────────────────────────────────────────────

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { courseId: string; data: CreateSectionInput }) =>
      createSection(vars.courseId, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; courseId: string; data: Partial<CreateSectionInput> }) =>
      updateSection(vars.id, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; courseId: string }) => deleteSection(vars.id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useReorderSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { courseId: string; updates: { id: string; order_index: number }[] }) =>
      reorderSections(vars.updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
    },
  });
}

// ── Lesson mutations ─────────────────────────────────────────────

export function useCreateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { sectionId: string; courseId: string; data: CreateLessonInput }) =>
      createLesson(vars.sectionId, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useCreateLessons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { sectionId: string; courseId: string; data: CreateLessonInput[] }) =>
      createLessons(vars.sectionId, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useUpdateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      courseId: string;
      data: Partial<CreateLessonInput>;
    }) => updateLesson(vars.id, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; courseId: string }) => deleteLesson(vars.id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
    },
  });
}

export function useReorderLessons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { courseId: string; updates: { id: string; order_index: number }[] }) =>
      reorderLessons(vars.updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.sections(vars.courseId) });
    },
  });
}

// ── Enrollment mutations ─────────────────────────────────────────

export function useEnrollStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      userId: string;
      courseId: string;
      expiresAt?: string;
    }) => {
      const { data: { user } } = await container.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return enrollStudent(vars.userId, vars.courseId, user.id, vars.expiresAt);
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.enrollments.byCourse(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.enrollments.byUser(vars.userId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.all });
    },
  });
}

export function useRevokeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      enrollmentId: string;
      courseId: string;
      reason: string;
    }) => {
      const { data: { user } } = await container.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return revokeEnrollment(vars.enrollmentId, user.id, vars.reason);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.enrollments.byCourse(vars.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.all });
    },
  });
}

export function useSaveLearningObjectives() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { courseId: string; objectives: string[] }) =>
      saveLearningObjectives(vars.courseId, vars.objectives),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.objectives(vars.courseId) });
    },
  });
}

export function useSavePrerequisites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { courseId: string; prerequisiteCourseIds: string[]; tenantId: string }) =>
      savePrerequisites(vars.courseId, vars.prerequisiteCourseIds, vars.tenantId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.prerequisites(vars.courseId) });
    },
  });
}

