-- AUTO-GENERATED FROM CANONICAL SOURCE
-- Source of truth: ../../Eduzone_schema_v13.sql
-- Normalization pass #3 ownership rules applied.

-- Section 12: the client may read only its own server entitlement rows.
-- Creation/revocation is RPC-only; authenticated clients get no direct
-- INSERT/UPDATE/DELETE path to the authorization record.
ALTER TABLE public.offline_download_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_download_entitlements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offline_entitlements_select_own
  ON public.offline_download_entitlements;
CREATE POLICY offline_entitlements_select_own
  ON public.offline_download_entitlements
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()));

DROP POLICY IF EXISTS offline_entitlements_service_all
  ON public.offline_download_entitlements;
CREATE POLICY offline_entitlements_service_all
  ON public.offline_download_entitlements
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_incidents_insert ON public.security_incidents;
CREATE POLICY security_incidents_insert ON public.security_incidents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS security_incidents_admin_select ON public.security_incidents;
CREATE POLICY security_incidents_admin_select ON public.security_incidents
  FOR SELECT TO authenticated
  USING (public.is_admin_with_session_validation());

ALTER TABLE public.setting_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS setting_definitions_admin_all ON public.setting_definitions;

CREATE POLICY setting_definitions_admin_all ON public.setting_definitions
  FOR ALL TO authenticated
  USING (public.is_admin_with_session_validation())
  WITH CHECK (public.is_admin_with_session_validation());

-- CRIT-02 FIX: Enable RLS on tenants.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

-- Own-tenant read

-- Super-admin read-all

-- Super-admin full write

-- Anon: no access
DROP POLICY IF EXISTS tenants_anon_deny ON public.tenants;

CREATE POLICY tenants_anon_deny ON public.tenants
  FOR SELECT TO anon USING (false);

-- admins_legacy table removed (fully migrated to RBAC via public.user_roles).

-- CRIT-01 FIX: Integrated RLS policies for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- AUTH-BUG-01 FIX: do NOT FORCE row level security on public.users.
-- RLS is still fully ENABLEd and enforced for every real client role
-- (`anon`/`authenticated` via PostgREST are never exempt from RLS
-- regardless of FORCE -- only the table owner/superuser is ever
-- affected by FORCE). This table is queried internally, as the table
-- owner, by SECURITY DEFINER helper functions that are themselves
-- called BY this table's own policies (validate_user_session(),
-- is_admin_with_session_validation(), get_auth_user_id(),
-- get_current_tenant_id(), is_user_valid_cached(), etc. all run
-- `SELECT ... FROM public.users`, and users_select_merged below calls
-- is_admin_with_session_validation()/get_auth_user_id()). FORCE ROW
-- LEVEL SECURITY strips the owner-bypass those helpers depend on to
-- avoid recursion, so the helper's own query re-enters the same
-- policy that called it -> infinite recursion ("42P17 infinite
-- recursion detected in policy for relation users"), which broke
-- every post-authentication step of login (bind_device_for_current_user,
-- the users profile PATCH, etc.). See also public.user_roles below,
-- which has the identical pattern and must stay un-forced for the
-- same reason.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- AUTH-BUG-01 FIX: same reasoning as public.users above -- do NOT
-- FORCE row level security here. is_admin_with_session_validation()
-- (SECURITY DEFINER) queries public.user_roles internally, and
-- user_roles_select_merged below calls is_admin_with_session_validation()
-- itself. FORCE would make that internal query re-enter the same
-- policy -> infinite recursion on public.user_roles, exactly like the
-- public.users case, and would resurface as soon as anything
-- (devices_admin_all, sessions_admin_all, etc.) calls
-- is_admin_with_session_validation() -- which includes the
-- bind_device_for_current_user() login step. RLS remains fully
-- ENABLEd and enforced for anon/authenticated either way.

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS: only admins and service_role can write; tenants read their own overrides
DROP POLICY IF EXISTS tenant_settings_select ON public.tenant_settings;

CREATE POLICY tenant_settings_select ON public.tenant_settings
  FOR SELECT TO authenticated USING (tenant_id = public.get_current_tenant_id());

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- AUTH-BUG-01-style fix (same class of bug as public.users/public.user_roles
-- above): public.has_course_access(uuid, uuid) is SECURITY DEFINER, owned by
-- the table owner, and queries public.enrollments internally.
-- enrollments_select_policy in turn queries public.courses, and
-- courses_select_merged calls has_course_access(id) as one of its OR
-- branches. FORCE ROW LEVEL SECURITY on courses/enrollments would strip the
-- table-owner bypass that call chain relies on, turning
-- courses -> has_course_access -> enrollments -> courses into a real
-- infinite-recursion path (42P17) the first time that OR branch is actually
-- evaluated. RLS remains fully ENABLEd and enforced for anon/authenticated
-- (and service_role already carries BYPASSRLS independently of FORCE).
-- Do not FORCE either table without first verifying has_course_access() no
-- longer queries a FORCE-RLS table from inside a policy that can call it.

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- AUTH-BUG-01-style regression (found via a live-Postgres repro, not just
-- static review: FORCE + a policy scoped only `TO authenticated` was
-- reproduced end-to-end -- see the reasoning below for the exact repro).
-- public.update_lesson_progress() is SECURITY DEFINER and does the actual
-- INSERT ... ON CONFLICT DO UPDATE into this table itself (after its own
-- explicit auth.uid()/assert_tenant()/has_course_access()/
-- is_teacher_of_course()/is_admin_with_session_validation() checks --
-- those checks are unaffected by this change and remain the real
-- authorization boundary for that RPC). During that INSERT, current_user
-- is the function owner, not `authenticated`. user_progress_insert_merged
-- / user_progress_update_merged below are (correctly, for direct
-- PostgREST access) scoped `TO authenticated` only -- the owner is not a
-- member of that role, so with FORCE in effect no policy ever matches and
-- every call to update_lesson_progress() fails with "new row violates
-- row-level security policy for table user_progress", 100% of the time,
-- regardless of whether the caller is legitimately authorized. This is
-- the exact bug behind the client-visible "watched" checkbox in
-- lesson_tile.dart always showing a generic error (the same
-- generic-"حدث خطأ"-on-legitimate-write symptom as AVATAR-BUG-01 in
-- 10_permissions.sql, same root cause class). Removing FORCE restores the
-- table-owner bypass that update_lesson_progress()'s write relies on --
-- exactly the same fix already applied to
-- users/user_roles/courses/enrollments above for the identical reason.
-- RLS remains fully ENABLEd and enforced for any direct anon/authenticated
-- access to this table (there is none in this app today; all writes go
-- through the RPC), so this does not weaken the tenant/user isolation
-- user_progress_select_policy/user_progress_insert_merged/
-- user_progress_update_merged/user_progress_delete_merged still enforce
-- for that path.

DROP POLICY IF EXISTS user_progress_select_policy ON public.user_progress;

CREATE POLICY user_progress_select_policy ON public.user_progress
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND tenant_id = public.get_current_tenant_id()
    AND (
      user_id = (select auth.uid())
      OR public.is_admin_with_session_validation()
      OR EXISTS (
        SELECT 1
        FROM public.courses c
        WHERE c.id = user_progress.course_id
          AND c.tenant_id = user_progress.tenant_id
          AND c.teacher_id = (select auth.uid())
      )
    )
  );

ALTER TABLE public.session_locks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.session_snapshots ENABLE ROW LEVEL SECURITY;

