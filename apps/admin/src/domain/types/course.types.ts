/**
 * Course domain types — synced with Eduzone Schema v13.9.0
 * `courses`, `sections`, `lessons`, `enrollments`, `vw_course_stats` tables.
 */

import type {
  Course as BaseCourse,
  CourseStatus,
  Section as BaseSection,
  Lesson as BaseLesson,
  LessonContent as BaseLessonContent,
  Enrollment as BaseEnrollment,
} from '@eduzone/types';

import type { PaginatedResult } from './user.types';
export type { PaginatedResult };

export type { CourseStatus };

// ── Course level ─────────────────────────────────────────────────
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

// ── Enrollment status ────────────────────────────────────────────
export type EnrollmentStatus = 'active' | 'revoked' | 'expired' | 'completed';

// ── Lesson Content ───────────────────────────────────────────────
export type VideoProvider = 'youtube' | 's3' | 'bunny' | 'mux' | 'vimeo';

// Sync with v13
export type LessonContent = BaseLessonContent;

// ── Lesson ───────────────────────────────────────────────────────
export interface Lesson extends BaseLesson {
  // Joined content
  content?: LessonContent;
}

// ── Section ──────────────────────────────────────────────────────
export interface Section extends BaseSection {
  // Nested lessons (when loaded via join)
  lessons?: Lesson[];
}

// ── Course ───────────────────────────────────────────────────────
export interface Course extends BaseCourse {
  // Joined fields
  teacher_name?: string;
  enrollment_count?: number;
  lesson_count?: number;
}

export interface CourseLearningObjective {
  id: string;
  course_id: string;
  objective: string;
  order_index: number;
}

export interface CoursePrerequisite {
  course_id: string;
  prerequisite_course_id: string;
  tenant_id: string;
  // Joined fields
  prerequisite_title?: string;
  prerequisite_level?: string;
}

// ── Course Detail (with nested sections+lessons) ─────────────────
export interface CourseDetail extends Course {
  sections: Section[];
}

// ── Enrollment ───────────────────────────────────────────────────
export interface Enrollment extends BaseEnrollment {
  // Joined fields
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_avatar_url?: string;
  course_title?: string;
}

/** Computed student display name from joined enrollment fields */
export function getEnrollmentStudentName(enrollment: Enrollment): string {
  const full = [enrollment.user_first_name, enrollment.user_last_name]
    .filter(Boolean)
    .join(' ');
  return full || enrollment.user_email || 'Unknown';
}

// ── Course Filters ───────────────────────────────────────────────
export interface CourseFilters {
  search?: string;
  status?: CourseStatus;
  category?: string;
  level?: string;
  is_free?: boolean;
  teacher_id?: string;
  tenant_id?: string;
}

// ── Course Stats (from mv_course_stats) ──────────────────────────
export interface CourseStats {
  course_id: string;
  tenant_id: string;
  enrolled: number;
  completed: number;
  avg_progress: number;
  total_views: number;
  refreshed_at: string;
}

// ── Aggregate stats for the courses list page ────────────────────
export interface CoursesOverviewStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
}

// ── Mutation inputs ──────────────────────────────────────────────
export interface CreateCourseInput {
  title: string;
  description?: string;
  category?: string;
  level?: string;
  is_free?: boolean;
  price?: number;
  slug?: string;
  teacher_id?: string;
  thumbnail_url?: string;
  status?: CourseStatus;
}

export interface UpdateCourseInput extends Omit<Partial<CreateCourseInput>, 'description' | 'category' | 'slug' | 'thumbnail_url' | 'teacher_id'> {
  status?: CourseStatus;
  description?: string | null;
  category?: string | null;
  slug?: string | null;
  thumbnail_url?: string | null;
  teacher_id?: string | null;
}

export interface CreateSectionInput {
  title: string;
  description?: string;
  order_index?: number;
  is_published?: boolean;
}

export interface CreateLessonInput {
  title: string;
  video_url?: string;
  order_index?: number;
  is_published?: boolean;
  is_preview?: boolean;
  duration_sec?: number;
}

// ── Video Views ──────────────────────────────────────────────────
export interface VideoView {
  id: string;
  user_id: string;
  tenant_id: string;
  lesson_id: string;
  course_id: string;
  /** v13: renamed from watch_time to watch_time_sec */
  watch_time_sec: number;
  is_vertical: boolean;
  aspect_ratio: number | null;
  /** v13: Snapshot of user state at view time */
  user_snapshot?: Record<string, unknown>;
  viewed_at: string;
  // Joined fields
  course_title?: string;
  lesson_title?: string;
}
