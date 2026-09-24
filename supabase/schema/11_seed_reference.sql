-- ============================================================================
-- Canonical Seed Reference Data — EduZone v13
-- PRODUCTION BOOTSTRAP: reference/config data + the single bootstrap
-- super_admin. Pure QA/demo data lives in 12_seed_qa_demo.sql (opt-in).
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 0 (pre-bootstrap): Provision the PII encryption key in Supabase Vault
-- ============================================================================
-- private.get_kms_key() (07_functions.sql) fails closed: it raises unless a
-- Vault secret named 'eduzone_kms_key' already exists, and every insert or
-- update on public.users runs through the email/phone hardening trigger that
-- calls it. This whole file is one transaction (BEGIN ... COMMIT below), so
-- without this the very first public.users write in PHASE 4 aborts the
-- entire seed and silently rolls back everything already inserted above it
-- (tenants, roles, auth.users, auth.identities, ...) -- which is exactly why
-- QA logins fail with "Invalid email or password" no matter what the
-- password hash is: no rows ever survive the COMMIT.
--
-- This inserts a fixed, non-secret placeholder key -- fine for throwaway
-- local/CI databases only. It is intentionally guarded (IF NOT EXISTS) and a
-- no-op wherever a real key has already been provisioned out-of-band, so it
-- never overwrites a genuine production secret; production/staging projects
-- must still provision their own value before their first deploy, exactly
-- as private.get_kms_key()'s own comment already requires.
--
-- Nothing in this repo's own migrations ever runs `CREATE EXTENSION
-- supabase_vault` (checked: no occurrence anywhere under supabase/schema/).
-- The block below used to only check `pg_namespace` for a pre-existing
-- `vault` schema and silently do nothing if it wasn't there yet -- on a
-- fresh `supabase db reset` (local/CI) that check is false, so the secret
-- was never created, get_kms_key() then raised on the first PHASE 4 write,
-- and the whole transaction (including every auth.users/auth.identities
-- row inserted above) rolled back -- reproducing the exact "Invalid email
-- or password" QA-login failure this phase was meant to fix. Enabling the
-- extension explicitly first closes that gap; `IF NOT EXISTS` makes it a
-- no-op everywhere it's already enabled (including hosted projects, where
-- Vault must live in a schema literally named `vault` per Supabase's own
-- docs, so this is safe there too).
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'eduzone_kms_key'
  )
  THEN
    PERFORM vault.create_secret(
      'qa-ci-local-dev-only-placeholder-key-do-not-use-in-prod-32b',
      'eduzone_kms_key',
      'QA/CI/local-dev-only PII key, auto-provisioned by 11_seed_reference.sql'
    );
  END IF;
END;
$$;

-- ============================================================================
-- PHASE 0A: System Tenant & Roles (REQUIRED SYSTEM BOOTSTRAP)
-- ============================================================================

INSERT INTO public.tenants (
  id, slug, name, plan, status, region_id, data_residency, 
  max_users, max_courses, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system', 'System Tenant', 'enterprise', 'active',
  'me-south-1', 'me-south-1', 99999, 99999, now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (
  tenant_id, name, label, is_system, priority, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'super_admin', 'Super Admin', true, 100, now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'admin', 'Admin', true, 80, now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'teacher', 'Teacher', true, 50, now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'student', 'Student', true, 10, now(), now())
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ============================================================================
-- PHASE 0B: System Permissions & Role-Permission Mapping
-- ============================================================================

INSERT INTO public.permissions (name, resource, action, scope, created_at)
VALUES
  ('users.read', 'users', 'read', 'tenant', now()),
  ('users.write', 'users', 'write', 'tenant', now()),
  ('users.lock', 'users', 'lock', 'tenant', now()),
  ('courses.read', 'courses', 'read', 'tenant', now()),
  ('courses.write', 'courses', 'write', 'tenant', now()),
  ('courses.delete', 'courses', 'delete', 'tenant', now()),
  ('courses.manage', 'courses', 'manage', 'tenant', now()),
  ('reports.read', 'reports', 'read', 'tenant', now()),
  ('settings.read', 'settings', 'read', 'global', now()),
  ('settings.write', 'settings', 'write', 'global', now()),
  ('warnings.write', 'warnings', 'write', 'tenant', now()),
  ('devices.manage', 'devices', 'manage', 'tenant', now()),
  ('sessions.manage', 'sessions', 'manage', 'tenant', now()),
  ('audit.read', 'audit', 'read', 'global', now()),
  ('feature_flags.manage', 'features', 'manage', 'global', now()),
  ('feature_flags.tenant_manage', 'features', 'tenant_manage', 'tenant', now()),
  ('tenants.manage', 'tenants', 'manage', 'global', now()),
  ('notifications.send', 'notifications', 'send', 'tenant', now()),
  ('notifications.delete', 'notifications', 'delete', 'tenant', now()),
  ('course_announcements.send', 'notifications', 'send', 'tenant', now())
ON CONFLICT (name) DO NOTHING;

-- Super Admin gets ALL permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Admin gets all except tenant management and global feature flags management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND r.name = 'admin'
  AND p.name NOT IN ('tenants.manage', 'feature_flags.manage')
ON CONFLICT DO NOTHING;

-- Tenant admins may manage tenant-scoped overrides only; they never receive
-- the global feature_flags.manage permission.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p
  ON p.name = 'feature_flags.tenant_manage'
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Defensive cleanup in case a previous seed granted global Feature Flag
-- management to the admin role.
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND r.name = 'admin'
  AND p.name = 'feature_flags.manage';

-- Teacher gets course + warning + reports + notifications
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND r.name = 'teacher'
  AND p.name IN (
    'courses.read', 'courses.write', 'courses.manage', 
    'users.read', 'warnings.write', 'reports.read',
    'notifications.send', 'notifications.delete',
    'course_announcements.send'
  )
ON CONFLICT DO NOTHING;

-- Student gets read permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND r.name = 'student'
  AND p.name IN ('courses.read', 'reports.read')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PHASE 0C: System Definitions, Constants, Regions & Global Settings
-- ============================================================================

INSERT INTO public.setting_definitions (key, expected_type, is_nullable) VALUES
  ('maintenance_mode', 'boolean', false),
  ('site_name', 'string', false)
ON CONFLICT DO NOTHING;

INSERT INTO public.constants (id, category, description, valid_values) VALUES
  ('REGION_ME_SOUTH_1', 'region', 'Middle East (Bahrain)', ARRAY['me-south-1']),
  ('REGION_EU_WEST_1', 'region', 'Europe (Ireland)', ARRAY['eu-west-1']),
  ('REGION_US_EAST_1', 'region', 'US East (Virginia)', ARRAY['us-east-1']),
  ('JOB_STATUS_PENDING', 'job_status', 'Job pending execution', ARRAY['pending']),
  ('JOB_STATUS_IN_PROGRESS', 'job_status', 'Job in progress', ARRAY['in_progress']),
  ('JOB_STATUS_DONE', 'job_status', 'Job completed', ARRAY['done']),
  ('JOB_STATUS_DEAD', 'job_status', 'Job failed permanently', ARRAY['dead']),
  ('FEATURE_REQUIRE_EMAIL_VERIFICATION', 'feature_flag', 'Require email verification', ARRAY['require_email_verification']),
  ('FEATURE_REQUIRE_2FA', 'feature_flag', 'Require 2FA for admin accounts', ARRAY['require_2fa']),
  ('FEATURE_MAX_LOGIN_ATTEMPTS', 'feature_flag', 'Max login attempts before lockout', ARRAY['max_login_attempts']),
  ('COURSE_STATUS_DRAFT', 'course_status', 'Course is draft', ARRAY['draft']),
  ('COURSE_STATUS_PUBLISHED', 'course_status', 'Course is published', ARRAY['published']),
  ('COURSE_STATUS_ARCHIVED', 'course_status', 'Course is archived', ARRAY['archived']),
  ('ENROLLMENT_STATUS_ACTIVE', 'enrollment_status', 'Active enrollment', ARRAY['active']),
  ('ENROLLMENT_STATUS_REVOKED', 'enrollment_status', 'Enrollment revoked', ARRAY['revoked']),
  ('ENROLLMENT_STATUS_EXPIRED', 'enrollment_status', 'Enrollment expired', ARRAY['expired']),
  ('ENROLLMENT_STATUS_COMPLETED', 'enrollment_status', 'Enrollment completed', ARRAY['completed']),
  ('ACCOUNT_STATUS_ACTIVE', 'account_status', 'Account active', ARRAY['active']),
  ('ACCOUNT_STATUS_INACTIVE', 'account_status', 'Account inactive', ARRAY['inactive']),
  ('ACCOUNT_STATUS_SUSPENDED', 'account_status', 'Account suspended', ARRAY['suspended']),
  ('ACCOUNT_STATUS_LOCKED', 'account_status', 'Account locked', ARRAY['locked']),
  ('ACCOUNT_STATUS_BANNED', 'account_status', 'Account banned', ARRAY['banned'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.regions (id, label, is_active, is_primary) VALUES
  ('me-south-1', 'Middle East (Bahrain)', true, true),
  ('eu-west-1', 'Europe (Ireland)', true, false),
  ('us-east-1', 'US East (Virginia)', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.settings_kv (key, value, category, description, is_public) VALUES
  ('app_locked', 'false'::jsonb, 'security', 'Global app lock', true),
  ('app_lock_message', '"Application is temporarily locked."'::jsonb, 'security', 'Global lock message', true),
  ('maintenance_mode', 'false'::jsonb, 'maintenance', 'Maintenance mode', true),
  ('maintenance_message', '"Application is under maintenance."'::jsonb, 'maintenance', 'Maintenance message', true),
  ('settings_cache_ttl_seconds', '300'::jsonb, 'limits', 'Settings cache TTL', false),
  ('max_devices_per_user', '1'::jsonb, 'limits', 'Maximum active devices per user', false),
  ('max_concurrent_streams', '2'::jsonb, 'limits', 'Maximum concurrent streams per student', false),
  ('content_signed_url_ttl_sec', '3600'::jsonb, 'limits', 'Content signed URL TTL', false),
  ('preview_lessons_enabled', 'true'::jsonb, 'general', 'Allow preview lessons', true),
  ('maintenance_excluded_roles', '["super_admin","admin"]'::jsonb, 'maintenance', 'Roles excluded from maintenance mode', false),
  ('maintenance_excluded_users', '[]'::jsonb, 'maintenance', 'Users excluded from maintenance mode', false),
  ('maintenance_ends_at', 'null'::jsonb, 'maintenance', 'Scheduled maintenance end time', true),
  ('max_warnings_before_action', '3'::jsonb, 'limits', 'Warnings before automatic action', false),
  ('session_timeout_minutes', '1440'::jsonb, 'limits', 'Session timeout in minutes', false),
  ('force_single_session', 'true'::jsonb, 'limits', 'Prevent multiple concurrent logins', false),
  ('log_flush_batch_size', '100'::jsonb, 'limits', 'Activity log flush batch size', false),
  ('risk_score_block_threshold', '70'::jsonb, 'security', 'Risk score threshold for blocking', false),
  ('geo_restriction_enabled', 'false'::jsonb, 'security', 'Enable geographic restrictions', false),
  ('allowed_countries', '["EG"]'::jsonb, 'security', 'Allowed country codes', false),
  ('latest_version', '"1.0.0"'::jsonb, 'general', 'Latest app version', true),
  ('min_app_version', '"1.0.0"'::jsonb, 'general', 'Minimum required app version', true),
  ('force_update', 'false'::jsonb, 'general', 'Force app update', true),
  ('update_message', '""'::jsonb, 'general', 'App update message', true),
  ('support_link', '""'::jsonb, 'general', 'Support URL', true),
  ('store_link_android', '""'::jsonb, 'general', 'Google Play Store URL', true),
  ('store_link_ios', '""'::jsonb, 'general', 'Apple App Store URL', true),
  ('follow_link', '""'::jsonb, 'general', 'Social follow URL', true),
  ('retention_deleted_user_days', '90'::jsonb, 'compliance', 'Days to keep soft-deleted user records', false),
  ('retention_activity_log_days', '365'::jsonb, 'compliance', 'Days to keep activity logs', false),
  ('retention_location_log_days', '30'::jsonb, 'compliance', 'Days to keep location logs (GDPR)', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rate_limit_rules (action, window_seconds, max_hits, block_seconds, is_active) VALUES
  ('login',          300,   5,   900,  true),
  ('api_call',       60,    120, 60,   true),
  ('video_view',     3600,  50,  0,    true),
  ('device_bind',    86400, 3,   3600, true),
  ('password_reset', 3600,  3,   7200, true),
  ('warning_issue',  3600,  20,  0,    true),
  ('content_access', 3600,  200, 0,    true),
  -- Section 12 / P6.25: volume bound for the offline-entitlement RPCs
  -- (authorize_offline_download, revalidate_offline_entitlement in
  -- 07_functions.sql). authorize is called once per lesson queued for
  -- download (bulk course downloads can queue many lessons at once);
  -- revalidate is called on every offline playback attempt while online,
  -- so its limit stays generous enough for normal play/seek/retry use.
  ('offline_download_authorize',    3600, 100, 600, true),
  ('offline_entitlement_revalidate', 300,  60, 120, true),
  -- SECURITY FIX (2026-09-12): /api/bulk-action runs heavy work inline
  -- (full user-table scans and, for 'export', storage upload + signed-URL
  -- minting) on every call. This rule backs the check_rate_limit gate the
  -- route now performs before its count query; 30/hour per user with a
  -- 10-minute block is well above any legitimate admin workflow.
  ('bulk_action',    3600,  30,  600, true)
ON CONFLICT (action) DO NOTHING;

INSERT INTO public.audit_chain_state (id, last_seq, last_hash)
VALUES (1, 0, repeat('0', 64))
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 0B: Production Bootstrap Super Admin (owner-requested, 2026-09-18)
-- ============================================================================
-- The ONE account a fresh deployment starts with, so the project is
-- administrable from the first minute. Everything else that used to live in
-- this combined seed (@eduzone-test.com QA accounts, demo tenants, demo
-- courses/lessons, notifications, devices, logs) moved to
-- 12_seed_qa_demo.sql, which deploy.js skips unless ALLOW_QA_SEED_DATA=true.
--
-- SECURITY: this account's encrypted_password is the committed seed hash
-- whose plaintext (Admin@12345) is documented in git — ROTATE IT IMMEDIATELY
-- after first login (Supabase Dashboard -> Authentication -> Users, or the
-- admin dashboard's user management). Never leave the seeded password live
-- in production.
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'super_admin@eduzone-test.com',
  '$2a$10$f5llkB8BoIoNGFRNaYOgCeomaRagQtxi2iLII5IRVloUuxH3EP8Z6',
  now(), now(), now(), 'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}', '{}',
  false, '','','',''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities
  (id, user_id, provider, identity_data, created_at, updated_at, provider_id, last_sign_in_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001', 'email',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"super_admin@eduzone-test.com"}',
  now(), now(), 'super_admin@eduzone-test.com', NULL
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Profile is re-tenanted to the SYSTEM tenant (00000000-...-0001, the only
-- tenant that exists in a fresh deployment). The old combined seed bound it
-- to the QA tenant, which would violate the tenants FK in production.
INSERT INTO public.users (id, email, first_name, last_name, primary_role, tenant_id, account_status, token_version, region_id)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'super_admin@eduzone-test.com', 'Super', 'Admin', 'super_admin',
  '00000000-0000-0000-0000-000000000001', 'active', 1, 'me-south-1'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id, tenant_id)
SELECT u.id, r.id, u.tenant_id
FROM public.users u
JOIN public.roles r
  ON r.name = u.primary_role
  AND r.tenant_id = public.system_tenant_id()
WHERE u.id = 'aaaaaaaa-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

COMMIT;