-- CRIT-04 FIX: Use O(1) active_sessions PK lookup.
-- Old IN (SELECT id FROM sessions WHERE user_id=...) forces a full cross-partition
-- scan on the partitioned sessions table and cannot use partition pruning inside RLS.
DROP POLICY IF EXISTS session_snapshots_select ON public.session_snapshots;

CREATE POLICY session_snapshots_select ON public.session_snapshots
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      session_id = (
        SELECT session_id FROM public.active_sessions
        WHERE  user_id = (select auth.uid())
        LIMIT  1
      )
      OR public.is_admin_with_session_validation()
    )
  );

ALTER TABLE audit.alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alert_log_select ON audit.alert_log;

CREATE POLICY alert_log_select ON audit.alert_log FOR SELECT
USING (public.is_admin_with_session_validation());

-- CRIT-04: Enable RLS on rate_limits
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limits_select_policy ON public.rate_limits;

CREATE POLICY rate_limits_select_policy ON public.rate_limits
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR public.is_admin_with_session_validation()
  );

DROP POLICY IF EXISTS rate_limits_delete_policy ON public.rate_limits;

CREATE POLICY rate_limits_delete_policy ON public.rate_limits
  FOR DELETE
  USING (false);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_permission_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settings_kv ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settings_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cache_invalidation_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feature_flag_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feature_flag_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.course_prerequisites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.course_learning_objectives ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lesson_contents ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.user_access_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos FORCE ROW LEVEL SECURITY;

ALTER TABLE public.warnings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_deliveries_deny_client ON public.push_deliveries;
CREATE POLICY push_deliveries_deny_client ON public.push_deliveries
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.user_location_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_last_location ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_log_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_chain_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_targets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.access_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_access_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limit_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.lesson_access_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE internal.job_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regions_select ON public.regions;

CREATE POLICY regions_select ON public.regions
  FOR SELECT TO authenticated
  USING (
    is_active
    AND deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.deleted_at IS NULL
          AND u.region_id = public.regions.id
      )
      OR public.is_admin_with_session_validation()
    )
  );

DROP POLICY IF EXISTS schema_migrations_admin ON public.schema_migrations;

CREATE POLICY schema_migrations_admin ON public.schema_migrations
  FOR ALL TO authenticated
  USING (public.is_admin_with_session_validation())
  WITH CHECK (public.is_admin_with_session_validation());

DROP POLICY IF EXISTS roles_select ON public.roles;

CREATE POLICY roles_select ON public.roles
  FOR SELECT TO authenticated
  USING (tenant_id = public.system_tenant_id() OR tenant_id = public.get_current_tenant_id() OR public.is_current_user_super_admin_lite());

DROP POLICY IF EXISTS permissions_select ON public.permissions;

CREATE POLICY permissions_select ON public.permissions
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_admin_lite()
    OR EXISTS (
      SELECT 1
      FROM public.user_permission_cache upc
      WHERE upc.user_id = (select auth.uid())
        AND upc.permission_name = permissions.name
        AND upc.tenant_id = public.get_current_tenant_id()
        AND (upc.expires_at IS NULL OR upc.expires_at > pg_catalog.now())
    )
  );

DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;

CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (r.tenant_id = public.system_tenant_id() OR r.tenant_id = public.get_current_tenant_id() OR public.is_current_user_super_admin_lite())
    )
  );

DROP POLICY IF EXISTS settings_select ON public.settings_kv;

DROP POLICY IF EXISTS settings_cache_select ON public.settings_cache;

CREATE POLICY settings_cache_select ON public.settings_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.settings_kv sk
      WHERE sk.key = settings_cache.key
        AND (sk.is_public OR public.is_admin_with_session_validation())
    )
  );

DROP POLICY IF EXISTS feature_flags_select ON public.feature_flags;

CREATE POLICY feature_flags_select ON public.feature_flags
  FOR SELECT TO authenticated
  USING (
    is_enabled
    OR public.user_has_permission((select auth.uid()), 'feature_flags.manage'::text, public.get_current_tenant_id())
  );

DROP POLICY IF EXISTS tenant_feature_flags_select ON public.tenant_feature_flags;

CREATE POLICY tenant_feature_flags_select ON public.tenant_feature_flags
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS feature_flag_roles_select ON public.feature_flag_roles;

CREATE POLICY feature_flag_roles_select ON public.feature_flag_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.roles r
      WHERE r.id = role_id
        AND (r.tenant_id = public.system_tenant_id() OR r.tenant_id = public.get_current_tenant_id())
    )
    OR public.is_admin_with_session_validation()
  );

DROP POLICY IF EXISTS feature_flag_users_select ON public.feature_flag_users;

CREATE POLICY feature_flag_users_select ON public.feature_flag_users
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_admin_with_session_validation());

DROP POLICY IF EXISTS courses_admin_delete ON public.courses;

CREATE POLICY courses_admin_delete ON public.courses
  FOR DELETE TO authenticated
  USING (
    public.is_admin_with_session_validation()
    AND tenant_id = public.get_current_tenant_id()
  );

-- course_prerequisites: full CRUD for teachers and admins (patch 26 hardening)

DROP POLICY IF EXISTS course_prerequisites_all ON public.course_prerequisites;

CREATE POLICY course_prerequisites_all ON public.course_prerequisites
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_prerequisites.course_id
        AND c.tenant_id = public.get_current_tenant_id()
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_prerequisites.course_id
        AND c.tenant_id = public.assert_tenant()
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  );

-- course_learning_objectives: full CRUD for teachers and admins (patch 26 hardening)

DROP POLICY IF EXISTS course_learning_objectives_all ON public.course_learning_objectives;

CREATE POLICY course_learning_objectives_all ON public.course_learning_objectives
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_learning_objectives.course_id
        AND c.tenant_id = public.get_current_tenant_id()
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_learning_objectives.course_id
        AND c.tenant_id = public.assert_tenant()
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  );

DROP POLICY IF EXISTS sections_select ON public.sections;

CREATE POLICY sections_select ON public.sections
  FOR SELECT TO authenticated
  USING (
    (tenant_id = public.get_current_tenant_id())
    AND deleted_at IS NULL
    AND (
      is_published 
      OR public.is_admin_with_session_validation()
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id
          AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
      )
    )
  );

DROP POLICY IF EXISTS sections_admin_delete ON public.sections;

CREATE POLICY sections_admin_delete ON public.sections
  FOR DELETE TO authenticated
  USING (
    public.is_admin_with_session_validation()
    AND tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id
        AND c.tenant_id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS lessons_select ON public.lessons;

CREATE POLICY lessons_select ON public.lessons
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      -- Admins and course teachers can see all lessons (including soft-deleted and drafts)
      public.is_admin_with_session_validation()
      OR public.is_teacher_of_course((select auth.uid()), course_id)
      -- Others (students/anonymous) can only see active (non-deleted) published/preview lessons
      OR (
        deleted_at IS NULL
        AND (is_published OR is_preview)
      )
    )
  );

DROP POLICY IF EXISTS lessons_insert ON public.lessons;

DROP POLICY IF EXISTS lessons_update ON public.lessons;

DROP POLICY IF EXISTS lessons_delete ON public.lessons;

CREATE POLICY lessons_insert ON public.lessons
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND (
      public.is_admin_with_session_validation()
      OR public.is_teacher_of_course((select auth.uid()), course_id)
    )
  );

CREATE POLICY lessons_update ON public.lessons
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      public.is_admin_with_session_validation()
      OR public.is_teacher_of_course((select auth.uid()), course_id)
    )
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND (
      public.is_admin_with_session_validation()
      OR public.is_teacher_of_course((select auth.uid()), course_id)
    )
  );

CREATE POLICY lessons_delete ON public.lessons
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (
      public.is_admin_with_session_validation()
      OR public.is_teacher_of_course((select auth.uid()), course_id)
    )
  );

