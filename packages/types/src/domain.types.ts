// ===== Domain Types — Synced with Eduzone Schema v13.9.0 =====

/** User account status values */
export type AccountStatus = 'active' | 'inactive' | 'locked' | 'suspended' | 'banned';

/** User roles */
export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student';

/** Warning severity levels */
export type WarningSeverity = 1 | 2 | 3;

/** Course status values */
export type CourseStatus = 'draft' | 'published' | 'archived';

/** Job queue status values */
export type JobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'dead';

/** Audit risk levels */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Feature flag entity */
export interface FeatureFlag {
  id: string;
  key: string;
  label: string | null;
  description: string | null;
  is_enabled: boolean;
  rollout_pct: number;
  starts_at: string | null;
  ends_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Core user type — v13: added email_hash, search_vector, avatar_url, timezone, locale, locked_at, locked_by */
export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  timezone: string | null;
  locale: string | null;
  primary_role: UserRole;
  account_status: AccountStatus;
  tenant_id: string;
  region_id: string | null;
  shard_key: number;
  token_version: number;
  warning_count: number;
  login_count: number;
  lock_reason: string | null;
  locked_at: string | null;
  locked_by: string | null;
  suspension_until: string | null;
  last_login: string | null;
  last_seen_at: string | null;
  /** v13: Server-generated SHA-256 hash for indexed lookups */
  email_hash?: string;
  /** v13: Server-generated tsvector for full-text search */
  search_vector?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Tenant entity — v13: added data_residency, metadata; removed unmaintained counters */
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: string;
  region_id: string;
  data_residency: string;
  shard_id: number;
  status: string;
  max_users: number;
  max_courses: number;
  max_storage_bytes: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Course entity — v13: added slug, region_id, search_vector */
export interface Course {
  id: string;
  tenant_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  slug: string | null;
  category: string | null;
  level: string | null;
  status: CourseStatus;
  is_free: boolean;
  price: number;
  region_id: string;
  thumbnail_url: string | null;
  /** v13: Server-generated tsvector for full-text search */
  search_vector?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Enrollment entity — v13: added tenant_id, enrolled_by, progress tracking columns */
export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  tenant_id: string;
  enrolled_by: string | null;
  status: 'active' | 'expired' | 'revoked' | 'completed';
  enrolled_at: string;
  expires_at: string | null;
  completed_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  /** v13: Denormalized progress tracking */
  total_lessons: number | null;
  completed_lessons: number | null;
  progress_pct: number | null;
  last_watched_at: string | null;
}

/** Warning entity — v13: added is_acknowledged, acknowledged_at */
export interface Warning {
  id: string;
  user_id: string;
  issued_by: string;
  tenant_id: string;
  reason: string;
  severity: WarningSeverity;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

/** Device entity — v13: added tenant_id, device_id (text), device_info, platform */
export interface Device {
  id: string;
  user_id: string;
  tenant_id: string;
  device_id: string;
  device_info: Record<string, unknown>;
  platform: 'android' | 'ios' | 'web' | null;
  trust_score: number;
  is_active: boolean;
  last_seen: string;
  created_at: string;
}

/** Session entity — v13: added tenant_id, device_id, user_agent, ended_at, end_reason */
export interface Session {
  id: string;
  user_id: string;
  tenant_id: string;
  device_id: string | null;
  started_at: string;
  updated_at: string;
  ip_address: string | null;
  user_agent: string | null;
  region_id: string | null;
  risk_score: number;
  is_active: boolean;
  ended_at: string | null;
  end_reason: string | null;
  deleted_at: string | null;
}

/** Section entity — v13: added tenant_id, is_published */
export interface Section {
  id: string;
  course_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Lesson entity — v13: added tenant_id */
export interface Lesson {
  id: string;
  section_id: string;
  course_id: string;
  tenant_id: string;
  title: string;
  order_index: number;
  is_published: boolean;
  is_preview: boolean;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Lesson Content entity — v13: added tenant_id */
export interface LessonContent {
  lesson_id: string;
  course_id: string;
  section_id: string;
  tenant_id: string;
  video_path: string;
  provider: 'youtube' | 's3' | 'bunny' | 'mux' | 'vimeo';
  duration_sec: number | null;
  captions_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Job queue entity — v13: added tenant_id, finished_at, error_message */
export interface Job {
  id: string;
  tenant_id: string | null;
  job_type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  locked_by_worker_id: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  run_at: string;
  started_at: string | null;
  finished_at: string | null;
  completed_at?: string | null; // Alias for finished_at in RPCs
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** User stats summary — v13: replaces mv_user_stats */
export interface UserStats {
  total_users: number;
  active_users: number;
  locked_users: number;
  suspended_users: number;
  banned_users: number;
  dau: number;
  wau: number;
  mau: number;
  last_updated: string;
}

/** Dashboard stats summary — v13 */
export interface DashboardStats {
  users: UserStats;
  courses: {
    total: number;
    published: number;
    enrollments: number;
  };
  system: {
    pending_jobs: number;
    failed_jobs_24h: number;
    health_score: number;
  };
}

/** Setting entity — synced with settings_kv */
export interface Setting {
  key: string;
  value: string;
  value_type: 'string' | 'integer' | 'boolean' | 'json';
  category: 'general' | 'security' | 'maintenance' | 'limits';
  label: string | null;
  description: string | null;
  is_public: boolean;
  is_encrypted: boolean;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Activity log queue entry (unflushed) — v13 */
export interface ActivityLogQueueEntry {
  id: string;
  user_id: string | null;
  tenant_id: string;
  activity_type: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  device_id: string | null;
  risk_level: RiskLevel;
  flushed_at: string | null;
  last_flush_attempt_at: string | null;
  created_at: string;
}

/** Activity log entity (flushed) — v13: partitioned */
export interface ActivityLog {
  id: string;
  seq: number;
  user_id: string | null;
  tenant_id: string;
  activity_type: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  device_id: string | null;
  risk_level: RiskLevel;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string;
}

/** Audit chain state — v13 */
export interface AuditChainState {
  id: number;
  last_seq: number;
  last_hash: string;
  updated_at: string;
}

/** User role assignment (junction table) — v13 */
export interface UserRoleAssignment {
  user_id: string;
  role_id: string;
  tenant_id: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
}

/** User permission cache entry — v13 */
export interface UserPermissionCacheEntry {
  user_id: string;
  tenant_id: string;
  permission_name: string;
  expires_at: string | null;
  cached_at: string;
}

/** Access Rule entity for IP/Geo gating */
export interface AccessRule {
  id: string;
  tenant_id: string;
  rule_type: 'time_window' | 'ip_whitelist' | 'geo_location' | 'device_type';
  rule_value: Record<string, any>;
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
}

/** Admin entity (Platform Level) */
export interface Admin {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  role: 'admin' | 'super_admin';
  created_at: string;
  deleted_at: string | null;
}

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
