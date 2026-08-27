-- AUTO-GENERATED FROM CANONICAL SOURCE
-- Source of truth: ../../Eduzone_schema_v13.sql
-- Normalization pass #3 ownership rules applied.
-- CRIT-03: Controlled PII Access View
-- MEDIUM-04: Active views
CREATE OR REPLACE VIEW public.users_active AS
SELECT * FROM public.users WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.users_with_pii_access AS
SELECT
  u.*,
  CASE
    WHEN auth.uid() = u.id OR public.is_admin_with_session_validation() THEN
      public.decrypt_pii(u.email_encrypted, private.get_kms_key())
    ELSE NULL
  END AS email_decrypted,
  CASE
    WHEN auth.uid() = u.id OR public.is_admin_with_session_validation() THEN
      public.decrypt_pii(u.phone_encrypted, private.get_kms_key())
    ELSE NULL
  END AS phone_decrypted
FROM public.users u;

-- MEDIUM-04: Active views
CREATE OR REPLACE VIEW public.courses_active AS
SELECT * FROM public.courses WHERE deleted_at IS NULL;

-- MEDIUM-04: Active views
CREATE OR REPLACE VIEW public.lessons_active AS
SELECT * FROM public.lessons WHERE deleted_at IS NULL;

-- MEDIUM-04: Active views
CREATE OR REPLACE VIEW public.enrollments_active AS
SELECT * FROM public.enrollments WHERE deleted_at IS NULL;

-- MED-01 FIX: Dynamic enrollment stats view using aggregation instead of correlated subqueries.
CREATE OR REPLACE VIEW public.enrollments_with_stats AS
SELECT
  e.id,
  e.user_id,
  e.course_id,
  e.tenant_id,
  e.status,
  e.enrolled_at,
  e.expires_at,
  e.completed_at,
  e.last_watched_at,
  COUNT(DISTINCT l.id) FILTER (WHERE l.deleted_at IS NULL) as total_lessons,
  COUNT(DISTINCT up.id) FILTER (WHERE up.completed) as completed_lessons,
  CASE 
    WHEN COUNT(DISTINCT l.id) FILTER (WHERE l.deleted_at IS NULL) = 0 THEN 0::numeric(5,2)
    ELSE (COUNT(DISTINCT up.id) FILTER (WHERE up.completed)::numeric(5,2) / 
          NULLIF(COUNT(DISTINCT l.id) FILTER (WHERE l.deleted_at IS NULL), 0)) * 100
  END as progress_pct,
  e.created_at,
  e.updated_at
FROM public.enrollments e
LEFT JOIN public.lessons l ON l.course_id = e.course_id
LEFT JOIN public.user_progress up ON up.user_id = e.user_id AND up.course_id = e.course_id AND up.lesson_id = l.id
GROUP BY e.id, e.user_id, e.course_id, e.tenant_id, e.status, e.enrolled_at, e.expires_at, e.completed_at, e.last_watched_at, e.created_at, e.updated_at;

-- MED-04: Active sessions view
CREATE OR REPLACE VIEW public.sessions_active AS
SELECT * FROM public.sessions WHERE deleted_at IS NULL AND is_active = true;

-- Legacy public.vw_course_stats matview removed; tenant-scoped VIEW over private.mv_course_stats below.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.vw_student_progress_timeline AS
SELECT
  u.id AS student_id,
  u.tenant_id,
  COUNT(DISTINCT c.id) FILTER (WHERE e.status = 'active') AS active_courses,
  COUNT(DISTINCT c.id) FILTER (WHERE e.status = 'completed') AS completed_courses,
  ROUND(AVG(e.progress_pct), 2) AS overall_progress_pct,
  MAX(e.updated_at) AS last_activity_at
FROM public.users u
LEFT JOIN public.enrollments e ON u.id = e.user_id
LEFT JOIN public.courses c ON e.course_id = c.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.tenant_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.vw_daily_revenue AS
SELECT
  DATE(e.enrolled_at) AS enrollment_date,
  e.tenant_id,
  COUNT(DISTINCT e.user_id) AS new_enrollments,
  COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'completed') AS completions,
  SUM(c.price) FILTER (WHERE c.price IS NOT NULL) AS daily_revenue
FROM public.enrollments e
LEFT JOIN public.courses c ON e.course_id = c.id
WHERE e.deleted_at IS NULL
GROUP BY DATE(e.enrolled_at), e.tenant_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.vw_course_stats AS
SELECT
  c.id,
  c.tenant_id,
  c.title,
  c.category,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.status = 'active') AS active_students,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.status = 'completed') AS completed_students,
  ROUND(AVG(e.progress_pct), 2) AS avg_progress_pct,
  MAX(e.enrolled_at) AS last_enrollment_at
