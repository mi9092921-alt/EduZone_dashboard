/**
 * Warning domain types — synced with Eduzone Schema v13.9.0
 * `warnings` table + `issue_warning` RPC.
 */

import type { Warning as BaseWarning, WarningSeverity } from '@eduzone/types';

import type { PaginatedResult } from './user.types';
export type { PaginatedResult };

export type { WarningSeverity };

// ── Severity labels ──────────────────────────────────────────────
export const SEVERITY_LABELS: Record<WarningSeverity, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

export const SEVERITY_COLORS: Record<WarningSeverity, { bg: string; text: string; dot: string }> = {
  1: { bg: '#DCFCE7', text: '#15803D', dot: '#22C55E' },
  2: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  3: { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' },
};

// ── Warning entity ───────────────────────────────────────────────
export interface Warning extends BaseWarning {
  // Joined fields
  student_name?: string;
  student_email?: string;
  student_avatar_url?: string;
  issuer_name?: string;
}

// ── Warning filters ──────────────────────────────────────────────
export interface WarningFilters {
  severity?: WarningSeverity;
  issued_by?: string;
  search?: string;
}

// ── Issue warning input ──────────────────────────────────────────
export interface IssueWarningInput {
  user_id: string;
  reason: string;
  severity: number;
  action: string;
}

// ── Teacher student (for selector dropdown) ──────────────────────
export interface TeacherStudent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  course_title: string;
}

// ── Student progress (for P4-TEACHER-003) ────────────────────────
export interface StudentProgress {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  progress_pct: number;
  last_watched: string | null;
  completed: boolean;
}

// ── Course analytics (for P4-TEACHER-004) ────────────────────────
export interface CourseAnalytics {
  enrolled: number;
  completed: number;
  avg_progress: number;
  total_views: number;
  active_students: number;
}

export interface LessonAnalytics {
  lesson_id: string;
  title: string;
  total_watch_time: number;
  avg_drop_off: number;
  engagement_count: number;
  rating: number;
}
