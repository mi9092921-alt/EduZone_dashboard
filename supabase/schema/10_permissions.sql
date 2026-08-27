-- ============================================================================
-- Function & Object Permissions (Security Hardened)
-- ============================================================================
-- Source of truth: ../../Eduzone_schema_v13.sql (schema) + hardening_patch.sql
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

GRANT USAGE ON SCHEMA private TO service_role;

GRANT USAGE ON SCHEMA audit TO service_role;

GRANT USAGE ON SCHEMA internal TO service_role;

GRANT USAGE ON SCHEMA maintenance TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA maintenance FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.vw_course_stats TO authenticated, anon, service_role;

-- ============================================================================
-- Table & View DML Grants
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA internal FROM PUBLIC, anon, authenticated;

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
GRANT SELECT ON public.settings_kv, public.settings_cache, public.security_settings TO authenticated, service_role;
-- Feature-flag tables are granted below, in the dedicated "Feature Flags —
-- least-privilege grants" section, which resets privileges with REVOKE ALL
-- before re-granting; that is the canonical definition for these 4 tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses, public.course_prerequisites, public.course_learning_objectives, public.sections, public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_contents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT INSERT ON public.security_incidents TO authenticated;
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

REVOKE EXECUTE ON FUNCTION public.check_user_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_user_access() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.assert_tenant() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;

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

-- 3. ADMIN ONLY - Revoked from anon AND authenticated; granted to service_role only
REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO service_role;

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

REVOKE EXECUTE ON FUNCTION public.dequeue_job(text, text[], integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dequeue_job(text, text[], integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dequeue_job(text, text[], integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_primary_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_primary_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_primary_role() TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_settings_cache() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_settings_cache() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_settings_cache() TO service_role;

REVOKE EXECUTE ON FUNCTION public.terminate_user_sessions(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.terminate_user_sessions(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_user_sessions(uuid, text) TO service_role;
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

-- decrypt_pii/dequeue_job/encrypt_pii are already granted to service_role above
-- (see "4. INTERNAL ONLY"); only the two worker_* grants below are new here.
GRANT EXECUTE ON FUNCTION public.worker_control_user_account(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.worker_terminate_user_sessions(uuid, uuid, text) TO service_role;

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