DROP POLICY IF EXISTS lesson_contents_select ON public.lesson_contents;

CREATE POLICY lesson_contents_select ON public.lesson_contents
  FOR SELECT TO authenticated
  USING (
    public.is_user_valid_cached((select auth.uid()), public.get_current_tenant_id())
    AND tenant_id = public.get_current_tenant_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.lessons l
        WHERE l.id = lesson_id
          AND l.tenant_id = lesson_contents.tenant_id
          AND l.deleted_at IS NULL
          AND l.is_preview
      )
      OR public.has_course_access(lesson_contents.course_id)
      OR EXISTS (
        SELECT 1
        FROM public.courses c
        WHERE c.id = lesson_contents.course_id
          AND c.tenant_id = lesson_contents.tenant_id
          AND c.deleted_at IS NULL
          AND c.teacher_id = (select auth.uid())
      )
      OR public.is_admin_with_session_validation()
    )
  );

-- RLS Consolidated from Phase 4

DROP POLICY IF EXISTS enrollments_teacher_select ON public.enrollments;
CREATE POLICY enrollments_teacher_select ON public.enrollments
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_teacher()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.teacher_id = public.get_auth_user_id()
    )
  );

DROP POLICY IF EXISTS user_access_cache_deny_all ON private.user_access_cache;
CREATE POLICY user_access_cache_deny_all ON private.user_access_cache
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- devices & push_tokens: mutation via RPC only

DROP POLICY IF EXISTS video_views_access ON public.video_views;

CREATE POLICY video_views_access ON public.video_views
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.is_admin_with_session_validation())
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND user_id = (select auth.uid())
  );

-- Canonical source of truth: remove any legacy/duplicate policies left by older deployments.
-- Preserves: auth_session_required_* (auto-generated restrictive baseline) and todos_access (canonical).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'todos'
      AND policyname NOT LIKE 'auth_session_required_%'
      AND policyname <> 'todos_access'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.todos', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS todos_access ON public.todos;

CREATE POLICY todos_access ON public.todos
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.is_admin_with_session_validation())
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS warnings_select ON public.warnings;

CREATE POLICY warnings_select ON public.warnings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.is_admin_with_session_validation())
  );

DROP POLICY IF EXISTS warnings_admin_insert ON public.warnings;

CREATE POLICY warnings_admin_insert ON public.warnings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND public.is_admin_with_session_validation()
  );

-- devices & push_tokens: mutation via RPC only
DROP POLICY IF EXISTS push_tokens_select ON public.push_tokens;
CREATE POLICY push_tokens_select ON public.push_tokens
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.is_admin_with_session_validation())
  );

DROP POLICY IF EXISTS location_logs_insert ON public.user_location_logs;

CREATE POLICY location_logs_insert ON public.user_location_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS location_logs_select ON public.user_location_logs;

DROP POLICY IF EXISTS last_location_access ON public.user_last_location;

CREATE POLICY last_location_access ON public.user_last_location
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.is_admin_with_session_validation())
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS activity_log_queue_deny_all ON public.activity_log_queue;

DROP POLICY IF EXISTS activity_logs_select ON public.activity_logs;

CREATE POLICY activity_logs_select ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.user_has_permission((select auth.uid()), 'audit.read'::text, public.get_current_tenant_id()))
  );

DROP POLICY IF EXISTS activity_logs_no_update ON public.activity_logs;

CREATE POLICY activity_logs_no_update ON public.activity_logs
  FOR UPDATE USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS activity_logs_no_delete ON public.activity_logs;

CREATE POLICY activity_logs_no_delete ON public.activity_logs
  FOR DELETE USING (false);

DROP POLICY IF EXISTS audit_chain_admin ON public.audit_chain_state;

CREATE POLICY audit_chain_admin ON public.audit_chain_state
  FOR SELECT TO authenticated
  USING (public.user_has_permission((select auth.uid()), 'audit.read'::text, public.get_current_tenant_id()));

ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_all ON public.audit_logs;

CREATE POLICY audit_logs_admin_all ON public.audit_logs
  FOR ALL TO authenticated
  USING (public.is_admin_with_session_validation())
  WITH CHECK (public.is_admin_with_session_validation());

DROP POLICY IF EXISTS notifications_select ON public.notifications;

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND deleted_at IS NULL
    AND (
      target_audience = 'all'
      OR public.is_admin_with_session_validation()
      OR EXISTS (
        SELECT 1 FROM public.notification_targets nt
        WHERE nt.notification_id = notifications.id
          AND nt.user_id = (select auth.uid())
      )
      -- Root-cause fix: category-audience notifications ('students'/'teachers'/
      -- 'admins') are fanned out by internal.process_notification_fanout_jobs()
      -- directly into user_notifications, NOT notification_targets. Without this
      -- branch, a recipient's own delivered notification row is invisible to the
      -- notifications SELECT policy, so the client's per-ID detail lookup
      -- (see notifications_remote_ds.dart) silently returns zero rows for it and
      -- the notification renders as "No Title / No Content" even though it was
      -- correctly delivered to the user.
      OR EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.notification_id = notifications.id
          AND un.user_id = (select auth.uid())
          AND un.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS notification_targets_select ON public.notification_targets;

CREATE POLICY notification_targets_select ON public.notification_targets
  FOR SELECT TO authenticated
  USING (
    public.is_user_valid_cached((select auth.uid()), public.get_current_tenant_id())
    AND (
      user_id = (select auth.uid())
      OR (
        public.is_admin_with_session_validation()
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = notification_targets.user_id
            AND u.tenant_id = public.get_current_tenant_id()
        )
      )
    )
  );

-- user_notifications: only SELECT and UPDATE for authenticated, INSERT via RPC only
DROP POLICY IF EXISTS user_notifications_select ON public.user_notifications;
CREATE POLICY user_notifications_select ON public.user_notifications
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id() AND user_id = (select auth.uid()));

DROP POLICY IF EXISTS user_notifications_update ON public.user_notifications;
CREATE POLICY user_notifications_update ON public.user_notifications
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_current_tenant_id() AND user_id = (select auth.uid()))
  WITH CHECK (tenant_id = public.assert_tenant() AND user_id = (select auth.uid()));

DROP POLICY IF EXISTS access_rules_admin ON public.access_rules;

CREATE POLICY access_rules_admin ON public.access_rules
  FOR ALL TO authenticated
  USING (
    public.is_admin_with_session_validation()
    AND (tenant_id = public.get_current_tenant_id())
  )
  WITH CHECK (
    public.is_admin_with_session_validation()
    AND (tenant_id = public.get_current_tenant_id())
  );

DROP POLICY IF EXISTS user_access_rules_admin ON public.user_access_rules;

CREATE POLICY user_access_rules_admin ON public.user_access_rules
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin_with_session_validation()
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND public.is_admin_with_session_validation()
  );

DROP POLICY IF EXISTS rate_limits_admin_insert ON public.rate_limits;

DROP POLICY IF EXISTS rate_limits_admin_update ON public.rate_limits;

CREATE POLICY rate_limits_admin_insert ON public.rate_limits
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND public.is_admin_with_session_validation()
  );

CREATE POLICY rate_limits_admin_update ON public.rate_limits
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin_with_session_validation()
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND public.is_admin_with_session_validation()
  );

DROP POLICY IF EXISTS lesson_access_log_select ON audit.lesson_access_log;

CREATE POLICY lesson_access_log_select ON audit.lesson_access_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND (user_id = (select auth.uid()) OR public.user_has_permission((select auth.uid()), 'audit.read'::text, public.get_current_tenant_id()))
  );