FROM public.courses c
LEFT JOIN public.enrollments e ON c.id = e.course_id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.tenant_id, c.title, c.category;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.vw_student_progress_timeline AS
SELECT
  u.id AS student_id,
  u.tenant_id,
  COUNT(DISTINCT e.course_id) FILTER (WHERE e.status = 'active') AS active_courses,
  COUNT(DISTINCT e.course_id) FILTER (WHERE e.status = 'completed') AS completed_courses,
  ROUND(AVG(e.progress_pct), 2) AS overall_progress_pct,
  MAX(e.updated_at) AS last_activity_at
FROM public.users u
LEFT JOIN public.enrollments e ON u.id = e.user_id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.tenant_id;

-- MED-08 FIX: System health monitoring view.
CREATE OR REPLACE VIEW public.system_health_check AS
SELECT
  'cache_invalidation_queue' as metric,
  pg_catalog.count(*) as total_count,
  pg_catalog.count(*) FILTER (WHERE processed_at IS NULL) as pending_count
FROM public.cache_invalidation_queue
UNION ALL
SELECT
  'expired_permissions',
  pg_catalog.count(*),
  pg_catalog.count(*) FILTER (WHERE expires_at < pg_catalog.now())
FROM public.user_permission_cache;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.mv_user_stats AS
SELECT
  tenant_id,
  count(*)                                                        AS total_users,
  count(*) FILTER (WHERE account_status = 'active')              AS active_users,
  count(*) FILTER (WHERE account_status = 'locked')              AS locked_users,
  count(*) FILTER (WHERE account_status = 'suspended')           AS suspended_users,
  count(*) FILTER (WHERE account_status = 'banned')              AS banned_users,
  count(*) FILTER (WHERE primary_role = 'student')               AS student_count,
  count(*) FILTER (WHERE primary_role = 'teacher')               AS teacher_count,
  count(*) FILTER (WHERE primary_role = 'admin')                 AS admin_count,
  count(*) FILTER (WHERE last_login > now() - interval '24h')    AS dau,
  count(*) FILTER (WHERE last_login > now() - interval '7d')     AS wau,
  count(*) FILTER (WHERE last_login > now() - interval '30d')    AS mau,
  now()                                                           AS refreshed_at
FROM public.users
WHERE deleted_at IS NULL
GROUP BY tenant_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.mv_course_stats AS
SELECT
  c.id         AS course_id,
  c.tenant_id,
  count(e.id)  FILTER (WHERE e.status = 'active')    AS enrolled,
  count(e.id)  FILTER (WHERE e.status = 'completed') AS completed,
  round(avg(up.progress_pct)::numeric, 2)            AS avg_progress,
  count(vv.id)                                        AS total_views,
  now()                                               AS refreshed_at
FROM public.courses c
LEFT JOIN public.enrollments    e  ON e.course_id  = c.id
LEFT JOIN public.user_progress  up ON up.course_id = c.id AND up.lesson_id IS NULL
LEFT JOIN public.video_views    vv ON vv.course_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.tenant_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.mv_course_stats_tenant AS
SELECT
  tenant_id,
  count(*) FILTER (WHERE deleted_at IS NULL)                          AS total_courses,
  count(*) FILTER (WHERE status = 'published' AND deleted_at IS NULL) AS published_courses,
  count(*) FILTER (WHERE status = 'draft'     AND deleted_at IS NULL) AS draft_courses,
  count(*) FILTER (WHERE status = 'archived'  AND deleted_at IS NULL) AS archived_courses,
  count(*) FILTER (WHERE NOT is_free          AND deleted_at IS NULL) AS paid_courses,
  now()                                                                AS refreshed_at
FROM public.courses
GROUP BY tenant_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.mv_hourly_activity_48h AS
SELECT
  date_trunc('hour', created_at) AS hour_bucket,
  tenant_id,
  activity_type,
  risk_level,
  count(*)                       AS event_count,
  count(DISTINCT user_id)        AS unique_users
FROM public.activity_logs
WHERE created_at > now() - interval '48 hours'
GROUP BY 1, 2, 3, 4
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS private.mv_daily_activity_30d AS
SELECT
  tenant_id,
  created_at::date                                              AS activity_date,
  count(DISTINCT user_id)                                       AS unique_users,
  count(*)                                                      AS total_events,
  count(*) FILTER (WHERE activity_type = 'lesson_view')         AS lesson_views,
  count(*) FILTER (WHERE activity_type = 'login')               AS logins
FROM public.activity_logs
WHERE created_at > now() - interval '30 days'
GROUP BY tenant_id, created_at::date
WITH NO DATA;

