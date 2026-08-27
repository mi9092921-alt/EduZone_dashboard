-- AUTO-GENERATED FROM CANONICAL SOURCE
-- Source of truth: ../../Eduzone_schema_v13.sql
-- Normalization pass #3 ownership rules applied.
CREATE INDEX IF NOT EXISTS idx_lesson_state_transitions_lesson_id ON audit.lesson_state_transitions(lesson_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_access_log_accessed_by ON audit.pii_access_log(accessed_by, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_access_log_user_id ON audit.pii_access_log(user_id, accessed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_regions_primary ON public.regions (is_primary) WHERE (is_primary = true);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug_active
  ON public.tenants (lower(slug))
  WHERE deleted_at IS NULL;

-- HIGH-08: Case-insensitive unique index for emails
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci_active
  ON public.users (tenant_id, pg_catalog.lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci
  ON public.users (lower(email), tenant_id)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_hash_tenant
  ON public.users (email_hash, tenant_id)
  WHERE email_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_active ON public.users (primary_role) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users (last_login DESC NULLS LAST) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_region ON public.users (region_id);

CREATE INDEX IF NOT EXISTS idx_users_search ON public.users USING GIN (search_vector) WHERE deleted_at IS NULL;

-- NOTE: idx_users_id is intentionally omitted - users.id is a PRIMARY KEY,
-- which already carries an implicit B-tree index in PostgreSQL.
-- The partial idx_users_auth_lookup covers the RLS hot path.
DROP INDEX IF EXISTS idx_users_id;

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles (role_id);

CREATE INDEX IF NOT EXISTS idx_user_permission_cache_expires
  ON public.user_permission_cache (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_validity_valid
  ON public.user_validity_cache (user_id, tenant_id) 
  WHERE is_valid = true;

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles (tenant_id);

CREATE INDEX IF NOT EXISTS idx_courses_teacher ON public.courses (teacher_id) WHERE teacher_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_slug_tenant_active ON public.courses (tenant_id, lower(slug)) WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_courses_search ON public.courses USING gin (search_vector) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_course_learning_objectives_course_order ON public.course_learning_objectives (course_id, order_index);

CREATE INDEX IF NOT EXISTS idx_sections_course_order ON public.sections (course_id, order_index) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_course_order ON public.lessons (course_id, section_id, order_index) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_section ON public.lessons (section_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_course ON public.lessons (course_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_preview ON public.lessons (course_id) WHERE is_preview AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_tenant ON public.lessons (tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_contents_course ON public.lesson_contents (course_id);

CREATE INDEX IF NOT EXISTS idx_lesson_contents_section ON public.lesson_contents (section_id);

CREATE INDEX IF NOT EXISTS idx_lesson_contents_tenant ON public.lesson_contents (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_progress_course_summary
  ON public.user_progress (user_id, course_id)
  WHERE lesson_id IS NULL;

-- DROP INDEX IF EXISTS idx_user_access_cache_course; -- Unused index removed
CREATE INDEX IF NOT EXISTS idx_user_access_cache_active
  ON private.user_access_cache (user_id, course_id)
  WHERE status = 'active';

-- Single-Active Session Fix
-- NOTE: A UNIQUE index on (user_id) WHERE is_active cannot be enforced across partitions.
-- authoritative rule: active_sessions table acts as the enforcer via its user_id PRIMARY KEY.
DROP INDEX IF EXISTS uq_sessions_active_per_user;

CREATE INDEX IF NOT EXISTS idx_enrollments_course_active ON public.enrollments (course_id, user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_enrollments_tenant ON public.enrollments (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollments_enrolled_by ON public.enrollments (enrolled_by) WHERE enrolled_by IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_user_course ON public.user_progress (user_id, course_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_completed_recent 
  ON public.user_progress(user_id, course_id, last_watched DESC) 
  WHERE completed = true;

CREATE INDEX IF NOT EXISTS idx_user_progress_course ON public.user_progress (course_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_lesson ON public.user_progress (lesson_id) WHERE lesson_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_lookup ON public.user_progress (user_id, lesson_id) WHERE lesson_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_recent ON public.user_progress (last_watched DESC) WHERE last_watched IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devices_user_active ON public.devices (user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON public.devices (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_active_device_id
  ON public.devices (device_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_sessions_one_active_per_user_lookup
  ON public.sessions (user_id, started_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_started ON public.sessions (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_device ON public.sessions (device_id) WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_views_user_time ON public.video_views (user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_views_course_time ON public.video_views (course_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_views_lesson_time ON public.video_views (lesson_id, viewed_at DESC) WHERE lesson_id IS NOT NULL;

-- Redundant BRIN index removed (composite PK is already optimal)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='todos' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_todos_user_status ON public.todos (user_id, is_completed, created_at DESC) WHERE deleted_at IS NULL;
  END IF;
  CREATE INDEX IF NOT EXISTS idx_todos_tenant ON public.todos (tenant_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_todos_deleted_at ON public.todos (deleted_at) WHERE deleted_at IS NOT NULL;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warnings' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_warnings_user ON public.warnings (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_warnings_issued_by ON public.warnings (issued_by);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions (role_id);
    CREATE INDEX IF NOT EXISTS idx_warnings_tenant ON public.warnings (tenant_id, created_at DESC);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active ON public.push_tokens (user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_push_tokens_tenant ON public.push_tokens (tenant_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_device_active
  ON public.push_tokens (user_id, device_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending
  ON public.push_deliveries (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_push_deliveries_notification
  ON public.push_deliveries (notification_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_location_user_time ON public.user_location_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_tenant_user_time ON public.user_location_logs (tenant_id, user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_last_location_tenant ON public.user_last_location (tenant_id);

-- ============================================================================
-- 005b_composite_indexes.sql
-- Missing composite indexes identified in v13 audit (added in v13.1.0).
-- These cover high-traffic dashboard queries, admin hot paths, and security
-- monitoring patterns that were causing seq-scans under load.
-- ============================================================================

-- Enrollments: "my courses" dashboard query + admin tenant overview
CREATE INDEX IF NOT EXISTS idx_enrollments_user_course_active
  ON public.enrollments(user_id, course_id)
  WHERE status = 'active';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_enrollments_tenant_status_created_include
      ON public.enrollments(tenant_id, status, created_at DESC)
      INCLUDE (user_id, course_id, progress_pct)
      WHERE status IN ('active', 'completed');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_auth_lookup
  ON public.users (id, tenant_id)
  WHERE account_status = 'active'
    AND deleted_at IS NULL;

-- Unified search index. Do not use CONCURRENTLY in this monolithic bootstrap
-- because the file is wrapped in a transaction.
CREATE INDEX IF NOT EXISTS idx_users_search_trgm
  ON public.users USING gin (
    (coalesce(email,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,'')) extensions.gin_trgm_ops
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='created_at') THEN
    -- Courses: tenant listing with status filter
    CREATE INDEX IF NOT EXISTS idx_courses_tenant_status_created
      ON public.courses(tenant_id, status, created_at DESC)
      WHERE deleted_at IS NULL;
  END IF;
END $$;

-- idx_user_notifications_unread is created after public.user_notifications exists (see 005b_deferred_indexes below)

-- User progress: resume-watching query
CREATE INDEX IF NOT EXISTS idx_user_progress_tenant_user_watched
  ON public.user_progress(tenant_id, user_id, last_watched DESC)
  WHERE last_watched IS NOT NULL;

-- User roles: is_current_user_admin() hot path (called in every admin check)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant_active
  ON public.user_roles(user_id, tenant_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at
  ON public.user_roles (expires_at)
  WHERE expires_at IS NOT NULL;

-- idx_activity_logs_tenant_risk_time is created after public.activity_logs exists (see 005b_deferred_indexes below)

-- Sessions: security dashboard - active high-risk sessions per tenant.
-- Single-active-session enforcement is handled by trg_ensure_single_active_session().
-- A UNIQUE partial index on (user_id) cannot be enforced on the partitioned parent
-- because PostgreSQL requires unique indexes on partitioned tables to include started_at.
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_risk_active
  ON public.sessions(tenant_id, risk_score DESC, started_at DESC)
  WHERE is_active = true AND risk_score > 50;

CREATE INDEX IF NOT EXISTS idx_sessions_ended_at
  ON public.sessions (ended_at)
  WHERE ended_at IS NOT NULL;

-- User permission cache: user_has_permission() lookup.
-- NOTE: expires_at filter cannot be in the predicate (now() is STABLE, not IMMUTABLE - error 42P17).
-- The filter WHERE expires_at IS NULL OR expires_at > now() is enforced at query time instead.
CREATE INDEX IF NOT EXISTS idx_user_perm_cache_lookup
  ON public.user_permission_cache(user_id, permission_name, tenant_id, expires_at);

-- idx_notifications_tenant_created is created after public.notifications exists (see 005b_deferred_indexes below)

-- Devices: tenant-scoped active device lookup (devices table already exists at this point)
CREATE INDEX IF NOT EXISTS idx_devices_tenant_user_active
  ON public.devices(tenant_id, user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_alert_log_tenant ON audit.alert_log (tenant_id);

CREATE INDEX IF NOT EXISTS idx_alert_log_user ON audit.alert_log (user_id);

-- MEDIUM-03: Composite index for notifications timeline
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_region_created
  ON public.notifications(tenant_id, region_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- MEDIUM-03: Composite index for course discovery
CREATE INDEX IF NOT EXISTS idx_courses_tenant_category_published
  ON public.courses(tenant_id, category, status)
  WHERE deleted_at IS NULL AND status = 'published';

-- CRIT-03 FIX: Use NULLS NOT DISTINCT for reliable uniqueness on mixed NULL columns (PG15+)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_limits_safe
  ON public.rate_limits (tenant_id, user_id, ip_address, device_id, action, window_start)
  NULLS NOT DISTINCT;

-- HIGH-07 FIX: Add deduplication index to prevent duplicate jobs
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_dedupe 
  ON internal.job_queue (job_type, payload_hash)
  WHERE status IN ('pending', 'processing');

-- FIX #7: Add Missing Foreign Key Indexes (moved here to resolve dependency order)
CREATE INDEX IF NOT EXISTS idx_course_prerequisites_prerequisite_course_id ON public.course_prerequisites (prerequisite_course_id);

CREATE INDEX IF NOT EXISTS idx_feature_flag_roles_role ON public.feature_flag_roles (role_id);

CREATE INDEX IF NOT EXISTS idx_feature_flag_users_user ON public.feature_flag_users (user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_active ON public.user_roles (user_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_active ON public.user_roles (tenant_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_user_roles_role_active ON public.user_roles (role_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_user_permission_cache_tenant ON public.user_permission_cache (tenant_id);

CREATE INDEX IF NOT EXISTS idx_cache_invalidation_unprocessed ON public.cache_invalidation_queue (created_at) WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_access_user_time ON audit.lesson_access_log (user_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_access_lesson_time ON audit.lesson_access_log (lesson_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_access_course_time ON audit.lesson_access_log (course_id, accessed_at DESC);

-- Guard: CREATE INDEX IF NOT EXISTS only prevents duplicate index names;
-- it still throws 42703 when the column doesn't exist.
-- Wrapping in DO blocks lets the migration complete even when these tables
-- are mid-rebuild; the indexes will be created on the next idempotent run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_log_queue' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_activity_log_queue_pending
      ON public.activity_log_queue (created_at)
      WHERE flushed_at IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_activity_logs_seq
      ON public.activity_logs (seq DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_time
      ON public.activity_logs (tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_time
      ON public.activity_logs (user_id, created_at DESC);
    -- Security monitoring: elevated-risk events (deferred from 005b)
    CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_risk_time_covering
      ON public.activity_logs (tenant_id, risk_level, created_at DESC)
      INCLUDE (user_id, activity_type, details)
      WHERE risk_level IN ('high', 'critical');
      
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at_brin 
      ON public.activity_logs USING brin (created_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_targets_user ON public.notification_targets (user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
      ON public.notifications (tenant_id, created_at DESC)
      WHERE deleted_at IS NULL;
  END IF;
END $$;

-- 005b_deferred_indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_notifications' AND column_name='created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user
      ON public.user_notifications (user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_tenant
      ON public.user_notifications (tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at
      ON public.user_notifications (created_at);
    -- HIGH-05: Partial index for optimized unread notification lookups
    CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
      ON public.user_notifications (user_id, created_at DESC)
      WHERE is_read = false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lesson_access_tenant_time
  ON audit.lesson_access_log(tenant_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_rules_tenant_active ON public.access_rules (tenant_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_user_access_rules_rule ON public.user_access_rules (rule_id);

CREATE INDEX IF NOT EXISTS idx_rate_limits_action_blocked ON public.rate_limits (action, blocked_until) WHERE blocked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_queue_pending ON internal.job_queue (priority DESC, run_at ASC) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_job_queue_status_tenant
  ON internal.job_queue(status, tenant_id, created_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_job_queue_retry ON internal.job_queue (status, next_retry_at) WHERE status = 'pending' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_queue_stale_locks ON internal.job_queue (lock_expires_at) WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_job_queue_tenant_id ON internal.job_queue (tenant_id);

CREATE INDEX IF NOT EXISTS idx_job_queue_locked_by_worker_id
  ON internal.job_queue (locked_by_worker_id)
  WHERE locked_by_worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_access_cache_course_id ON private.user_access_cache (course_id);

CREATE INDEX IF NOT EXISTS idx_user_progress_lesson_id 
  ON public.user_progress(lesson_id, user_id, completed);

CREATE INDEX IF NOT EXISTS idx_courses_discovery 
  ON public.courses(tenant_id, category, status, created_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_user_timeline 
  ON public.user_progress(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- MEDIUM-03: Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_multi_filter
  ON public.notifications(tenant_id, region_id, created_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_timeline
  ON public.user_notifications(user_id, tenant_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_analytics
  ON public.enrollments(tenant_id, course_id, status, enrolled_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_course_analytics
  ON public.user_progress(course_id, tenant_id, completed, updated_at DESC);

-- MEDIUM-03: Covering indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_covering
  ON public.enrollments(tenant_id, user_id)
  INCLUDE (course_id, enrolled_at, progress_pct, completed_at)
  WHERE deleted_at IS NULL;

-- HIGH-08: Email hash index
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON public.users(email_hash);

-- MED-07 FIX: Partition-level indexes for sessions and activity logs.
DO $$
DECLARE
  v_partition text;
BEGIN
  FOR v_partition IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^(sessions|activity_logs)_[0-9]{4}$'
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_user_id ON public.%I (user_id)', v_partition, v_partition);
  END LOOP;
END $$;

-- 3.1 Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users (created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON public.users USING gin (email extensions.gin_trgm_ops) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON public.enrollments(user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON public.enrollments(course_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_tenant_status ON public.enrollments(tenant_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_progress_course_id ON public.user_progress(course_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_id ON public.lesson_contents(lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_contents_course_section ON public.lesson_contents(course_id, section_id);

-- Enterprise Hardening: Composite Indexes
CREATE INDEX IF NOT EXISTS idx_lessons_course_published ON public.lessons(course_id, is_published);

CREATE INDEX IF NOT EXISTS idx_lessons_tenant_published ON public.lessons(tenant_id, is_published) WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant_role ON public.user_roles(user_id, tenant_id, role_id) WHERE is_active = true;

-- Partial indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_users_active_tenant ON public.users (tenant_id, account_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_active_tenant ON public.enrollments (tenant_id, status) WHERE status = 'active';

-- Ensure every FK has a supporting left-prefix index before the hard assertion.
DO $$
DECLARE
  r record;
  v_index_name text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.conrelid AS table_oid,
      array_agg(a.attname ORDER BY cols.ord) AS column_names,
      string_agg(format('%I', a.attname), ', ' ORDER BY cols.ord) AS column_sql
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND n.nspname IN ('public', 'audit', 'internal', 'private')
    GROUP BY n.nspname, c.relname, con.conname, con.conrelid
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index i
      WHERE i.indrelid = r.table_oid
        AND i.indisvalid
        AND (
          SELECT array_agg(ia.attname ORDER BY idx_cols.ord)
          FROM unnest(i.indkey) WITH ORDINALITY AS idx_cols(attnum, ord)
          JOIN pg_attribute ia ON ia.attrelid = i.indrelid AND ia.attnum = idx_cols.attnum
          WHERE idx_cols.ord <= array_length(r.column_names, 1)
        ) = r.column_names
    ) THEN
      v_index_name := left(
        'idx_fk_' || r.table_name || '_' || array_to_string(r.column_names, '_'),
        55
      ) || '_' || substr(md5(r.schema_name || '.' || r.table_name || '.' || r.constraint_name), 1, 7);

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
        v_index_name,
        r.schema_name,
        r.table_name,
        r.column_sql
      );
    END IF;
  END LOOP;
END $$;

-- Advisor remediation: drop duplicate indexes (keep canonical idx_* names from parent partitions).
DROP INDEX IF EXISTS public.idx_role_permissions_reverse;
DROP INDEX IF EXISTS public.idx_role_permissions_permission;
DROP INDEX IF EXISTS public.idx_user_roles_reverse;
DROP INDEX IF EXISTS public.idx_course_prerequisites_reverse;
DROP INDEX IF EXISTS public.idx_course_prerequisites_prerequisite;
DROP INDEX IF EXISTS public.idx_courses_active_published;
DROP INDEX IF EXISTS public.idx_user_notifications_unread_timeline;

DO $$
DECLARE
  v_partition text;
BEGIN
  FOR v_partition IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'activity_logs_%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.idx_%s_tenant_time', v_partition);
    EXECUTE format('DROP INDEX IF EXISTS public.idx_%s_user_time', v_partition);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- video_cache & download_logs Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_video_hash ON public.video_cache (url_hash);
CREATE INDEX IF NOT EXISTS idx_download_logs_user ON public.download_logs (user_id);

-- ============================================================================
-- Feature Flags — runtime and administrative indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feature_flags_active
  ON public.feature_flags (status, is_enabled, updated_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_feature_flags_updated_at
  ON public.feature_flags (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_flag_tenant
  ON public.tenant_feature_flags (flag_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_feature_flag_users_eval
  ON public.feature_flag_users (tenant_id, user_id, flag_id);

CREATE INDEX IF NOT EXISTS idx_feature_flag_users_flag_user
  ON public.feature_flag_users (flag_id, user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_feature_flag_roles_eval
  ON public.feature_flag_roles (tenant_id, role_id, flag_id);

CREATE INDEX IF NOT EXISTS idx_feature_flag_roles_flag_role
  ON public.feature_flag_roles (flag_id, role_id, tenant_id);