DROP POLICY IF EXISTS lesson_access_log_insert_deny ON audit.lesson_access_log;

CREATE POLICY lesson_access_log_insert_deny ON audit.lesson_access_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- HIGH-06: Add RLS policies for devices and sessions

DROP POLICY IF EXISTS sessions_select_policy ON public.sessions;

CREATE POLICY sessions_select_policy ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.validate_user_session()
    AND (user_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    AND deleted_at IS NULL
  );

-- FIX: this table had FORCE ROW LEVEL SECURITY and only a SELECT policy for
-- authenticated -- there was no way for a logged-in client to ever insert
-- its own session row (AuthRemoteDataSource.recordSession() does a direct
-- `sessions.insert(...)`, which was silently failing every RLS check and
-- being swallowed by its own try/catch). This is why public.sessions was
-- always empty even though the client-side write path, the
-- active_sessions pointer table, session_locks, and
-- trg_enforce_single_active_session were all already wired up for it.
-- Scoped the same way as every other self-service insert in this file:
-- caller may only insert a row for themselves, in their own tenant, while
-- holding a valid session.
DROP POLICY IF EXISTS sessions_insert_own ON public.sessions;

CREATE POLICY sessions_insert_own ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.validate_user_session()
    AND user_id = (select auth.uid())
    AND tenant_id = public.get_current_tenant_id()
    AND (
      device_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.id = sessions.device_id
          AND d.user_id = (select auth.uid())
          AND d.tenant_id = public.get_current_tenant_id()
      )
    )
  );

-- Deny direct access to public child partitions.
DO $$
DECLARE
  v_table regclass;
BEGIN
  FOR v_table IN
    SELECT inhrelid::regclass
    FROM pg_inherits
    WHERE inhparent IN (
      'public.sessions'::regclass,
      'public.video_views'::regclass,
      'public.user_location_logs'::regclass,
      'public.activity_logs'::regclass,
      'public.session_snapshots'::regclass,
      'audit.lesson_access_log'::regclass,
      'audit.alert_log'::regclass
    )
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS partition_deny_direct ON %s', v_table);
    EXECUTE format('CREATE POLICY partition_deny_direct ON %s FOR ALL TO authenticated USING (false) WITH CHECK (false)', v_table);
  END LOOP;
END $$;

-- Force RLS on critical tables to prevent service_role bypass without tenant_id.
-- public.enrollments is intentionally NOT in this list -- see the
-- AUTH-BUG-01-style comment beside its ENABLE ROW LEVEL SECURITY statement
-- above for why forcing it reopens a real courses<->enrollments recursion.
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_notifications FORCE ROW LEVEL SECURITY;

-- Telemetry, logs, and partition-heavy tables keep RLS enabled but are not
-- forced, so service-role workers and maintenance jobs do not silently break.
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.devices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.video_views FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_location_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Phase 5: Enterprise Hardening (Validation, API, Audit)
-- ============================================================================

-- CRIT-05: Deny all PostgREST access to internal tables.
--
-- NOTE: deliberately NOT `FORCE ROW LEVEL SECURITY` here (unlike the other
-- tables in this file) -- same root cause and same fix shape as the
-- user_progress comment above, discovered while tracing why activity
-- logging silently never persists. internal.log_activity_internal() is
-- SECURITY DEFINER and does the actual `INSERT INTO
-- public.activity_log_queue`; every one of its call sites (including
-- update_lesson_progress() above) wraps that call in
-- `EXCEPTION WHEN OTHERS THEN NULL`, specifically so a logging failure can
-- never fail the business write it describes -- which means this was
-- failing 100% of the time with FORCE in effect, invisibly. The policy
-- below is `TO public USING (false)`, i.e. everyone is denied by policy;
-- with FORCE also stripping the table-owner bypass, literally nothing
-- (not even the owner-run logging function) could insert a row --
-- verified with the same live-Postgres repro as user_progress. Removing
-- FORCE restores the owner-bypass log_activity_internal()'s write needs.
-- The `TO public USING (false)` policy remains fully enforced for every
-- non-owner role (anon/authenticated/service_role), so direct PostgREST
-- access to this internal queue is still completely denied -- this only
-- ever affects the table owner, matching the CRIT-05 intent ("deny all
-- *PostgREST* access") rather than accidentally also blocking the
-- server-side logging function that owns the table.
ALTER TABLE public.activity_log_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_log_queue_deny_all ON public.activity_log_queue
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS job_queue_deny_all ON internal.job_queue;

CREATE POLICY job_queue_deny_all ON internal.job_queue
  FOR ALL TO public USING (false) WITH CHECK (false);

-- RLS Coverage for audit and internal tables (CRIT-05)
ALTER TABLE audit.slow_query_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.lesson_state_transitions ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.pii_access_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.deletion_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE internal.enrollment_progress_temp ENABLE ROW LEVEL SECURITY;

ALTER TABLE internal.workers ENABLE ROW LEVEL SECURITY;

ALTER TABLE internal.job_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions_future ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.video_views_future ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_location_logs_future ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_logs_future ENABLE ROW LEVEL SECURITY;

-- Advisor remediation: RLS policies for tables with RLS enabled but no policy
DROP POLICY IF EXISTS active_sessions_select_own ON public.active_sessions;
CREATE POLICY active_sessions_select_own ON public.active_sessions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS active_sessions_deny_insert ON public.active_sessions;
DROP POLICY IF EXISTS active_sessions_deny_update ON public.active_sessions;
DROP POLICY IF EXISTS active_sessions_deny_delete ON public.active_sessions;

CREATE POLICY active_sessions_deny_insert ON public.active_sessions
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY active_sessions_deny_update ON public.active_sessions
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY active_sessions_deny_delete ON public.active_sessions
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS session_locks_deny_all ON public.session_locks;
CREATE POLICY session_locks_deny_all ON public.session_locks
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS user_permission_cache_select_own ON public.user_permission_cache;
CREATE POLICY user_permission_cache_select_own ON public.user_permission_cache
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    AND tenant_id = public.get_current_tenant_id()
  );

DROP POLICY IF EXISTS user_permission_cache_deny_insert ON public.user_permission_cache;
DROP POLICY IF EXISTS user_permission_cache_deny_update ON public.user_permission_cache;
DROP POLICY IF EXISTS user_permission_cache_deny_delete ON public.user_permission_cache;

CREATE POLICY user_permission_cache_deny_insert ON public.user_permission_cache
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY user_permission_cache_deny_update ON public.user_permission_cache
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY user_permission_cache_deny_delete ON public.user_permission_cache
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS slow_query_log_deny_all ON audit.slow_query_log;
CREATE POLICY slow_query_log_deny_all ON audit.slow_query_log
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS lesson_state_transitions_deny_all ON audit.lesson_state_transitions;
CREATE POLICY lesson_state_transitions_deny_all ON audit.lesson_state_transitions
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pii_access_log_deny_all ON audit.pii_access_log;
CREATE POLICY pii_access_log_deny_all ON audit.pii_access_log
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deletion_audit_deny_all ON audit.deletion_audit;
CREATE POLICY deletion_audit_deny_all ON audit.deletion_audit
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS enrollment_progress_temp_deny_all ON internal.enrollment_progress_temp;
CREATE POLICY enrollment_progress_temp_deny_all ON internal.enrollment_progress_temp
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS job_progress_deny_all ON internal.job_progress;
CREATE POLICY job_progress_deny_all ON internal.job_progress
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS workers_deny_all ON internal.workers;
CREATE POLICY workers_deny_all ON internal.workers
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Consolidate overlapping permissive SELECT policies (semantics preserved via OR)
DROP POLICY IF EXISTS courses_select_merged ON public.courses;
CREATE POLICY courses_select_merged ON public.courses
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND tenant_id = public.get_current_tenant_id()
    AND (
      public.is_admin_with_session_validation()
      OR status = 'published'
      OR teacher_id = public.get_auth_user_id()
      OR public.has_course_access(id)
      OR public.user_has_permission(
        public.get_auth_user_id(),
        'courses.read'::text,
        tenant_id
      )
    )
  );

