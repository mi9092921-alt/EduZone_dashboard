-- ============================================================================
-- Function & Object Permissions (Security Hardened)
-- ============================================================================
-- Canonical schema source: supabase/schema/ (this file and its siblings).
-- Historical note: originally generated from a monolithic Eduzone_schema_v13.sql
-- plus a hardening_patch.sql; neither file exists in this repo anymore.
-- 
-- Hardened per security audit (June 2026):
-- - All SECURITY DEFINER functions audited and reference-checked
-- - Unnecessary anon/authenticated access revoked from 120+ internal/admin functions
-- - Follows principle of least privilege with explicit GRANT model
-- - Maintains backward compatibility with production frontend & edge functions
-- Section 12: entitlement records are readable by authenticated owners only;
-- authorization-changing RPCs are the sole client write path.
REVOKE ALL ON TABLE public.offline_download_entitlements FROM anon, authenticated;
GRANT SELECT ON TABLE public.offline_download_entitlements TO authenticated;
GRANT ALL ON TABLE public.offline_download_entitlements TO service_role;

REVOKE ALL ON FUNCTION public.authorize_offline_download(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_offline_download(uuid, uuid, text, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revalidate_offline_entitlement(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revalidate_offline_entitlement(uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.offline_entitlement_transition_guard()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA audit FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SCHEMA maintenance FROM PUBLIC, anon, authenticated;

-- DBSEC-008 (2026-09-23): archive was created in 01_extensions.sql but never
-- added to the schema lock-down net, so it kept the PostgreSQL default
-- (USAGE to PUBLIC). It holds cold-storage copies of soft-deleted rows and
-- is only written by maintenance.archive_soft_deleted_data() in definer
-- context; no client or service_role path needs it.
REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO service_role;

GRANT USAGE ON SCHEMA audit TO service_role;

GRANT USAGE ON SCHEMA internal TO service_role;

GRANT USAGE ON SCHEMA maintenance TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA maintenance FROM PUBLIC, anon, authenticated;

-- DBSEC-008 (2026-09-23): future objects in maintenance/archive follow the
-- same default-deny model as private/audit/internal; previously functions
-- created later in maintenance would have defaulted to EXECUTE TO PUBLIC
-- again (the archive_old_partitions / create_next_partition_if_not_exists
-- class of functions).
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA archive REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA archive REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- NOTE: grants for public.* relations belong BELOW the blanket
-- "REVOKE ALL ON ALL TABLES IN SCHEMA public" sweep — a grant placed above it
-- is dead on arrival (the sweep runs after it and wipes it). vw_course_stats
-- sat here for releases, so authenticated browsers got permission-denied and
-- the System Analytics course section rendered empty despite data existing.

-- ============================================================================
-- Table & View DML Grants
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA internal FROM PUBLIC, anon, authenticated;

-- Analytics reads (security_invoker view over private.mv_course_stats — the
-- matching SELECT on that MV is granted further below). PostgREST can only
-- reach the MV through this tenant-filtered view.
GRANT SELECT ON public.vw_course_stats TO authenticated, anon, service_role;

-- PHASE 6 FIX (2026-09-21): the Section 12 block at the very top of this
-- file granted SELECT on offline_download_entitlements BEFORE the blanket
-- "REVOKE ALL ON ALL TABLES IN SCHEMA public" sweep below — the exact
-- dead-on-arrival ordering the note above that sweep warns about. In every
-- database deployed from this source, authenticated therefore could not
-- read its own entitlement rows at all and the
-- offline_entitlements_select_own RLS policy (09_rls.sql) was unreachable
-- (verified live against production 2026-09-21: zero authenticated grants
-- on this table). Writes remain RPC-only; this restores the documented
-- Section 12 read contract ("the client may read only its own server
-- entitlement rows"). The app currently reads entitlements only through
-- authorize_offline_download/revalidate_offline_entitlement, so this is
-- fail-closed contract repair, not a widening of any reachable path.
GRANT SELECT ON TABLE public.offline_download_entitlements TO authenticated;

-- Core read access
GRANT SELECT ON public.regions                  TO authenticated;
-- anon intentionally excluded: RLS policy regions_select is scoped `TO authenticated`
-- only, so anon never sees rows anyway; the grant was dead/misleading privilege
-- surface on a table an anonymous user should never be able to query at all.
GRANT SELECT ON public.tenants                  TO authenticated;
-- anon intentionally excluded: tenants_anon_deny explicitly denies anon, and
-- tenants_select_merged is scoped `TO authenticated` only; the grant was dead.
GRANT SELECT ON public.users                    TO authenticated;
GRANT SELECT ON public.roles, public.permissions, public.role_permissions, public.user_roles TO authenticated;
-- settings_kv is the ONLY settings table anon may read: the student app's
-- forced-update gate queries it (latest_version / min_app_version /
-- force_update / update_message / store links / support_link) on every cold
-- start BEFORE any session exists, by design — a force update must block
-- pre-login access. RLS row-scoping is handled by the `settings_select`
-- policy (09_rls.sql, "patch 9"), which exposes anon only `is_public = true`
-- rows; all seven update keys are seeded is_public (11_seed_reference.sql).
-- Production evidence (supabase_logs 2026-09-19): every cold start hit
-- 401/42501 "permission denied for table settings_kv" as anon, silently
-- disabling the pre-login forced-update gate app-wide.
-- settings_cache and security_settings stay authenticated+service_role only.
GRANT SELECT ON public.settings_kv              TO authenticated, service_role, anon;
GRANT SELECT ON public.settings_cache, public.security_settings TO authenticated, service_role;
-- Feature-flag tables are granted below, in the dedicated "Feature Flags —
-- least-privilege grants" section, which resets privileges with REVOKE ALL
-- before re-granting; that is the canonical definition for these 4 tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses, public.course_prerequisites, public.course_learning_objectives, public.sections, public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_contents TO authenticated;
-- DBSEC-001 (2026-09-23, Phase 1 security audit): direct client UPDATE on
-- enrollments is revoked. No app writes this table directly: the Student App
-- is SELECT-only (all five lib/ usages are .select()) and the Dashboard
-- mutates through the enroll_student / revoke_enrollment / extend_enrollment
-- RPCs; progress is recomputed server-side by trg_update_enrollment_progress
-- and the enrollment-progress workers, which run in definer context and are
-- unaffected by this revoke. The old full-row UPDATE grant let a user repoint
-- their OWN enrollment row at any other course in their tenant
-- (course_id/status/revoked_at/expires_at are unpinned in the self-branch of
-- enrollments_update_merged, 09_rls.sql) and thereby satisfy
-- has_course_access() for a course they were never enrolled in — an
-- entitlement-forgery path. Same hardening model as users above.
REVOKE UPDATE ON public.enrollments FROM authenticated;
GRANT SELECT, INSERT ON public.enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.course_ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
-- security_incidents: direct client INSERT was revoked (2026-09-19). Two
-- problems with the old authenticated-only grant, both seen in production
-- (supabase_logs 2026-09-19): pre-auth RASP events could never be written
-- (401/42501 — the most valuable signals, from callers who never log in),
-- and an authenticated client could flood the table with zero rate limiting
-- or payload validation. All client telemetry — pre-auth (user_id stays
-- NULL) and authenticated (user_id pinned server-side to auth.uid()) —
-- flows through public.report_security_incident() (grants below, next to
-- the log_activity_async section), which validates payload shape and
-- absorbs volume abuse server-side. Telemetry only: never an authorization
-- boundary.
REVOKE INSERT ON public.security_incidents FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT SELECT, INSERT ON public.video_views TO authenticated;
GRANT SELECT, INSERT ON public.todos TO authenticated;
GRANT UPDATE (title, due_at, priority, is_completed, deleted_at) ON public.todos TO authenticated;
GRANT SELECT ON public.warnings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT SELECT, INSERT ON public.user_location_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_last_location TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs, public.audit_chain_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications, public.notification_targets TO authenticated;
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT SELECT ON public.user_permission_cache    TO authenticated, service_role;
-- anon intentionally excluded: user_permission_cache_select_own is scoped
-- `TO authenticated` only and this table holds per-user role/permission data;
-- the grant was dead but unnecessarily widened the blast radius of any future
-- RLS policy mistake on a sensitive table.
GRANT SELECT ON public.constants TO authenticated;
GRANT SELECT ON public.user_validity_cache TO authenticated, service_role;
GRANT SELECT ON public.mv_course_stats TO authenticated, service_role, anon;
-- public.vw_course_stats is security_invoker, so its invoker also needs SELECT
-- on the underlying MV or every read fails with "permission denied for
-- materialized view mv_course_stats" (System Analytics course section rendered
-- empty despite data). private.* is not API-exposed, so the filtered view
-- remains the only reachable path.
GRANT SELECT ON private.mv_course_stats TO authenticated, anon;

-- Mutation grants (RLS still controls who can do what)
GRANT INSERT, DELETE ON public.users                             TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.courses                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.course_prerequisites      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.course_learning_objectives TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sections                  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lessons                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lesson_contents           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.devices                   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.activity_logs             TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.notifications             TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.push_tokens FROM PUBLIC, anon, authenticated;

-- Service role access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA audit TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA internal TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;
GRANT SELECT ON private.mv_user_stats        TO service_role;
GRANT SELECT ON private.mv_course_stats      TO service_role;
GRANT SELECT ON private.mv_course_stats_tenant TO service_role;
GRANT SELECT ON private.mv_daily_activity_30d TO service_role;

-- Special Revokes
REVOKE DELETE ON public.todos FROM authenticated;
REVOKE UPDATE, DELETE ON public.activity_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.warnings FROM authenticated;
REVOKE UPDATE ON public.users FROM authenticated;
-- PHASE 6 FIX (2026-09-21): INSERT/DELETE on public.users are not client
-- operations. Accounts are provisioned exclusively through the service-role
-- create-user Edge Function, and physical DELETE is blocked by
-- trg_prevent_physical_delete_users regardless. Leaving INSERT granted was
-- a live privilege-escalation surface: users_admin_insert (09_rls.sql)
-- validates the CALLER's role, never the inserted row's primary_role value,
-- so a tenant-scoped admin could bind an orphaned auth.users UUID (email
-- uniqueness is the only remaining guard) as a NEW profile with
-- primary_role='super_admin' — which is_current_user_super_admin() then
-- treats as fully cross-tenant. service_role is unaffected (blanket
-- GRANT ALL ON ALL TABLES IN SCHEMA public below).
REVOKE INSERT, DELETE ON public.users FROM authenticated;
-- Backward compatibility for released clients. RLS still limits the row to
-- the current user, and column privileges limit the mutation to telemetry.
GRANT UPDATE (last_login, last_seen_at) ON public.users TO authenticated;
REVOKE ALL ON public.activity_log_queue FROM anon, authenticated;

-- Client observability write path (Section 15 / P15): the table above is
-- deliberately unreachable from any client role, so `public.log_my_activity`
-- and `public.log_activity_async` (both SECURITY DEFINER, both enforce
-- `p_user_id = auth.uid()` / AUTH_REQUIRED server-side before writing --
-- see supabase/schema/07_functions.sql) are the *only* client write path
-- into it. Neither had an explicit REVOKE/GRANT pair, so both silently
-- retained PostgreSQL's default EXECUTE-TO-PUBLIC grant instead of
-- following this file's explicit least-privilege model -- close that gap
-- explicitly rather than relying on the implicit default.
REVOKE ALL ON FUNCTION public.log_my_activity(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_my_activity(text, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_activity_async(uuid, text, jsonb, inet, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity_async(uuid, text, jsonb, inet, uuid, text, uuid)
  TO authenticated, service_role;

-- Client RASP telemetry ingestion (the ONLY client write path into
-- public.security_incidents — direct INSERT was revoked above). anon is
-- granted deliberately: pre-auth threat events (repackaging, hooks, root —
-- fired before any login) are exactly the signals this table exists to
-- capture, and the RPC absorbs abusive volume server-side (per-IP 30/hour
-- probe + global 100/5min anonymous breaker, both silent) and validates
-- payload shape. user_id is pinned server-side (auth.uid(), NULL for anon);
-- a caller-supplied user id is never accepted. See 07_functions.sql.
REVOKE ALL ON FUNCTION public.report_security_incident(text, text, text, boolean, text, text, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_security_incident(text, text, text, boolean, text, text, text, jsonb)
  TO anon, authenticated, service_role;

REVOKE ALL ON internal.job_queue FROM anon, authenticated, public;
REVOKE ALL ON audit.slow_query_log FROM anon, authenticated, public;
REVOKE ALL ON audit.lesson_state_transitions FROM anon, authenticated, public;
REVOKE ALL ON audit.pii_access_log FROM anon, authenticated, public;
REVOKE ALL ON audit.deletion_audit FROM anon, authenticated, public;
REVOKE ALL ON internal.workers FROM anon, authenticated, public;
REVOKE ALL ON internal.job_progress FROM anon, authenticated, public;
REVOKE ALL ON public.push_deliveries FROM anon, authenticated, public;

-- ============================================================================
-- Storage security (source of truth)
-- ============================================================================
-- Reports/exports are backend-only artifacts and must never become public.
-- Avatars are intentionally public for the existing client contract, but
-- authenticated clients may only write/delete their own <uid>/... objects.
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('reports', 'reports', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('exports', 'exports', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  -- SECTION-09 FIX: the 'videos' bucket holds paid/enrollment-gated course
  -- content and is read exclusively via get-lesson-content/index.ts, which
  -- validates access through public.get_lesson_content() and only then
  -- mints a 180-second signed URL with the service-role client. That
  -- authorization path is meaningless if the bucket itself is public --
  -- anyone who learns or enumerates a storage path could stream the file
  -- directly, with no enrollment check and no expiry. Unlike avatars/
  -- reports/exports, this bucket had no committed privacy assertion at
  -- all, so a dashboard toggle (accidental or otherwise) could silently
  -- undo the access-control fix above with no code-level signal.
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('videos', 'videos', false)
  ON CONFLICT (id) DO UPDATE SET public = false;
END $$;

-- No anon/authenticated object DML or SELECT policies are defined for
-- 'videos' objects, intentionally: all reads happen through service-role
-- signed URLs issued by get-lesson-content after get_lesson_content()
-- authorization, never through a direct authenticated/anon storage.objects
-- query. This matches the existing reports/exports pattern above.

-- AVATAR-BUG-01 FIX: upsert requires a SELECT on storage.objects to check
-- whether the object already exists before deciding INSERT vs UPDATE.
-- Without this policy, Postgres RLS blocks the internal SELECT even on a
-- public bucket (bucket-level `public = true` controls HTTP access, not RLS),
-- causing every avatar upload to fail with a generic StorageException that
-- surfaces to the user as "حدث خطأ" / "An error occurred".
-- Scope is restricted to the user's own uid-prefix folder, matching the
-- INSERT/UPDATE/DELETE policies that were already in place.
DROP POLICY IF EXISTS avatars_select_own_folder ON storage.objects;
CREATE POLICY avatars_select_own_folder
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_insert_own_folder ON storage.objects;
CREATE POLICY avatars_insert_own_folder
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_update_own_folder ON storage.objects;
CREATE POLICY avatars_update_own_folder
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_delete_own_folder ON storage.objects;
CREATE POLICY avatars_delete_own_folder
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- No anon/authenticated object DML policies are defined for reports/exports.
-- Their service-role-only workflow is intentional; the bucket-level privacy
-- assertion above prevents accidental public objects.

-- ============================================================================
-- Function Permissions - Consolidated
-- ============================================================================

-- Global Function Revoke (Reset to safe default)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 1. MUST REMAIN PUBLIC
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_constant(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_default_region_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.system_tenant_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.immutable_tsvector(text) TO authenticated, anon, service_role;

-- 2. AUTHENTICATED ONLY - Key user-facing functions
-- Note: For functions with parameters, use full signature or rely on default privileges
-- Most functions with complex signatures are already blocked by ALTER DEFAULT PRIVILEGES above

-- check_user_access() was split into two role-scoped gates (see
-- 07_functions.sql): check_student_app_access() for the student app and
-- check_dashboard_access() for the admin/teacher/super_admin dashboard.
REVOKE EXECUTE ON FUNCTION public.check_student_app_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_student_app_access() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_dashboard_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_dashboard_access() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.assert_tenant() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;

-- Tenant Switcher: granted broadly (matches assert_tenant() above and the
-- control_user_account family) because the real authorization is enforced
-- INSIDE the function (is_current_user_super_admin()), not at the grant
-- level -- a non-super_admin authenticated caller reaches the function and
-- gets PERMISSION_DENIED from it, same defense-in-depth pattern used
-- throughout this file.
REVOKE EXECUTE ON FUNCTION public.switch_tenant_context(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.switch_tenant_context(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_user_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_current_tenant_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.tenant_matches_jwt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_matches_jwt(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_admin_with_session_validation() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_with_session_validation() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_current_user_teacher() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_teacher() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_course(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_course(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_teacher_of_course(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_course(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enroll_in_course(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enroll_in_course(uuid) TO authenticated, service_role;

-- rate_course(uuid, integer): student-facing rating submission (upsert on
-- course_ratings). The RPC derives tenant/enrollment server-side; direct
-- table writes stay admin-only via RLS. Same least-privilege pattern as
-- enroll_in_course above. The PUBLIC revoke is required: functions default
-- to GRANT EXECUTE TO PUBLIC at creation, and anon inherits via PUBLIC
-- membership, so revoking from anon alone still leaks EXECUTE to anon
-- (caught by VALIDATION's Course Ratings anon-leak).
REVOKE ALL ON FUNCTION public.rate_course(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_course(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_course(uuid, integer) TO authenticated, service_role;

-- get_courses_instructors(uuid[]): resolves instructor display name/avatar
-- for published courses in the caller's tenant without exposing users rows
-- (the users SELECT RLS intentionally hides other users' rows from
-- students, which is why PostgREST teacher joins resolve to NULL for
-- them). Read-only, STABLE. PUBLIC revoke required for the same reason as
-- rate_course above.
REVOKE ALL ON FUNCTION public.get_courses_instructors(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_courses_instructors(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_courses_instructors(uuid[]) TO authenticated, service_role;

-- extend_enrollment(uuid, uuid, timestamptz): admin/teacher operation to extend
-- or renew a student's enrollment. The function body enforces courses.manage
-- permission, tenant isolation, and status-transition rules internally.
-- Same least-privilege pattern as enroll_in_course above.
REVOKE ALL ON FUNCTION public.extend_enrollment(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_enrollment(uuid, uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.extend_enrollment(uuid, uuid, timestamptz) TO authenticated, service_role;

-- courses-subsystem-production-hardening-plan.md Phase 2/3: server-side
-- lesson-progress write RPC, replacing the client-resolved-tenant direct
-- upsert. Same authenticated-only exposure as the other user-callable
-- course/lesson RPCs on this page.
REVOKE EXECUTE ON FUNCTION public.update_lesson_progress(uuid, uuid, numeric, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_lesson_progress(uuid, uuid, numeric, boolean, integer) TO authenticated, service_role;

-- SECTION-09 FIX: get_lesson_content()/check_lesson_access() are the
-- server-side authorization boundary for streaming lesson video (see
-- get-lesson-content/index.ts). They were defined with SECURITY DEFINER
-- but never explicitly GRANTed. Grant EXECUTE explicitly, matching the
-- other user-callable course/lesson RPCs above.
REVOKE EXECUTE ON FUNCTION public.get_lesson_content(uuid, inet, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_content(uuid, inet, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_lesson_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_lesson_access(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.logout_current_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.logout_current_user() TO authenticated, service_role;

-- AUTH-BUG-01 FIX: bind_device_for_current_user() is called on every
-- successful login (see AuthRemoteDataSource.bindDevice()) but, like
-- get_lesson_content/check_lesson_access above before their fix, was
-- defined with SECURITY DEFINER and never explicitly GRANTed. Because
-- 10_permissions.sql's default-privilege REVOKE (above) strips the
-- implicit PUBLIC EXECUTE that PostgreSQL would otherwise grant new
-- functions, every call landed on PostgREST as "function not found in
-- schema cache" / permission-denied rather than a real business-rule
-- rejection. Explicit least-privilege grant, matching the pattern used
-- for every other user-callable auth RPC in this file: authenticated
-- can call it, anon and PUBLIC cannot.
REVOKE ALL ON FUNCTION public.bind_device_for_current_user(text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bind_device_for_current_user(text, jsonb, text, text) TO authenticated, service_role;

-- record_current_session() is the student app's only write path into
-- public.sessions on a fresh login (AuthRemoteDataSource.recordSession()).
-- SECURITY DEFINER derives the caller's real request IP server-side; a
-- client-supplied IP would be trivially spoofable. Same least-privilege
-- pattern as bind_device_for_current_user above: authenticated can call
-- it, anon and PUBLIC cannot.
REVOKE ALL ON FUNCTION public.record_current_session(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_current_session(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_push_token(text, text, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, jsonb, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deactivate_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_push_token(text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_push_delivery(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_delivery(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_push_delivery(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_push_delivery(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.fail_push_delivery(uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_push_delivery(uuid, text, text, boolean)
  TO service_role;
REVOKE ALL ON FUNCTION public.complete_notification_push_job(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_push_job(uuid, boolean, text)
  TO service_role;
REVOKE ALL ON FUNCTION internal.invoke_notification_push_worker()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.invoke_notification_push_worker() TO service_role;

-- BUG-NOTIF-01 FIX: public.process_notification_fanout_jobs() was defined
-- (07_functions.sql) as the single source of truth for turning a queued
-- 'notification_fanout' job into user_notifications + push_deliveries rows,
-- and GET /api/cron/routine is documented to call it every tick -- but it was
-- never granted to service_role, so even after the route is fixed to call it
-- (instead of the removed hand-rolled TS reimplementation), the RPC would
-- fail with PERMISSION_DENIED / "permission denied for function" and
-- audience-targeted notifications ('all'/'students'/'teachers'/'admins')
-- would silently never reach any student's inbox.
REVOKE ALL ON FUNCTION public.process_notification_fanout_jobs(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_notification_fanout_jobs(integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.process_course_notify_jobs(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_course_notify_jobs(integer, text)
  TO service_role;

-- Launch audit B2 (2026-09-15): thin public wrappers for GET /api/cron/routine
-- so PostgREST can resolve the four maintenance RPCs (their implementations
-- live in internal/maintenance/private schemas that PostgREST cannot reach).
-- service_role is the ONLY caller of both the wrappers and the originals.
REVOKE ALL ON FUNCTION public.manage_partitions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_partitions() TO service_role;
REVOKE ALL ON FUNCTION public.prune_expired_access_cache()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_access_cache() TO service_role;
REVOKE ALL ON FUNCTION public.process_cache_purges(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_cache_purges(integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.process_update_enrollment_totals_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_update_enrollment_totals_jobs(integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.cron_queue_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_queue_health() TO service_role;

-- Hardening for the same audit finding: strip the implicit PUBLIC EXECUTE
-- default from the underlying routines so the only path in is the public
-- wrapper above (notably internal.process_update_enrollment_totals_jobs,
-- which has no in-function permission guard).
REVOKE ALL ON FUNCTION maintenance.manage_partitions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION maintenance.manage_partitions() TO service_role;
REVOKE ALL ON FUNCTION private.prune_expired_access_cache()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prune_expired_access_cache() TO service_role;
REVOKE ALL ON FUNCTION internal.process_cache_purges(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.process_cache_purges(integer, text) TO service_role;
REVOKE ALL ON FUNCTION internal.process_update_enrollment_totals_jobs(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.process_update_enrollment_totals_jobs(integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION internal.send_system_notification(uuid, text, text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.send_system_notification(uuid, text, text, uuid[])
  TO service_role;

REVOKE ALL ON FUNCTION public.record_current_user_activity(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_current_user_activity(boolean, text) TO authenticated, service_role;

-- PROFILE-BUG-01 FIX: api_update_profile() (5.3 Profile Update RPC, in
-- 07_functions.sql) is the intended SECURITY DEFINER write path for a
-- user's own first_name/last_name/avatar_url/timezone/locale -- the
-- direct `.from('users').update(...)` calls it exists specifically to
-- replace are blocked below by `REVOKE UPDATE ON public.users FROM
-- authenticated` (only `last_login`/`last_seen_at` are re-granted as
-- narrow telemetry columns). Same root cause and same fix pattern as
-- bind_device_for_current_user/get_lesson_content above: SECURITY
-- DEFINER alone does not grant EXECUTE once this file's default-privilege
-- REVOKE has stripped the implicit PUBLIC grant, so every profile-name
-- update and every avatar upload's follow-up column write was landing on
-- PostgREST as permission-denied. See profile_remote_ds.dart for the
-- matching client-side change (updateProfile()/uploadAvatar() now call
-- this RPC instead of updating public.users directly).
REVOKE ALL ON FUNCTION public.api_update_profile(varchar, varchar, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_update_profile(varchar, varchar, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_user_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_user_session() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.assert_valid_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_valid_session() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_user_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_session() TO authenticated, service_role;

-- FIX (regression introduced and now corrected during this cleanup pass):
-- the 4-arg overload's explicit REVOKE FROM PUBIC/anon + GRANT TO
-- authenticated/service_role was dropped when this block was relocated
-- out of a duplicate "Function Permissions" section earlier in this
-- cleanup. Without it, the function keeps the default PUBLIC EXECUTE grant
-- Postgres assigns at CREATE FUNCTION time, so anon can call the real
-- rate-limiting RPC directly -- exactly the least-privilege violation
-- Check "Rate-Limit RPC Least Privilege" in VALIDATION.sql exists to catch.
REVOKE ALL ON FUNCTION public.check_rate_limit(text, uuid, inet, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, inet, uuid) TO authenticated, service_role;

-- Deprecated 3-arg overload (public.check_rate_limit(text, integer, integer)) is a
-- fail-closed stub (see 07_functions.sql) that only raises DEPRECATED_API; explicitly
-- revoked from every role, including authenticated, so it is unreachable via PostgREST.
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- PERF-05 FIX (get_tenants_usage): This SECURITY DEFINER function carries an
-- internal is_admin_with_session_validation() guard that rejects non-admins at
-- runtime. However, because 10_permissions.sql's ALTER DEFAULT PRIVILEGES REVOKE
-- (line 279) strips the implicit PUBLIC EXECUTE grant that Postgres assigns at
-- CREATE FUNCTION time, PostgREST's schema cache never learned about the function
-- at all — every call from tenants.service.ts landed as a 404
-- ("function public.get_tenants_usage(p_tenant_ids) not found in schema cache").
-- Same root cause and same fix pattern as bind_device_for_current_user /
-- get_lesson_content / api_update_profile above: explicit REVOKE + GRANT makes
-- the function visible to PostgREST; the body still rejects non-admins.
REVOKE ALL ON FUNCTION public.get_tenants_usage(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenants_usage(uuid[]) TO authenticated, service_role;

-- 3. ADMIN ONLY - Revoked from anon AND authenticated; granted to service_role only
-- DBSEC-007 (2026-09-23): is_current_user_super_admin() is re-granted to
-- authenticated. The body validates the caller's session and reads
-- users.primary_role server-side (07_functions.sql), so granting EXECUTE
-- exposes no privilege — it only lets the expression evaluate for browser
-- callers. It is referenced by security_invoker views (vw_course_stats /
-- public.mv_course_stats, whose SELECT grants to authenticated+anon were
-- otherwise dead: a security_invoker view requires the INVOKER to hold
-- EXECUTE on every function in its WHERE clause, so browser SELECTs failed
-- at plan time) and by admin job RPCs and tenants write policies, which
-- previously failed with a plan-time permission error instead of a clean
-- RLS denial for non-admins. The *_lite variant below is already
-- PUBLIC-executable; this aligns the strict variant's surface with it.
REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin_lite() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin_lite() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin_lite() TO service_role;

REVOKE EXECUTE ON FUNCTION public.lock_app_for_all(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_app_for_all(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lock_app_for_all(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.unlock_app() FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_app() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_app() TO service_role;

REVOKE EXECUTE ON FUNCTION public.disable_maintenance_mode() FROM anon;
REVOKE EXECUTE ON FUNCTION public.disable_maintenance_mode() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.disable_maintenance_mode() TO service_role;

REVOKE EXECUTE ON FUNCTION public.enable_maintenance_mode(text, timestamptz, text[], uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enable_maintenance_mode(text, timestamptz, text[], uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enable_maintenance_mode(text, timestamptz, text[], uuid[]) TO service_role;

-- 4. INTERNAL ONLY - Revoked from anon AND authenticated; granted to service_role only
REVOKE EXECUTE ON FUNCTION public.decrypt_pii(bytea, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrypt_pii(bytea, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_pii(bytea, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.encrypt_pii(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.encrypt_pii(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_pii(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dequeue_job(text, text[], integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dequeue_job(text, text[], integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dequeue_job(text, text[], integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_primary_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_primary_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_primary_role() TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_settings_cache() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_settings_cache() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_settings_cache() TO service_role;

-- P0 LOCK/UNLOCK FIX follow-up: terminate_user_sessions gained a mandatory
-- p_actor_id third parameter (SECURITY FIX 2026-09-05 in 07_functions.sql —
-- the service-role admin client carries no user JWT, so auth.uid() was always
-- NULL and the old guard denied every call). These signature-pinned
-- REVOKE/GRANT lines still referenced the old 2-arg signature, which made a
-- fresh canonical deploy fail right here with "function
-- public.terminate_user_sessions(uuid, text) does not exist" (the same
-- cross-file consistency break the go-no-go checklist recorded for the first
-- fix attempt). Updated to the current 3-arg signature.
REVOKE EXECUTE ON FUNCTION public.terminate_user_sessions(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.terminate_user_sessions(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_user_sessions(uuid, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_user_validity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_user_validity() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_schedule_mv_refresh() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_schedule_mv_refresh() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_user_roles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_sync_user_roles() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_trim_notification_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_trim_notification_fields() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_update_enrollment_progress() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_update_enrollment_progress() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_users_email_hardening() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_users_email_hardening() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_validate_enrollments_tenant_match() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_validate_enrollments_tenant_match() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.worker_control_user_account(uuid, uuid, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.worker_control_user_account(uuid, uuid, text, text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.worker_terminate_user_sessions(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.worker_terminate_user_sessions(uuid, uuid, text) FROM authenticated;

-- SECURITY FIX (2026-09-08): control_user_account(uuid, text, text,
-- integer, uuid) still had NO REVOKE/GRANT anywhere in this file even
-- after the p_actor_id fix above -- it carried Postgres's default
-- EXECUTE-to-PUBLIC grant. infrastructure/repos/user-admin.repository.ts
-- now calls worker_control_user_account exclusively (this function is
-- unreferenced in apps/ and supabase/functions/ — confirmed by grep), but
-- it was still live and callable: any authenticated user holding
-- 'users.lock' (any admin) could call it directly with their own id as
-- p_actor_id -- correctly passing its permission check -- and bypass both
-- the Server Action's Zod validation and the M13 audit-log entry
-- account-control.use-case.ts writes after the (now-unused) RPC path.
-- Locking it down rather than dropping it outright, since
-- VALIDATION.sql's Check 12B still expects it to exist and call
-- private.revoke_auth_sessions.
--
-- NOTE: p_actor_id was appended as a 5th, trailing parameter here
-- (p_user_id, p_action, p_reason, p_suspend_hours, p_actor_id) rather than
-- inserted first the way worker_control_user_account does it -- the
-- signature is (uuid, text, text, integer, uuid), NOT
-- (uuid, uuid, text, text, integer). Run #30 failed with "function
-- public.control_user_account(uuid, uuid, text, text, integer) does not
-- exist" because the first version of this fix assumed the two functions
-- shared the same parameter order; they don't.
REVOKE EXECUTE ON FUNCTION public.control_user_account(uuid, text, text, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.control_user_account(uuid, text, text, integer, uuid) FROM authenticated;

-- decrypt_pii/dequeue_job/encrypt_pii are already granted to service_role above
-- (see "4. INTERNAL ONLY"); only the two worker_* grants below are new here.
GRANT EXECUTE ON FUNCTION public.worker_control_user_account(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.worker_terminate_user_sessions(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.control_user_account(uuid, text, text, integer, uuid) TO service_role;

-- 5. SUPABASE AUTH HOOK
-- Supabase Auth needs schema USAGE plus EXECUTE to invoke Postgres hooks.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.custom_access_token(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token(jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION private.refresh_all_materialized_views() TO service_role;

REVOKE ALL ON FUNCTION private.get_kms_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_kms_key() TO service_role;

REVOKE ALL ON FUNCTION private.current_jwt_token_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_jwt_token_version() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- video_cache & download_logs Permissions
-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION-12 CRITICAL FIX: video_cache is a purely internal cache written
-- and read exclusively by the `video-info` Edge Function using the
-- service_role key (which bypasses RLS/GRANTs entirely) -- no Flutter code
-- ever queries this table directly (confirmed: no `video_cache` reference
-- anywhere under lib/). It previously also carried `GRANT SELECT ... TO
-- authenticated` paired with a RLS policy of `USING (expires_at > now())`
-- with no lesson/course/enrollment scoping at all. Since this table stores
-- resolved, directly-playable video/audio URLs (`data` jsonb -> formats[].
-- video_url/audio_url) for every lesson ever opened by any student on the
-- platform, that combination let ANY authenticated user call
-- `GET /rest/v1/video_cache?select=*` directly via PostgREST and retrieve
-- every other student's cached lesson video URLs -- including lessons/
-- courses they were never enrolled in -- completely bypassing
-- get_lesson_content()'s enrollment/tenant/preview checks. This is exactly
-- the "client requests arbitrary media URL bypassing entitlement
-- enforcement" case the offline/download-security instructions explicitly
-- forbid. Revoking the grant closes it at the PostgREST layer (query is
-- rejected before RLS is even evaluated); the matching policy is also
-- removed in 09_rls.sql for defense in depth.
REVOKE ALL ON public.video_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.video_cache TO service_role;

GRANT SELECT, INSERT ON public.download_logs TO authenticated;
GRANT ALL ON public.download_logs TO service_role;

-- ============================================================================
-- Feature Flags — least-privilege grants
-- ============================================================================

REVOKE ALL ON TABLE public.feature_flags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_feature_flags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.feature_flag_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.feature_flag_roles FROM PUBLIC, anon, authenticated;

-- RLS remains the authorization boundary for authenticated administrative access.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.feature_flags
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.tenant_feature_flags
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.feature_flag_users
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.feature_flag_roles
TO authenticated;

GRANT ALL ON TABLE public.feature_flags,
               public.tenant_feature_flags,
               public.feature_flag_users,
               public.feature_flag_roles
TO service_role;

REVOKE ALL ON FUNCTION public.feature_flag_rollout_bucket(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.evaluate_feature_flag(text, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_feature_flag(text, uuid, uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.evaluate_feature_flags(text[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_feature_flags(text[])
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_feature_enabled(text, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text, uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_feature_enabled_for_user(text, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled_for_user(text, uuid)
TO authenticated, service_role;

GRANT SELECT ON public.feature_flags_admin TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY FIX (2026-09-12): Launch-blocking RPC permission gaps.
-- ─────────────────────────────────────────────────────────────────────────────
-- Five SECURITY DEFINER functions were defined in 07_functions.sql without an
-- explicit REVOKE/GRANT pair in this file, AND without a body-level guard.
-- The ALTER DEFAULT PRIVILEGES REVOKE at line 279 only affects functions
-- created *after* that statement runs, so every function defined earlier in
-- 07_functions.sql retains PostgreSQL's default `EXECUTE TO PUBLIC` grant.
--
-- That combination (`grant=no` AND `body_guard=no`) made each of these five
-- functions callable by any anonymous or authenticated user via
-- POST /rest/v1/rpc/<fn>, bypassing RLS entirely (SECURITY DEFINER runs as
-- the function owner, which is the postgres superuser).
--
-- The five functions:
--   DB-1: cleanup_test_data()        — deletes production data (CRITICAL)
--   DB-2: seed_test_data()           — creates tenants/users/courses (CRITICAL)
--   DB-3: sync_primary_role_for_user(uuid) — mutates users.primary_role (CRITICAL)
--   DB-4: get_user_role_by_id(uuid)  — cross-tenant role disclosure (HIGH)
--   DB-5: check_gdpr_compliance(uuid) — cross-tenant PII leak (HIGH)
--
-- `seed_test_data` and `cleanup_test_data` have no callers anywhere in
-- apps/admin/ or supabase/functions/ (verified via grep). They are
-- explicitly locked to service_role only — they should never be callable
-- from PostgREST. `sync_primary_role_for_user`, `get_user_role_by_id`,
-- and `check_gdpr_compliance` also gained a body guard inside
-- 07_functions.sql as defense-in-depth (see that file).
REVOKE ALL ON FUNCTION public.cleanup_test_data()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_test_data()
  TO service_role;

REVOKE ALL ON FUNCTION public.seed_test_data()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_test_data()
  TO service_role;

REVOKE ALL ON FUNCTION public.sync_primary_role_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_primary_role_for_user(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_user_role_by_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role_by_id(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.check_gdpr_compliance(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_gdpr_compliance(uuid)
  TO service_role;

-- SECURITY FIX (2026-09-12) — launch-blocker APP-2 follow-up:
-- `admin_get_job_tenant_id(uuid)` is the read-side helper used by
-- jobs.service.ts's getJobTenantId(), which the action boundary calls
-- via assertSameTenant before retryJobAction/cancelJobAction mutate the
-- job. Locked to service_role only — the body guard inside 07_functions.sql
-- also permits is_admin_with_session_validation() as defense-in-depth,
-- but PostgREST exposure is service_role-only because the action boundary
-- already authenticates the caller.
REVOKE ALL ON FUNCTION public.admin_get_job_tenant_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_job_tenant_id(uuid)
  TO service_role;

-- SECURITY FIX (2026-09-12) — launch-blocker APP-2 follow-up:
-- `admin_get_job_counts_tenant(uuid)` is the tenant-scoped variant of
-- admin_get_job_counts used by jobs.service.ts's getJobStatusCounts when
-- the caller is a tenant-scoped admin. Same least-privilege exposure as
-- admin_get_job_tenant_id above.
REVOKE ALL ON FUNCTION public.admin_get_job_counts_tenant(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_job_counts_tenant(uuid)
  TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX (2026-09-12) — launch-readiness sweep, residual PUBLIC EXECUTE
-- ═════════════════════════════════════════════════════════════════════════════
-- Final sweep for public-schema SECURITY DEFINER functions that still carried
-- Postgres's default EXECUTE TO PUBLIC (no explicit REVOKE/GRANT anywhere in
-- this file). None of the four functions below has any caller in apps/admin/
-- or supabase/functions/ (verified via grep), and none has a body guard, so
-- each was anonymously invocable via POST /rest/v1/rpc/<name>:
--
--   1. refresh_all_materialized_views() — SECURITY DEFINER, no guard, no
--      REVOKE: an anonymous caller could force three concurrent REFRESH
--      MATERIALIZED VIEW CONCURRENTLY runs per request (private.mv_course_stats,
--      public.vw_student_progress_timeline, public.vw_daily_revenue) — a cheap
--      resource-exhaustion DoS. Locked to service_role only (the cron/worker
--      path uses private.refresh_all_materialized_views, already locked).
--
--   2. check_and_increment_rate_limit(...) — SECURITY DEFINER, no guard: any
--      caller could insert into public.rate_limits with an ARBITRARY
--      p_tenant_id/p_user_id/p_ip_address and increment hit counts for a
--      chosen key until blocked_until is set — i.e. force rate-limit lockouts
--      for chosen victims and pollute rate-limit telemetry. No caller in the
--      app (the app-facing RPC is check_rate_limit(text,uuid,inet,uuid),
--      already locked at "Rate-Limit RPC Least Privilege" above). Locked to
--      service_role only.
--
--   3. log_security_alert(text,text,text) — SECURITY DEFINER, no guard: anon
--      could write unbounded attacker-controlled rows into audit.alert_log
--      (audit spam / storage fill / misleading alerts). Locked to service_role.
--
--   4. find_user_by_email(text) — SECURITY DEFINER, no guard. Body scopes to
--      get_current_tenant_id() (NULL for anon, so it returned nothing), but it
--      still gave any authenticated in-tenant caller an email→uuid enumeration
--      oracle. No caller anywhere; granted to authenticated + service_role to
--      preserve potential legitimate in-tenant admin use, anon excluded.
REVOKE ALL ON FUNCTION public.refresh_all_materialized_views()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_materialized_views()
  TO service_role;

REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit(text, uuid, uuid, inet, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, uuid, uuid, inet, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.log_security_alert(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_alert(text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.find_user_by_email(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY FIX (2026-09-12) — audit_chain_state grant narrowing (LOW, hardening)
-- ─────────────────────────────────────────────────────────────────────────────
-- The table grant above ("GRANT SELECT, INSERT, UPDATE, DELETE ON
-- public.activity_logs, public.audit_chain_state TO authenticated") gave
-- authenticated DML on audit_chain_state, a table whose only legitimate
-- client-visible operation is SELECT (its own RLS policies are SELECT-only
-- and prevent_audit_mutation blocks writes at the trigger layer anyway).
-- RLS made the extra grants unreachable today, but they widened the blast
-- radius of any future RLS policy mistake — the exact pattern this file
-- removes everywhere else. Narrow to SELECT-only.
REVOKE INSERT, UPDATE, DELETE ON public.audit_chain_state FROM authenticated;
GRANT SELECT ON public.audit_chain_state TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCESS RULES GRANTS FIX (2026-09-15) — resolves PostgREST 403 on
-- GET /rest/v1/access_rules from the admin dashboard browser client.
-- ─────────────────────────────────────────────────────────────────────────────
-- The blanket REVOKE ("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM
-- PUBLIC, anon, authenticated") removed every table grant in `public` from
-- `authenticated`, but per-table grants were never re-added for
-- access_rules / user_access_rules. PostgREST therefore rejects the
-- browser client's SELECT with 403 permission-denied BEFORE RLS is even
-- evaluated (an RLS denial would surface as a 200 with an empty array,
-- not a 403).
--
-- The access_rules_admin / user_access_rules_admin policies in 09_rls.sql
-- remain the authorization boundary (admin-only, tenant-scoped via
-- is_admin_with_session_validation() + get_current_tenant_id()) — the same
-- pattern already used for the feature_flags tables above. service_role
-- keeps full access via the blanket GRANT ALL ON ALL TABLES earlier in
-- this file; anon stays revoked.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_rules      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_access_rules TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX (2026-09-21) — Phase 5 authorization sweep (student app audit)
-- ═════════════════════════════════════════════════════════════════════════════
-- Two gaps found by the Phase 5 (Authorization & Access Control) audit, same
-- root cause class as the DB-1..DB-5 sweep above: functions defined in
-- 07_functions.sql BEFORE the ALTER DEFAULT PRIVILEGES REVOKE retain
-- PostgreSQL's default `EXECUTE TO PUBLIC` and never received an explicit
-- REVOKE/GRANT pair in this file.
--
-- PHASE5-1 (BLOCKER): soft_delete_user(uuid, uuid)
--   SECURITY DEFINER, NO body guard, NO grant management, and ZERO callers
--   anywhere in apps/admin/, supabase/functions/, or the student app
--   (grep-verified 2026-09-21). It soft-deletes a user AND cascades
--   enrollment revocation, progress deletion, role deletion, and session
--   revocation — anonymously invocable via POST /rest/v1/rpc/soft_delete_user
--   against ANY (p_user_id, p_tenant_id) pair. Locked to service_role only
--   (DB-1/DB-2 pattern: no legitimate client caller exists; when GDPR
--   deletion is eventually wired up, it must go through a service-role or
--   body-guarded path).
REVOKE ALL ON FUNCTION public.soft_delete_user(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_user(uuid, uuid)
  TO service_role;

-- PHASE5-2 (MEDIUM): anon-reachability sweep for body-guarded SECURITY
-- DEFINER functions that still carried default PUBLIC EXECUTE.
-- Every function below fails closed for anon via its own body guard (or is
-- a self-scoped helper), so this is least-privilege hardening rather than a
-- live exploit — but anonymous reachability contradicts the file's
-- least-privilege model, and two of them (user_has_permission,
-- has_course_access) double as arbitrary-argument oracles for a caller who
-- knows their signatures. Each is re-granted to authenticated + service_role
-- so every legitimate caller (dashboard browser client, edge functions,
-- RLS policy evaluation of has_course_access/user_has_permission inside
-- policies applied to authenticated sessions) keeps working; only PUBLIC
-- and anon lose EXECUTE. Signatures verified against 07_functions.sql.
--
--   Course/lesson/progress readers (students fail closed inside the body):
REVOKE EXECUTE ON FUNCTION public.get_course_outline(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_outline(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_course_lessons_with_access(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_lessons_with_access(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_enrolled_courses()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_enrolled_courses()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_recent_courses()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_recent_courses()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_resume_lesson()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_resume_lesson()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_course_progress_summary(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_progress_summary(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.search_courses_ranked(text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_courses_ranked(text, uuid, integer)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_course_access(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_course_access(uuid, uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_course_access(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_course_access(uuid)
  TO authenticated, service_role;

--   Permission/identity helpers (needed by RLS policy evaluation for
--   authenticated sessions; anon evaluation is now impossible by policy
--   CASE-wrapping — see settings_select in 09_rls.sql):
REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text, uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_user_valid_cached(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_valid_cached(uuid, uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_user_tenant_id()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_tenant_id()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public._get_tenant_fallback()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._get_tenant_fallback()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_token_version(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_token_version(uuid)
  TO authenticated, service_role;

--   Settings:
REVOKE EXECUTE ON FUNCTION public.get_setting(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_setting(text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_setting(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_valid_constant_values(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_valid_constant_values(text)
  TO authenticated, service_role;

--   Notifications:
REVOKE EXECUTE ON FUNCTION public.send_notification(text, text, text, text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification(text, text, text, text, uuid[])
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.send_notification(text, text, text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification(text, text, text, uuid[])
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_notification(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_notification(uuid)
  TO authenticated, service_role;

--   Admin/teacher enrollment & moderation (body-guarded):
REVOKE EXECUTE ON FUNCTION public.enroll_student(uuid, uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_student(uuid, uuid, timestamptz)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_enrollment(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_enrollment(uuid, uuid, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.issue_warning(uuid, text, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_warning(uuid, text, integer, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reorder_course_sections(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_course_sections(uuid, uuid[])
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reorder_section_lessons(uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_section_lessons(uuid, uuid[])
  TO authenticated, service_role;

--   Admin analytics/users/jobs (body-guarded; dashboard browser client is
--   `authenticated`, so authenticated EXECUTE must stay):
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_users_paginated(text, uuid, text, text, text, integer, timestamptz, timestamptz, integer, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_users_paginated(text, uuid, text, text, text, integer, timestamptz, timestamptz, integer, integer, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_stats_summary(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_stats_summary(uuid, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity(uuid, integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_activity(uuid, integer, text, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_student_progress_timeline(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_progress_timeline(uuid, uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_system_health()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_health()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.verify_audit_chain(bigint, int)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(bigint, int)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.flush_activity_logs(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flush_activity_logs(integer)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.release_stale_job_locks()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_stale_job_locks()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_get_jobs(int, int, text, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_jobs(int, int, text, text, timestamptz)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_get_job_counts()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_job_counts()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_get_job(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_job(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_retry_job(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_job(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_job(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_job(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_enqueue_bulk_job(text, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_bulk_job(text, jsonb, uuid)
  TO authenticated, service_role;

--   PII normalization helper (body-scoped, no direct client caller):
REVOKE EXECUTE ON FUNCTION public.normalize_email(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_email(text)
  TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX (2026-09-21) — Phase 6 (Database/RLS) EXECUTE grant sweep
-- ═════════════════════════════════════════════════════════════════════════════
-- Cross-check of every public-schema function defined in 07_functions.sql
-- against this file found the following functions still carrying PostgreSQL's
-- default EXECUTE TO PUBLIC: they are defined BEFORE the ALTER DEFAULT
-- PRIVILEGES REVOKE and never received an explicit REVOKE/GRANT pair. The
-- production database was hardened out-of-band (no public-schema function in
-- production carries PUBLIC/anon EXECUTE — verified live 2026-09-21), so
-- source and production had drifted; this block closes the source-side gap so
-- a fresh deployment matches the hardened production state instead of
-- reopening it. Three groups:
--
--   1. service_role-only worker RPCs (bodies already fail closed for every
--      other role; grant hygiene makes the grant layer agree):
REVOKE ALL ON FUNCTION public.worker_update_bulk_job(uuid, text, text, timestamptz, boolean, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_update_bulk_job(uuid, text, text, timestamptz, boolean, jsonb, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.worker_fail_bulk_job(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_fail_bulk_job(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.worker_issue_warning(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_issue_warning(uuid, uuid, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.worker_reset_user_device(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_reset_user_device(uuid, uuid)
  TO service_role;

--   2. body-guarded user-facing helpers (reachable by authenticated callers
--      only; all fail closed for anon inside the body as defense-in-depth):
REVOKE ALL ON FUNCTION public.reset_user_device(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_device(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.increment_warning_count(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_warning_count(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rebuild_permission_cache(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_permission_cache(uuid, uuid)
  TO authenticated, service_role;

-- (public.get_course_stats(uuid) was removed with its redundant 3-arg
-- default-args overload during Phase 6 — see 07_functions.sql. Its grant
-- pair was removed with it.)

-- PHASE 6.5 FIX (live-verification catch): the surviving 3-arg invoker
-- variant is also defined BEFORE the default-privileges REVOKE and was
-- missed by the Phase 6 sweep — production's live anon-EXECUTE listing
-- exposed it (body-guarded by reports.read, so fail-closed, but reachable
-- grant surface under this file's model). Same pair as the other
-- body-guarded helpers.
REVOKE ALL ON FUNCTION public.get_course_stats(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_stats(uuid, uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_students(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_students(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_app_open_location(double precision, double precision, double precision, text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_app_open_location(double precision, double precision, double precision, text, uuid, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.notify_enrolled_students_for_course(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_enrolled_students_for_course(uuid, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_schema_naming_conventions()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_schema_naming_conventions()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_jwt_tenant()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_jwt_tenant()
  TO authenticated, service_role;

--   3. RLS-policy helpers invoked from WITH CHECK/USING expressions of
--      authenticated policies — authenticated EXECUTE is REQUIRED for policy
--      evaluation and must not be revoked:
REVOKE ALL ON FUNCTION public.get_own_primary_role()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_primary_role()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_current_user_admin_lite()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin_lite()
  TO authenticated, service_role;

--   4. trigger functions. Trigger FIRING does not require the DML user to
--      hold EXECUTE (verified live: production revokes these and every
--      business flow works); the revoke exists to stop direct zero-arg RPC
--      invocation through PostgREST, which can only error or no-op but must
--      not be reachable at all:
REVOKE ALL ON FUNCTION public.set_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_user_last_location()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fanout_notification()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_access_rule_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audit_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_physical_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.terminate_sessions_on_status_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offline_entitlement_transition_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_apply_course_rating_agg()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_audit_feature_flag_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_audit_lesson_state_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_cascade_course_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_cascade_section_deletes()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_enforce_permission_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_enforce_single_active_session()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_enrollment_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_hash_chain_activity_logs()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_increment_token_version_on_role_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_invalidate_perm_cache_on_role_permissions()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_invalidate_user_validity_cache()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_lessons_publish_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_pii_access()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_prevent_prerequisite_cycles()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_rebuild_perm_cache()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_enrollment_totals_stmt()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_touch_feature_flag_row()
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- DBSEC-010 (2026-09-23, Phase 1 security audit): normalize the public-schema
-- EXECUTE surface.
--
-- Root cause: the historical sweeps revoked FROM anon and FROM authenticated
-- but not always FROM PUBLIC. PostgreSQL grants EXECUTE to PUBLIC by default,
-- and anon inherits every PUBLIC privilege, so any function whose sweep
-- missed the PUBLIC entry (e.g. worker_terminate_user_sessions, the control-
-- plane RPCs, the trigger functions whose revokes predate the convention)
-- stayed invokable by anon through PUBLIC membership. VALIDATION.sql check
-- 47 ("Phase 6 EXECUTE sweep") flags exactly this class, and the live
-- project's proacl still carries `=X/postgres` entries for those functions.
--
-- The single statement below clears PUBLIC EXECUTE for the whole schema
-- (future functions are already covered by the ALTER DEFAULT PRIVILEGES
-- block at the top of this file). Everything that legitimately needs it is
-- re-granted explicitly right after:
--   * the seven pre-login RPCs (anon surface, mirrored from the grants
--     above),
--   * the helpers evaluated inside `TO public` policies, which anon must be
--     able to EXECUTE for RLS evaluation of settings_kv/rate_limits rows.
-- Trigger-invoked functions need no EXECUTE grants (trigger firing is not a
-- privilege check); service_role/authenticated keep their explicit grants
-- from the sections above. is_current_user_super_admin_lite() previously
-- relied on PUBLIC for its authenticated policy evaluation
-- (sessions_admin_all / devices_admin_all) and gains an explicit grant here.
--
-- Verified against the disposable PostgreSQL 17 run of VALIDATION.sql.
-- ============================================================================
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Intended anon (pre-login) RPC surface
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon;
GRANT EXECUTE ON FUNCTION public.get_constant(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_default_region_id() TO anon;
GRANT EXECUTE ON FUNCTION public.system_tenant_id() TO anon;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO anon;
GRANT EXECUTE ON FUNCTION public.immutable_tsvector(text) TO anon;
GRANT EXECUTE ON FUNCTION public.report_security_incident(text, text, text, boolean, text, text, text, jsonb) TO anon;

-- NOTE: intentionally NOT granted to anon. Functions inside RLS policy
-- expressions are ACL-checked when the policy expression is planned with the
-- calling role — production evidence: the pre-login settings_kv read raised
-- "permission denied for function user_has_permission" for anon even though
-- the CASE branch anon takes never calls it. See DBSEC-011 in 09_rls.sql for
-- the policy split that resolves this without opening a permission-probing
-- oracle for arbitrary user ids.

-- Policy helpers that relied on PUBLIC for authenticated evaluation
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin_lite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin_lite() TO service_role;