-- ============================================================================
-- Materialized View Indexes
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_vw_student_progress_pk ON public.vw_student_progress_timeline(student_id);
CREATE INDEX IF NOT EXISTS idx_vw_student_progress_tenant ON public.vw_student_progress_timeline(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vw_daily_revenue_unique ON public.vw_daily_revenue(enrollment_date, tenant_id);
CREATE INDEX IF NOT EXISTS idx_vw_daily_revenue_date ON public.vw_daily_revenue(enrollment_date DESC, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_private_vw_course_stats_pk ON private.vw_course_stats(id);
CREATE INDEX IF NOT EXISTS idx_private_vw_course_stats_tenant ON private.vw_course_stats(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_private_vw_student_progress_pk ON private.vw_student_progress_timeline(student_id);
CREATE INDEX IF NOT EXISTS idx_private_vw_student_progress_tenant ON private.vw_student_progress_timeline(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_stats_tenant ON private.mv_user_stats (tenant_id);

-- PERF-2A: Composite unique index on mv_course_stats (course_id, tenant_id).
-- This is the strict prerequisite for REFRESH MATERIALIZED VIEW CONCURRENTLY:
-- PostgreSQL requires a unique index that covers every column in the GROUP BY
-- clause (c.id, c.tenant_id). The single-column (course_id) index alone is
-- insufficient when tenant_id is part of the projection.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_course_stats_course_tenant
  ON private.mv_course_stats (course_id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_course_stats_course ON private.mv_course_stats (course_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_course_stats_tenant ON private.mv_course_stats_tenant (tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_hourly_activity_48h ON private.mv_hourly_activity_48h (hour_bucket DESC, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_activity_48h_unique
  ON private.mv_hourly_activity_48h (hour_bucket, tenant_id, activity_type, risk_level);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_activity_30d ON private.mv_daily_activity_30d (tenant_id, activity_date);

-- ============================================================================
-- INTEGRATED PATCHES v13.1 → v13.26
-- All root causes fixed directly in schema (no separate patch files needed).
-- Safe to run repeatedly — all statements are idempotent.
-- ============================================================================

-- Ã¢â€ â‚¬Ã¢â€ â‚¬ A. Public tenant-scoped views over private materialized views Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬
-- Fixes: patches 2, 15, 22 (mv_course_stats / vw_course_stats 404)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vw_course_stats' AND c.relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.vw_course_stats CASCADE';
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.vw_course_stats AS
SELECT
  course_id,
  tenant_id,
  enrolled,
  completed,
  avg_progress,
  total_views,
  refreshed_at
FROM private.mv_course_stats
WHERE tenant_id = public.get_current_tenant_id()
   OR public.is_current_user_super_admin();

-- Compatibility alias so both names work
CREATE OR REPLACE VIEW public.mv_course_stats AS SELECT * FROM public.vw_course_stats;

-- Harden exposed public views to run with caller privileges.
ALTER VIEW IF EXISTS public.users_active SET (security_invoker = true);

ALTER VIEW IF EXISTS public.users_with_pii_access SET (security_invoker = true);

ALTER VIEW IF EXISTS public.courses_active SET (security_invoker = true);

ALTER VIEW IF EXISTS public.lessons_active SET (security_invoker = true);

ALTER VIEW IF EXISTS public.enrollments_active SET (security_invoker = true);

ALTER VIEW IF EXISTS public.enrollments_with_stats SET (security_invoker = true);

ALTER VIEW IF EXISTS public.sessions_active SET (security_invoker = true);

ALTER VIEW IF EXISTS public.system_health_check SET (security_invoker = true);

ALTER VIEW IF EXISTS public.vw_course_stats SET (security_invoker = true);

ALTER VIEW IF EXISTS public.mv_course_stats SET (security_invoker = true);

-- ============================================================================
-- Feature Flags — administrative catalog view
-- ============================================================================

CREATE OR REPLACE VIEW public.feature_flags_admin AS
SELECT
  ff.id,
  ff.key,
  ff.description,
  ff.is_enabled,
  ff.rollout_pct,
  ff.status,
  ff.enabled_from,
  ff.enabled_until,
  ff.version,
  ff.created_by,
  ff.updated_by,
  ff.created_at,
  ff.updated_at,
  (
    SELECT count(*)
    FROM public.tenant_feature_flags tff
    WHERE tff.flag_id = ff.id
  ) AS tenant_override_count,
  (
    SELECT count(*)
    FROM public.feature_flag_users ffu
    WHERE ffu.flag_id = ff.id
  ) AS user_override_count,
  (
    SELECT count(*)
    FROM public.feature_flag_roles ffr
    WHERE ffr.flag_id = ff.id
  ) AS role_override_count
FROM public.feature_flags ff;

ALTER VIEW public.feature_flags_admin SET (security_invoker = true);