DROP POLICY IF EXISTS courses_select_policy ON public.courses;
-- FIX (real cross-tenant leak found during this cleanup pass): this policy
-- originally also listed `authenticated` alongside `anon`. Since Postgres
-- ORs together every permissive SELECT policy that applies to a role, any
-- authenticated user -- from ANY tenant -- could see any OTHER tenant's
-- published courses through this policy alone, even though
-- courses_select_merged (above) already grants authenticated users full,
-- correctly tenant-scoped access to published courses via its own
-- `status = 'published'` OR-branch. `anon` is kept here on purpose (public,
-- unauthenticated course-catalog browsing has no tenant context to scope
-- by); `authenticator`/`dashboard_user`/`supabase_privileged_role` are
-- Postgres/Supabase internal roles, not end-user roles, and are unaffected
-- by removing `authenticated`.
CREATE POLICY courses_select_policy ON public.courses
  FOR SELECT TO anon, authenticator, dashboard_user, supabase_privileged_role
  USING (
    status = 'published'
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS user_roles_select_merged ON public.user_roles;
CREATE POLICY user_roles_select_merged ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.validate_user_session()
    AND (
      user_id = public.get_auth_user_id()
      OR public.is_current_user_super_admin()
      OR (
        tenant_id = public.get_current_tenant_id()
        AND public.is_admin_with_session_validation()
      )
    )
  );

DROP POLICY IF EXISTS users_select_merged ON public.users;
CREATE POLICY users_select_merged ON public.users
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_current_user_super_admin()
      OR (
        public.is_admin_with_session_validation()
        AND users.tenant_id = public.get_current_tenant_id()
      )
      OR (id = public.get_auth_user_id())
      OR (
        users.tenant_id = public.get_current_tenant_id()
        AND EXISTS (
          SELECT 1 FROM public.courses c
          JOIN public.enrollments e ON e.course_id = c.id
          WHERE c.teacher_id = public.get_auth_user_id()
            AND e.user_id = users.id
            AND c.tenant_id = public.get_current_tenant_id()
            AND e.status = 'active'
        )
      )
    )
  );

DROP POLICY IF EXISTS tenants_select_merged ON public.tenants;
CREATE POLICY tenants_select_merged ON public.tenants
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_admin_with_session_validation()
      OR public.is_current_user_super_admin_lite()
      OR id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS courses_insert_merged ON public.courses;
CREATE POLICY courses_insert_merged ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        public.is_admin_with_session_validation()
        AND tenant_id = public.assert_tenant()
      )
      OR (
        public.is_user_valid_cached(public.get_auth_user_id(), public.get_current_tenant_id())
        AND tenant_id = public.assert_tenant()
        AND teacher_id = public.get_auth_user_id()
      )
    )
  );

DROP POLICY IF EXISTS courses_update_merged ON public.courses;
CREATE POLICY courses_update_merged ON public.courses
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        public.is_admin_with_session_validation()
        AND tenant_id = public.get_current_tenant_id()
      )
      OR (
        public.is_user_valid_cached(public.get_auth_user_id(), public.get_current_tenant_id())
        AND tenant_id = public.get_current_tenant_id()
        AND teacher_id = public.get_auth_user_id()
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        public.is_admin_with_session_validation()
        AND tenant_id = public.assert_tenant()
      )
      OR (
        public.is_user_valid_cached(public.get_auth_user_id(), public.get_current_tenant_id())
        AND tenant_id = public.assert_tenant()
        AND teacher_id = public.get_auth_user_id()
      )
    )
  );

