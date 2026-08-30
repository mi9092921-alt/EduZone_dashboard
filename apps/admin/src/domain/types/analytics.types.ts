/**
 * Analytics domain types — synced with materialized views in Eduzone Schema v13.9.0.
 */

// ── vw_course_stats (replaces mv_course_stats) ──────────────────
export interface MvCourseStats {
  course_id: string;
  tenant_id: string;
  enrolled: number;
  completed: number;
  avg_progress: number;
  total_views: number;
  refreshed_at: string;
}

// ── vw_daily_revenue ─────────────────────────────────────────────
export interface MvDailyRevenue {
  enrollment_date: string;
  tenant_id: string;
  new_enrollments: number;
  completions: number;
  daily_revenue: number;
}

// ── Daily activity summary (from mv_daily_activity_30d) ──────────
export interface DailyActivitySummary {
  activity_date: string;
  tenant_id: string;
  unique_users: number;
  total_events: number;
  lesson_views: number;
  logins: number;
}

// ── User registration trend ──────────────────────────────────────
export interface DailyCount {
  date: string;
  count: number;
}

// ── Course with stats (for top-N chart) ──────────────────────────
export interface CourseWithStats extends MvCourseStats {
  title?: string;
}

// ── Geographic distribution ──────────────────────────────────────
export interface GeoPoint {
  country_code: string;
  user_count: number;
}

export interface UserLocationLog {
  id: string;
  user_id: string;
  tenant_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  device_info: Record<string, unknown>;
  source: string | null;
  timestamp: string;
}

export interface CoordinatePoint {
  lat: number;
  lng: number;
  count?: number;
}