DROP POLICY IF EXISTS sections_insert_merged ON public.sections;
CREATE POLICY sections_insert_merged ON public.sections
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id
          AND c.tenant_id = public.assert_tenant()
      )
    )
    OR (
      tenant_id = public.assert_tenant()
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id
          AND c.tenant_id = public.assert_tenant()
          AND c.teacher_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS sections_update_merged ON public.sections;
CREATE POLICY sections_update_merged ON public.sections
  FOR UPDATE TO authenticated
  USING (
    (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
    OR (
      public.is_user_valid_cached((select auth.uid()), public.get_current_tenant_id())
      AND tenant_id = public.get_current_tenant_id()
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id
          AND c.tenant_id = public.get_current_tenant_id()
          AND c.teacher_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id
          AND c.tenant_id = public.assert_tenant()
      )
    )
    OR (
      tenant_id = public.assert_tenant()
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_id
          AND c.tenant_id = public.assert_tenant()
          AND c.teacher_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS enrollments_insert_merged ON public.enrollments;
CREATE POLICY enrollments_insert_merged ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_with_session_validation()
    AND tenant_id = public.assert_tenant()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS enrollments_update_merged ON public.enrollments;
CREATE POLICY enrollments_update_merged ON public.enrollments
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND tenant_id = public.get_current_tenant_id()
    AND (
      public.is_admin_with_session_validation()
      OR user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND tenant_id = public.assert_tenant()
    AND (
      public.is_admin_with_session_validation()
      OR user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS enrollments_delete_merged ON public.enrollments;
CREATE POLICY enrollments_delete_merged ON public.enrollments
  FOR DELETE TO authenticated
  USING (
    (
      public.is_admin_with_session_validation()
      OR (tenant_id = public.get_current_tenant_id() AND public.is_current_user_admin_lite())
    )
    OR (user_id = public.get_auth_user_id() AND tenant_id = public.get_current_tenant_id())
  );

DROP POLICY IF EXISTS user_progress_insert_merged ON public.user_progress;
CREATE POLICY user_progress_insert_merged ON public.user_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND tenant_id = public.assert_tenant()
    AND (
      public.is_admin_with_session_validation()
      OR user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS user_progress_update_merged ON public.user_progress;
CREATE POLICY user_progress_update_merged ON public.user_progress
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND tenant_id = public.get_current_tenant_id()
    AND (
      public.is_admin_with_session_validation()
      OR user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND tenant_id = public.assert_tenant()
    AND (
      public.is_admin_with_session_validation()
      OR user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS user_progress_delete_merged ON public.user_progress;
CREATE POLICY user_progress_delete_merged ON public.user_progress
  FOR DELETE TO authenticated
  USING (
    deleted_at IS NULL
    AND tenant_id = public.get_current_tenant_id()
    AND (
      public.is_admin_with_session_validation()
      OR user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS users_update_merged ON public.users;
CREATE POLICY users_update_merged ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
    OR (
      public.validate_user_session()
      AND id = (select auth.uid())
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
    )
    OR (
      id = (select auth.uid())
      AND tenant_id = public.assert_tenant()
      AND primary_role = public.get_own_primary_role()
    )
  );

-- -- B. Admin-wide RLS fixes (patches 23, 24) --------------------------------Ã¢â€â‚¬

-- Sessions: admin can see all active sessions

-- Devices: admin can see all devices

-- Location logs: super admin cross-tenant, admin tenant-scoped
DROP POLICY IF EXISTS location_logs_select ON public.user_location_logs;

CREATE POLICY location_logs_select ON public.user_location_logs
  FOR SELECT TO authenticated
  USING (
    public.is_current_user_super_admin_lite()
    OR (
      tenant_id = public.get_current_tenant_id()
      AND (user_id = (select auth.uid()) OR public.is_current_user_admin_lite())
    )
  );

-- -- C. Settings RLS fix (patch 9) --------------------------------------------

CREATE POLICY settings_select ON public.settings_kv
  FOR SELECT TO authenticated, anon
  USING (
    is_public
    OR ((select auth.uid()) IS NOT NULL AND public.user_has_permission((select auth.uid()), 'settings.read'::text, public.get_current_tenant_id()))
  );

-- CRIT: RLS for reference / session-validity tables exposed via API grants
ALTER TABLE public.constants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.constants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS constants_authenticated_read ON public.constants;

CREATE POLICY constants_authenticated_read ON public.constants
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS constants_anon_deny ON public.constants;

CREATE POLICY constants_anon_deny ON public.constants
  FOR ALL TO anon
  USING (false);

ALTER TABLE public.user_validity_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_validity_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_validity_cache_own_read ON public.user_validity_cache;

CREATE POLICY user_validity_cache_own_read ON public.user_validity_cache
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    AND tenant_id = public.get_current_tenant_id()
  );

DROP POLICY IF EXISTS user_validity_cache_anon_deny ON public.user_validity_cache;

CREATE POLICY user_validity_cache_anon_deny ON public.user_validity_cache
  FOR ALL TO anon
  USING (false);

-- Advisor pass 2: split remaining FOR ALL admin policies (Postgres allows one cmd per policy).
DROP POLICY IF EXISTS enrollments_select_policy ON public.enrollments;
CREATE POLICY enrollments_select_policy ON public.enrollments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND tenant_id = public.get_current_tenant_id()
    AND (
      user_id = (select auth.uid())
      OR public.is_admin_with_session_validation()
      OR EXISTS (
        SELECT 1
        FROM public.courses c
        WHERE c.id = enrollments.course_id
          AND c.tenant_id = enrollments.tenant_id
          AND c.teacher_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS feature_flags_admin_insert ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_admin_update ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_admin_delete ON public.feature_flags;

DROP POLICY IF EXISTS lesson_contents_admin_teacher_insert ON public.lesson_contents;
DROP POLICY IF EXISTS lesson_contents_admin_teacher_update ON public.lesson_contents;
DROP POLICY IF EXISTS lesson_contents_admin_teacher_delete ON public.lesson_contents;
CREATE POLICY lesson_contents_admin_teacher_insert ON public.lesson_contents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_user_valid_cached((select auth.uid()), public.get_current_tenant_id())
    AND tenant_id = public.assert_tenant()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = lesson_contents.course_id
        AND c.tenant_id = public.assert_tenant()
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  );
CREATE POLICY lesson_contents_admin_teacher_update ON public.lesson_contents FOR UPDATE TO authenticated
  USING (
    public.is_user_valid_cached((select auth.uid()), public.get_current_tenant_id())
    AND tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = lesson_contents.course_id
        AND c.tenant_id = lesson_contents.tenant_id
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = lesson_contents.course_id
        AND c.tenant_id = public.assert_tenant()
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  );
CREATE POLICY lesson_contents_admin_teacher_delete ON public.lesson_contents FOR DELETE TO authenticated
  USING (
    public.is_user_valid_cached((select auth.uid()), public.get_current_tenant_id())
    AND tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = lesson_contents.course_id
        AND c.tenant_id = lesson_contents.tenant_id
        AND (c.teacher_id = (select auth.uid()) OR public.is_admin_with_session_validation())
    )
  );

DROP POLICY IF EXISTS notifications_admin_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_admin_update ON public.notifications;
DROP POLICY IF EXISTS notifications_admin_delete ON public.notifications;
CREATE POLICY notifications_admin_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND public.user_has_permission((select auth.uid()), 'notifications.send'::text, tenant_id)
  );
CREATE POLICY notifications_admin_update ON public.notifications FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.user_has_permission((select auth.uid()), 'notifications.send'::text, tenant_id)
  )
  WITH CHECK (
    tenant_id = public.assert_tenant()
    AND public.user_has_permission((select auth.uid()), 'notifications.send'::text, tenant_id)
  );
CREATE POLICY notifications_admin_delete ON public.notifications FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.user_has_permission((select auth.uid()), 'notifications.send'::text, tenant_id)
  );

DROP POLICY IF EXISTS permissions_super_admin_insert ON public.permissions;
DROP POLICY IF EXISTS permissions_super_admin_update ON public.permissions;
DROP POLICY IF EXISTS permissions_super_admin_delete ON public.permissions;

DROP POLICY IF EXISTS role_permissions_admin_insert ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_admin_update ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_admin_delete ON public.role_permissions;
CREATE POLICY role_permissions_admin_insert ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND EXISTS (
        SELECT 1
        FROM public.roles r
        WHERE r.id = role_id
          AND r.tenant_id = public.get_current_tenant_id()
      )
    )
  );
CREATE POLICY role_permissions_admin_update ON public.role_permissions FOR UPDATE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND EXISTS (
        SELECT 1
        FROM public.roles r
        WHERE r.id = role_id
          AND r.tenant_id = public.get_current_tenant_id()
      )
    )
  )
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND EXISTS (
        SELECT 1
        FROM public.roles r
        WHERE r.id = role_id
          AND r.tenant_id = public.get_current_tenant_id()
      )
    )
  );
CREATE POLICY role_permissions_admin_delete ON public.role_permissions FOR DELETE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND EXISTS (
        SELECT 1
        FROM public.roles r
        WHERE r.id = role_id
          AND r.tenant_id = public.get_current_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS roles_admin_insert ON public.roles;
DROP POLICY IF EXISTS roles_admin_update ON public.roles;
DROP POLICY IF EXISTS roles_admin_delete ON public.roles;
CREATE POLICY roles_admin_insert ON public.roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
    )
  );
CREATE POLICY roles_admin_update ON public.roles FOR UPDATE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  )
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
    )
  );
CREATE POLICY roles_admin_delete ON public.roles FOR DELETE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS settings_admin_insert ON public.settings_kv;
DROP POLICY IF EXISTS settings_admin_update ON public.settings_kv;
DROP POLICY IF EXISTS settings_admin_delete ON public.settings_kv;
CREATE POLICY settings_admin_insert ON public.settings_kv FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY settings_admin_update ON public.settings_kv FOR UPDATE TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY settings_admin_delete ON public.settings_kv FOR DELETE TO authenticated
  USING (public.is_current_user_super_admin());

DROP POLICY IF EXISTS tenant_feature_flags_insert ON public.tenant_feature_flags;
DROP POLICY IF EXISTS tenant_feature_flags_update ON public.tenant_feature_flags;
DROP POLICY IF EXISTS tenant_feature_flags_delete ON public.tenant_feature_flags;
CREATE POLICY tenant_feature_flags_insert ON public.tenant_feature_flags FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.user_has_permission((select auth.uid()), 'feature_flags.manage'::text, public.get_current_tenant_id())
  );
CREATE POLICY tenant_feature_flags_update ON public.tenant_feature_flags FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.user_has_permission((select auth.uid()), 'feature_flags.manage'::text, public.get_current_tenant_id())
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.user_has_permission((select auth.uid()), 'feature_flags.manage'::text, public.get_current_tenant_id())
  );
CREATE POLICY tenant_feature_flags_delete ON public.tenant_feature_flags FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.user_has_permission((select auth.uid()), 'feature_flags.manage'::text, public.get_current_tenant_id())
  );

DROP POLICY IF EXISTS tenant_settings_admin_insert ON public.tenant_settings;
DROP POLICY IF EXISTS tenant_settings_admin_update ON public.tenant_settings;
DROP POLICY IF EXISTS tenant_settings_admin_delete ON public.tenant_settings;
CREATE POLICY tenant_settings_admin_insert ON public.tenant_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
    )
  );
CREATE POLICY tenant_settings_admin_update ON public.tenant_settings FOR UPDATE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  )
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
    )
  );
CREATE POLICY tenant_settings_admin_delete ON public.tenant_settings FOR DELETE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS tenants_write_insert ON public.tenants;
DROP POLICY IF EXISTS tenants_write_update ON public.tenants;
DROP POLICY IF EXISTS tenants_write_delete ON public.tenants;
CREATE POLICY tenants_write_insert ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY tenants_write_update ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY tenants_write_delete ON public.tenants FOR DELETE TO authenticated
  USING (public.is_current_user_super_admin());

DROP POLICY IF EXISTS user_roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_delete ON public.user_roles;
CREATE POLICY user_roles_admin_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
      AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = user_id
          AND u.tenant_id = public.get_current_tenant_id()
          AND u.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.roles r
        WHERE r.id = role_id
          AND r.tenant_id = public.get_current_tenant_id()
      )
    )
  );
CREATE POLICY user_roles_admin_update ON public.user_roles FOR UPDATE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  )
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
      AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = user_id
          AND u.tenant_id = public.get_current_tenant_id()
          AND u.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.roles r
        WHERE r.id = role_id
          AND r.tenant_id = public.get_current_tenant_id()
      )
    )
  );
CREATE POLICY user_roles_admin_delete ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  );

DROP POLICY IF EXISTS users_admin_insert ON public.users;
DROP POLICY IF EXISTS users_admin_delete ON public.users;
CREATE POLICY users_admin_insert ON public.users FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.assert_tenant()
    )
  );
CREATE POLICY users_admin_delete ON public.users FOR DELETE TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      public.is_admin_with_session_validation()
      AND tenant_id = public.get_current_tenant_id()
    )
  );

-- AUTHZ-TENANT-01: privileged mutation must respect the row's tenant unless
-- the caller is an actual super_admin. Admin status alone is never a
-- cross-tenant authorization boundary.
DROP POLICY IF EXISTS permissions_super_admin_insert ON public.permissions;
DROP POLICY IF EXISTS permissions_super_admin_update ON public.permissions;
DROP POLICY IF EXISTS permissions_super_admin_delete ON public.permissions;
CREATE POLICY permissions_super_admin_insert ON public.permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY permissions_super_admin_update ON public.permissions FOR UPDATE TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY permissions_super_admin_delete ON public.permissions FOR DELETE TO authenticated
  USING (public.is_current_user_super_admin());

DROP POLICY IF EXISTS feature_flags_admin_insert ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_admin_update ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_admin_delete ON public.feature_flags;
CREATE POLICY feature_flags_admin_insert ON public.feature_flags FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY feature_flags_admin_update ON public.feature_flags FOR UPDATE TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());
CREATE POLICY feature_flags_admin_delete ON public.feature_flags FOR DELETE TO authenticated
  USING (public.is_current_user_super_admin());

DROP POLICY IF EXISTS security_settings_admin_all ON public.security_settings;
CREATE POLICY security_settings_admin_all ON public.security_settings
  FOR ALL TO authenticated
  USING (
    public.is_current_user_super_admin()
    OR (
      tenant_id = public.get_current_tenant_id()
      AND public.user_has_permission(
        (select auth.uid()),
        'settings.write'::text,
        public.get_current_tenant_id()
      )
    )
  )
  WITH CHECK (
    public.is_current_user_super_admin()
    OR (
      tenant_id = public.assert_tenant()
      AND public.user_has_permission(
        (select auth.uid()),
        'settings.write'::text,
        public.get_current_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS rate_limit_rules_admin ON public.rate_limit_rules;
CREATE POLICY rate_limit_rules_admin ON public.rate_limit_rules
  FOR ALL TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());

DROP POLICY IF EXISTS admin_only_all ON public.cache_invalidation_queue;
CREATE POLICY admin_only_all ON public.cache_invalidation_queue
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- -- D. FORCE ROW LEVEL SECURITY (patch 14) ------------------------------------
-- AUTH-BUG-01 FIX: 'users' and 'user_roles' were removed from this list.
-- Both are queried internally (as the table owner) by SECURITY DEFINER
-- session/authorization helper functions -- validate_user_session(),
-- is_admin_with_session_validation(), get_auth_user_id(),
-- get_current_tenant_id(), is_user_valid_cached(), etc. -- that are
-- themselves invoked BY policies on these same two tables (and, for
-- user_roles via is_admin_with_session_validation(), by policies on
-- many other tables such as devices_admin_all/sessions_admin_all).
-- FORCE ROW LEVEL SECURITY strips the table-owner bypass those helpers
-- rely on to avoid recursion, so forcing either table causes
-- "infinite recursion detected in policy" (42P17) the moment such a
-- helper is called -- which happens on every login (bind_device /
-- users profile update / access check). See the ALTER TABLE
-- statements for public.users and public.user_roles above for the
-- full explanation. Do not re-add either table to this array without
-- first verifying every SECURITY DEFINER helper that queries it is no
-- longer called from that table's own RLS policies (directly or
-- transitively).
-- SAME FIX, same reason: 'courses' and 'enrollments' were also removed.
-- public.has_course_access(uuid, uuid) is SECURITY DEFINER and queries
-- public.enrollments; enrollments_select_policy queries public.courses;
-- courses_select_merged calls has_course_access(id). Forcing either table
-- strips the owner bypass that chain relies on and reopens 42P17 the first
-- time has_course_access() is actually exercised via that OR branch.
DO $$
DECLARE
  _tables text[] := ARRAY[
    'sections', 'lessons', 'lesson_contents',
    'sessions', 'devices',
    'roles', 'permissions', 'role_permissions',
    'settings_kv',
    'user_progress',
    'notifications', 'user_notifications',
    'constants', 'user_validity_cache'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = _t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', _t);
    END IF;
  END LOOP;

  -- Defensively un-force in case a prior deploy already applied FORCE
  -- to these two tables (ALTER DEFAULT/FORCE settings persist across
  -- deploys; simply omitting them from the array above does not undo
  -- a FORCE that a previous run of this script already set).
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'users' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.users NO FORCE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_roles' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.user_roles NO FORCE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'courses' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.courses NO FORCE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'enrollments' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.enrollments NO FORCE ROW LEVEL SECURITY';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- video_cache & download_logs RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.video_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;

-- SECTION-12 CRITICAL FIX: no policy is defined for `authenticated`/`anon`
-- here on purpose. video_cache is an internal cache of resolved video/audio
-- URLs for every lesson on the platform, populated and read only by the
-- `video-info` Edge Function via the service_role key (which bypasses RLS
-- entirely, so service_role needs no policy to keep working). The previous
-- `video_cache_select` policy (`USING (expires_at > now())`, granted to
-- `authenticated`) had no lesson/course/enrollment scoping whatsoever, so
-- any signed-in user could read *every* cached lesson's direct video URL
-- via PostgREST -- a full bypass of get_lesson_content()'s entitlement
-- check. RLS with zero matching policies for a role means that role gets
-- zero rows by default; combined with the matching REVOKE in
-- 10_permissions.sql (which rejects the query before RLS even runs), this
-- table is now unreachable by anything except service_role.

DROP POLICY IF EXISTS download_logs_select_own ON public.download_logs;
CREATE POLICY download_logs_select_own ON public.download_logs
  FOR SELECT TO authenticated
  USING (user_id = public.get_auth_user_id() OR public.is_admin_with_session_validation());

DROP POLICY IF EXISTS download_logs_insert_own ON public.download_logs;
CREATE POLICY download_logs_insert_own ON public.download_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_auth_user_id());

-- =============================================================================
-- AUTH SESSION BASELINE (CANONICAL)
-- Existing resource-specific RLS policies remain authoritative for ownership,
-- tenancy, and role rules. This restrictive policy adds one invariant:
-- authenticated requests must hold a currently valid session.
-- =============================================================================
DO $$
DECLARE
  r record;
  v_policy_name text;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity = true
  LOOP
    v_policy_name := 'auth_session_required_' ||
      substr(md5(r.schema_name || '.' || r.table_name), 1, 16);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      v_policy_name,
      r.schema_name,
      r.table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.validate_user_session()) WITH CHECK (public.validate_user_session())',
      v_policy_name,
      r.schema_name,
      r.table_name
    );
  END LOOP;
END
$$;

-- SECTION-09: Direct access to partition children must never bypass the
-- parent table's tenant RLS. PostgreSQL applies parent policies to inherited
-- queries, but direct queries against a child table ignore parent policies.
-- Existing and future child partitions are therefore explicitly RLS-protected.
DO $$
DECLARE
  v_partition record;
BEGIN
  FOR v_partition IN
    SELECT child_ns.nspname AS schema_name,
           child.relname    AS partition_name
    FROM pg_inherits i
    JOIN pg_class parent      ON parent.oid = i.inhparent
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_class child       ON child.oid = i.inhrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    WHERE parent_ns.nspname IN ('public', 'audit')
      AND parent.relname IN (
        'sessions',
        'session_snapshots',
        'video_views',
        'user_location_logs',
        'activity_logs',
        'lesson_access_log',
        'alert_log'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      v_partition.schema_name,
      v_partition.partition_name
    );
    -- No direct authenticated/anonymous policy is created intentionally:
    -- RLS default-deny protects direct child access. Parent policies remain
    -- authoritative for normal queries through the partitioned parent.
    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
      v_partition.schema_name,
      v_partition.partition_name
    );
  END LOOP;
END $$;

-- SECTION-09 CRITICAL FIX: sessions_admin_all / devices_admin_all cross-tenant
-- privilege escalation.
--
-- Root cause: is_admin_with_session_validation() (aliased by
-- is_current_user_admin_lite()) returns true for ANY user whose
-- primary_role IN ('admin','super_admin') with NO tenant_id comparison at
-- all -- it only asks "is this caller an admin of any kind", never "of
-- which tenant". The two FOR ALL policies below used it as an *unscoped*
-- first OR-branch:
--
--   USING ( is_admin_with_session_validation()
--           OR (tenant_id = get_current_tenant_id() AND is_current_user_admin_lite()) )
--
-- Since is_current_user_admin_lite() IS is_admin_with_session_validation(),
-- the first branch already covers everything the second (correctly
-- tenant-scoped) branch would match, and it does so for every tenant, not
-- just the caller's own. Concretely: a plain tenant-scoped 'admin' user in
-- Tenant A could SELECT/INSERT/UPDATE/DELETE session tokens and
-- device-binding rows belonging to every OTHER tenant, purely because
-- their primary_role happened to be 'admin' anywhere in the system.
--
-- Fix: replace the unscoped branch with is_current_user_super_admin_lite(),
-- which is already strictly primary_role = 'super_admin' with no tenant
-- filter -- the only role this system's data model treats as legitimately
-- cross-tenant (see public.is_current_user_super_admin()). Tenant-scoped
-- 'admin' access is preserved unchanged via the second branch, which was
-- already correctly gated by tenant_id = get_current_tenant_id().
DROP POLICY IF EXISTS sessions_admin_all ON public.sessions;

CREATE POLICY sessions_admin_all ON public.sessions
  FOR ALL TO authenticated
  USING (
    public.is_current_user_super_admin_lite()
    OR (tenant_id = public.get_current_tenant_id() AND public.is_current_user_admin_lite())
  )
  WITH CHECK (
    public.is_current_user_super_admin_lite()
    OR (tenant_id = public.get_current_tenant_id() AND public.is_current_user_admin_lite())
  );

DROP POLICY IF EXISTS devices_admin_all ON public.devices;

DROP POLICY IF EXISTS devices_select_own ON public.devices;

CREATE POLICY devices_select_own ON public.devices
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    AND tenant_id = public.get_current_tenant_id()
    AND is_active = true
  );

CREATE POLICY devices_admin_all ON public.devices
  FOR ALL TO authenticated
  USING (
    public.is_current_user_super_admin_lite()
    OR (tenant_id = public.get_current_tenant_id() AND public.is_current_user_admin_lite())
  )
  WITH CHECK (
    public.is_current_user_super_admin_lite()
    OR (tenant_id = public.get_current_tenant_id() AND public.is_current_user_admin_lite())
  );

-- ============================================================================
-- Feature Flags — canonical RLS (remove all historical duplicate policies)
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'feature_flags',
        'tenant_feature_flags',
        'feature_flag_users',
        'feature_flag_roles'
      )
      -- FIX: this used to drop every policy unconditionally, including the
      -- auth_session_required_* restrictive baseline policy that the
      -- "AUTH SESSION BASELINE (CANONICAL)" block (earlier in this file)
      -- had already created for these tables (their RLS is enabled near
      -- the top of this file, before that block runs). Dropping it here
      -- and never recreating it meant these four tables silently lost the
      -- session-validity invariant every other RLS-protected table has.
      AND policyname NOT LIKE 'auth_session_required_%'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_roles ENABLE ROW LEVEL SECURITY;

-- Global definitions: only users with the global Feature Flags permission may
-- inspect or modify definitions. Runtime clients use the evaluator RPC instead.
CREATE POLICY feature_flags_manage
ON public.feature_flags
FOR ALL TO authenticated
USING (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
)
WITH CHECK (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
);

-- Tenant overrides and targeting may be managed by either a global Feature Flag
-- administrator or a tenant-scoped feature flag manager for that tenant.
CREATE POLICY tenant_feature_flags_manage
ON public.tenant_feature_flags
FOR ALL TO authenticated
USING (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
  OR public.user_has_permission(
    (select auth.uid()),
    'feature_flags.tenant_manage'::text,
    tenant_id
  )
)
WITH CHECK (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
  OR public.user_has_permission(
    (select auth.uid()),
    'feature_flags.tenant_manage'::text,
    tenant_id
  )
);

CREATE POLICY feature_flag_users_manage
ON public.feature_flag_users
FOR ALL TO authenticated
USING (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
  OR public.user_has_permission(
    (select auth.uid()),
    'feature_flags.tenant_manage'::text,
    tenant_id
  )
)
WITH CHECK (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
  OR public.user_has_permission(
    (select auth.uid()),
    'feature_flags.tenant_manage'::text,
    tenant_id
  )
);

CREATE POLICY feature_flag_roles_manage
ON public.feature_flag_roles
FOR ALL TO authenticated
USING (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
  OR public.user_has_permission(
    (select auth.uid()),
    'feature_flags.tenant_manage'::text,
    tenant_id
  )
)
WITH CHECK (
  public.user_has_permission(
    (select auth.uid()),
    'feature_flags.manage'::text,
    public.system_tenant_id()
  )
  OR public.user_has_permission(
    (select auth.uid()),
    'feature_flags.tenant_manage'::text,
    tenant_id
  )
);
