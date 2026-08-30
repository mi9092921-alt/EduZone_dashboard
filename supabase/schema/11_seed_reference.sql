-- ============================================================================
-- Canonical Seed Reference Data — EduZone v13
-- Consolidated System Bootstrap & QA Seed Data
-- ============================================================================

BEGIN;

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
  ('notifications.delete', 'notifications', 'delete', 'tenant', now())
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
    'notifications.send', 'notifications.delete'
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
  ('offline_entitlement_revalidate', 300,  60, 120, true)
ON CONFLICT (action) DO NOTHING;

INSERT INTO public.audit_chain_state (id, last_seq, last_hash)
VALUES (1, 0, repeat('0', 64))
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 1: Auth Users (auth schema — Supabase Auth)
-- ============================================================================

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES
  -- Super Admin
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'super_admin@eduzone-test.com',
   '$2b$10$wTaFvwDLLbjqXHD7oIv7BuJnlBMTm5z.pWzYFPxcYDpudyynCygnC',
   now(), now(), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{}',
   false, '','','',''),

  -- Admin
  ('aaaaaaaa-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'admin@eduzone-test.com',
   '$2b$10$wi8xDSzZTQDP5QDVEOHRrOnqX5Bj39ODhy9pe3Ie6AMiuvFqj6yCK',
   now(), now(), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{}',
   false, '','','',''),

  -- Teacher
  ('aaaaaaaa-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'teacher@eduzone-test.com',
   '$2b$10$7opT0.uTD98DJbJG4xiT4uom0y7/nv3WeLDLwTeM6.mIQMVbZYlky',
   now(), now(), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{}',
   false, '','','',''),

  -- Student
  ('aaaaaaaa-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000000',
   'student@eduzone-test.com',
   '$2b$10$avfqgi31QRl7CmQ6vSELhOjKVvctuFpiqs7GwI3tOiq1JmRt0A..y',
   now(), now(), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{}',
   false, '','','',''),

  -- Student 2 (locked account)
  ('aaaaaaaa-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000000',
   'student2@eduzone-test.com',
   '$2b$10$xo6BhE0HiCNyGeYRcVH/nOXBZ4PfyP9dtiSn6GwQlo5I8wcFH5E9y',
   now(), now(), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{}',
   false, '','','',''),

  -- Test tenant admin  
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000',
   'admin@test.eduzone.local',
   '$2b$10$wi8xDSzZTQDP5QDVEOHRrOnqX5Bj39ODhy9pe3Ie6AMiuvFqj6yCK',
   now(), now(), now(), 'authenticated', 'authenticated',
   '{"provider":"email","providers":["email"]}', '{}',
   false, '','','','')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 2: Auth Identities
-- ============================================================================

INSERT INTO auth.identities
  (id, user_id, provider, identity_data, created_at, updated_at, provider_id, last_sign_in_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'email',
   '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"super_admin@eduzone-test.com"}',
   now(), now(), 'super_admin@eduzone-test.com', NULL),

  ('aaaaaaaa-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002', 'email',
   '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","email":"admin@eduzone-test.com"}',
   now(), now(), 'admin@eduzone-test.com', NULL),

  ('aaaaaaaa-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000003', 'email',
   '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","email":"teacher@eduzone-test.com"}',
   now(), now(), 'teacher@eduzone-test.com', NULL),

  ('aaaaaaaa-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000004', 'email',
   '{"sub":"aaaaaaaa-0000-0000-0000-000000000004","email":"student@eduzone-test.com"}',
   now(), now(), 'student@eduzone-test.com', NULL),

  ('aaaaaaaa-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000005', 'email',
   '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","email":"student2@eduzone-test.com"}',
   now(), now(), 'student2@eduzone-test.com', NULL),

  ('22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'email',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@test.eduzone.local"}',
   now(), now(), 'admin@test.eduzone.local', NULL)

ON CONFLICT (provider, provider_id) DO NOTHING;

-- ============================================================================
-- PHASE 3: Tenants
-- ============================================================================
-- Note: System Tenant (00000000-...-0001) is created in seed/00_system_seed_helper.sql

INSERT INTO public.tenants (id, slug, name, plan, status, region_id, data_residency, max_users, max_courses)
VALUES
  -- Main QA tenant
  ('11111111-0000-0000-0000-000000000001',
   'eduzone-qa', 'EduZone QA Tenant', 'pro', 'active', 'me-south-1', 'me-south-1', 500, 100),

  -- Demo tenant (starter plan)
  ('11111111-0000-0000-0000-000000000002',
   'demo-school', 'Demo School', 'starter', 'active', 'me-south-1', 'me-south-1', 100, 20),

  -- Test tenant (for integration tests)
  ('11111111-1111-1111-1111-111111111111',
   'test-tenant-001', 'Test Tenant', 'enterprise', 'active', 'me-south-1', 'me-south-1', 99999, 99999)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 4: Public User Profiles
-- ============================================================================

INSERT INTO public.users (id, email, first_name, last_name, primary_role, tenant_id, account_status, token_version, region_id)
VALUES
  -- EduZone QA Tenant users
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'super_admin@eduzone-test.com', 'Super', 'Admin', 'super_admin',
   '11111111-0000-0000-0000-000000000001', 'active', 1, 'me-south-1'),

  ('aaaaaaaa-0000-0000-0000-000000000002',
   'admin@eduzone-test.com', 'Ali', 'Hassan', 'admin',
   '11111111-0000-0000-0000-000000000001', 'active', 1, 'me-south-1'),

  ('aaaaaaaa-0000-0000-0000-000000000003',
   'teacher@eduzone-test.com', 'Sara', 'Mohamed', 'teacher',
   '11111111-0000-0000-0000-000000000001', 'active', 1, 'me-south-1'),

  ('aaaaaaaa-0000-0000-0000-000000000004',
   'student@eduzone-test.com', 'Omar', 'Abdullah', 'student',
   '11111111-0000-0000-0000-000000000001', 'active', 1, 'me-south-1'),

  ('aaaaaaaa-0000-0000-0000-000000000005',
   'student2@eduzone-test.com', 'Lina', 'Khalid', 'student',
   '11111111-0000-0000-0000-000000000001', 'locked', 1, 'me-south-1'),

  -- Test Tenant user
  ('22222222-2222-2222-2222-222222222222',
   'admin@test.eduzone.local', 'Test', 'Admin', 'admin',
   '11111111-1111-1111-1111-111111111111', 'active', 1, 'me-south-1')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 5: User Role Assignments
-- ============================================================================

INSERT INTO public.user_roles (user_id, role_id, tenant_id)
SELECT u.id, r.id, u.tenant_id
FROM public.users u
JOIN public.roles r
  ON r.name = u.primary_role
  AND r.tenant_id = public.system_tenant_id()
WHERE u.id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004',
  'aaaaaaaa-0000-0000-0000-000000000005',
  '22222222-2222-2222-2222-222222222222'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PHASE 6: Courses
-- ============================================================================

INSERT INTO public.courses (id, tenant_id, title, slug, description, status, level, price, teacher_id, region_id)
VALUES
  -- EduZone QA Tenant courses
  ('cccccccc-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Introduction to React', 'intro-react',
   'Learn React basics, hooks, state management, and modern frontend development.',
   'published', 'beginner', 0,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'Advanced TypeScript', 'adv-typescript',
   'Deep dive into TypeScript generics, utility types, and type-safe architectures.',
   'published', 'advanced', 99.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000001',
   'Database Design Principles', 'db-design',
   'Relational and NoSQL database modeling, normalization, indexing, and performance tuning.',
   'published', 'intermediate', 79.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000001',
   'UI/UX Fundamentals', 'uiux-fundamentals',
   'Design thinking, wireframing, color psychology, and Figma prototyping.',
   'published', 'beginner', 0,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000001',
   'Cloud Architecture with AWS', 'aws-cloud',
   'AWS services for production systems, serverless, VPC, and auto-scaling.',
   'published', 'advanced', 149.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000006',
   '11111111-0000-0000-0000-000000000001',
   'Flutter & Dart Mobile App Mastery', 'flutter-mobile-mastery',
   'Build high-performance cross-platform iOS and Android apps with Flutter 3 and Riverpod.',
   'published', 'intermediate', 49.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000007',
   '11111111-0000-0000-0000-000000000001',
   'Python for Data Science & AI', 'python-data-science-ai',
   'Python programming, NumPy, Pandas, data visualization, and foundational Machine Learning models.',
   'published', 'beginner', 0,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000008',
   '11111111-0000-0000-0000-000000000001',
   'Full-Stack Web Development with Next.js', 'nextjs-fullstack-dev',
   'Master modern web development with Next.js App Router, Server Actions, Tailwind CSS, and PostgreSQL.',
   'published', 'intermediate', 89.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000009',
   '11111111-0000-0000-0000-000000000001',
   'Cybersecurity & Network Defense', 'cybersecurity-defense',
   'Network security, threat modeling, ethical hacking fundamentals, and vulnerability remediation.',
   'published', 'intermediate', 119.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000010',
   '11111111-0000-0000-0000-000000000001',
   'Data Structures & Algorithms in Practice', 'dsa-algorithms',
   'Master Big-O analysis, trees, dynamic programming, and algorithm problem solving.',
   'published', 'advanced', 69.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000011',
   '11111111-0000-0000-0000-000000000001',
   'DevOps, Docker & Kubernetes Bootcamp', 'devops-docker-kubernetes',
   'Containerization with Docker, Kubernetes cluster orchestration, and CI/CD pipelines.',
   'published', 'advanced', 129.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  ('cccccccc-0000-0000-0000-000000000012',
   '11111111-0000-0000-0000-000000000001',
   'Modern Figma & Product Design', 'modern-figma-design',
   'Figma design systems, auto-layout, interactive prototypes, and UX usability testing.',
   'published', 'beginner', 39.99,
   'aaaaaaaa-0000-0000-0000-000000000003', 'me-south-1'),

  -- Test Tenant course (integration testing)
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Test Course: Introduction to PostgreSQL', 'test-course-postgres-101',
   'Seeded test course for database verification.',
   'published', 'beginner', 0,
   '22222222-2222-2222-2222-222222222222', 'me-south-1')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 7: Course Prerequisites
-- ============================================================================

INSERT INTO public.course_prerequisites (course_id, prerequisite_course_id, tenant_id)
VALUES
  -- AWS course requires TypeScript
  ('cccccccc-0000-0000-0000-000000000005',
   'cccccccc-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001'),

  -- Flutter course requires TypeScript
  ('cccccccc-0000-0000-0000-000000000006',
   'cccccccc-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001'),

  -- Next.js course requires React
  ('cccccccc-0000-0000-0000-000000000008',
   'cccccccc-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001'),

  -- DSA course requires TypeScript
  ('cccccccc-0000-0000-0000-000000000010',
   'cccccccc-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001'),

  -- DevOps course requires AWS
  ('cccccccc-0000-0000-0000-000000000011',
   'cccccccc-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000001')

ON CONFLICT (course_id, prerequisite_course_id) DO NOTHING;

-- ============================================================================
-- PHASE 8: Course Learning Objectives
-- ============================================================================

INSERT INTO public.course_learning_objectives (id, course_id, objective, order_index)
VALUES
  -- React (Existing IDs 1, 2)
  ('e0e0e0e0-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Understand React components and hooks', 0),
  ('e0e0e0e0-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Build interactive React applications', 1),

  -- TypeScript (Existing ID 3 + New ID 6)
  ('e0e0e0e0-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', 'Master TypeScript generics and advanced types', 0),
  ('e0e0e0e0-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000002', 'Implement type-safe architectures and utility types', 1),

  -- AWS Cloud (Existing IDs 4, 5)
  ('e0e0e0e0-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000005', 'Design scalable cloud architectures', 0),
  ('e0e0e0e0-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000005', 'Implement AWS best practices', 1),

  -- Database Design
  ('e0e0e0e0-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000003', 'Design normalized relational schemas (3NF/BCNF)', 0),
  ('e0e0e0e0-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000003', 'Optimize query plans and indexing strategies', 1),

  -- UI/UX Fundamentals
  ('e0e0e0e0-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000004', 'Apply user-centered design methodologies and heuristics', 0),
  ('e0e0e0e0-0000-0000-0000-000000000010', 'cccccccc-0000-0000-0000-000000000004', 'Create wireframes and user journey maps', 1),

  -- Flutter
  ('e0e0e0e0-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000006', 'Master Flutter widget hierarchy and reactive layouts', 0),
  ('e0e0e0e0-0000-0000-0000-000000000012', 'cccccccc-0000-0000-0000-000000000006', 'Implement state management using Riverpod 2.x and clean architecture', 1),

  -- Python Data Science
  ('e0e0e0e0-0000-0000-0000-000000000013', 'cccccccc-0000-0000-0000-000000000007', 'Manipulate and analyze complex tabular datasets with Pandas', 0),
  ('e0e0e0e0-0000-0000-0000-000000000014', 'cccccccc-0000-0000-0000-000000000007', 'Build exploratory data visualizations with Matplotlib and Seaborn', 1),

  -- Next.js
  ('e0e0e0e0-0000-0000-0000-000000000015', 'cccccccc-0000-0000-0000-000000000008', 'Build production apps using Next.js App Router and Server Components', 0),
  ('e0e0e0e0-0000-0000-0000-000000000016', 'cccccccc-0000-0000-0000-000000000008', 'Handle full-stack mutations with Server Actions and PostgreSQL', 1),

  -- Cybersecurity
  ('e0e0e0e0-0000-0000-0000-000000000017', 'cccccccc-0000-0000-0000-000000000009', 'Identify and remediate OWASP Top 10 web vulnerabilities', 0),
  ('e0e0e0e0-0000-0000-0000-000000000018', 'cccccccc-0000-0000-0000-000000000009', 'Implement defensive networking, encryption, and system hardening', 1),

  -- DSA
  ('e0e0e0e0-0000-0000-0000-000000000019', 'cccccccc-0000-0000-0000-000000000010', 'Analyze asymptotic time and space complexity with Big-O notation', 0),
  ('e0e0e0e0-0000-0000-0000-000000000020', 'cccccccc-0000-0000-0000-000000000010', 'Solve dynamic programming and graph traversal problems with confidence', 1),

  -- DevOps
  ('e0e0e0e0-0000-0000-0000-000000000021', 'cccccccc-0000-0000-0000-000000000011', 'Containerize microservices using production-grade Dockerfiles', 0),
  ('e0e0e0e0-0000-0000-0000-000000000022', 'cccccccc-0000-0000-0000-000000000011', 'Orchestrate deployments, services, and ingress with Kubernetes', 1),

  -- Modern Figma
  ('e0e0e0e0-0000-0000-0000-000000000023', 'cccccccc-0000-0000-0000-000000000012', 'Design scalable UI components with Auto-Layout and design tokens', 0),
  ('e0e0e0e0-0000-0000-0000-000000000024', 'cccccccc-0000-0000-0000-000000000012', 'Build interactive prototypes with fluid animations and transitions', 1)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 9: Sections
-- ============================================================================

INSERT INTO public.sections (id, course_id, tenant_id, title, order_index, is_published)
VALUES
  -- React course sections (Course 1)
  ('55555555-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Getting Started with React', 0, true),

  ('55555555-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Core Concepts & Hooks', 1, true),

  -- TypeScript course sections (Course 2)
  ('55555555-0000-0000-0000-000000000003',
   'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'TypeScript Fundamentals', 0, true),

  ('55555555-0000-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Advanced Types & Generics', 1, true),

  -- Database Design course sections (Course 3)
  ('55555555-0000-0000-0000-000000000005',
   'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Relational Database Modeling', 0, true),

  ('55555555-0000-0000-0000-000000000006',
   'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Indexing & Query Optimization', 1, true),

  -- UI/UX Fundamentals course sections (Course 4)
  ('55555555-0000-0000-0000-000000000007',
   'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Design Thinking & UX Foundations', 0, true),

  ('55555555-0000-0000-0000-000000000008',
   'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Wireframing & Visual Design', 1, true),

  -- AWS Cloud course sections (Course 5)
  ('55555555-0000-0000-0000-000000000009',
   'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'AWS Core Infrastructure & Compute', 0, true),

  ('55555555-0000-0000-0000-000000000010',
   'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Serverless, VPC & Scalability', 1, true),

  -- Flutter course sections (Course 6)
  ('55555555-0000-0000-0000-000000000011',
   'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Flutter Widgets & UI Layouts', 0, true),

  ('55555555-0000-0000-0000-000000000012',
   'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Riverpod State Management & Architecture', 1, true),

  -- Python Data Science course sections (Course 7)
  ('55555555-0000-0000-0000-000000000013',
   'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Python & NumPy Fundamentals', 0, true),

  ('55555555-0000-0000-0000-000000000014',
   'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Data Wrangling with Pandas & Visualizations', 1, true),

  -- Next.js course sections (Course 8)
  ('55555555-0000-0000-0000-000000000015',
   'cccccccc-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'Next.js App Router & Server Components', 0, true),

  ('55555555-0000-0000-0000-000000000016',
   'cccccccc-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'Server Actions & Database Integrations', 1, true),

  -- Cybersecurity course sections (Course 9)
  ('55555555-0000-0000-0000-000000000017',
   'cccccccc-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'Network Security & Cryptography', 0, true),

  ('55555555-0000-0000-0000-000000000018',
   'cccccccc-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'Vulnerability Defense & Hardening', 1, true),

  -- DSA course sections (Course 10)
  ('55555555-0000-0000-0000-000000000019',
   'cccccccc-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'Linear & Tree Data Structures', 0, true),

  ('55555555-0000-0000-0000-000000000020',
   'cccccccc-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'Graph Algorithms & Dynamic Programming', 1, true),

  -- DevOps course sections (Course 11)
  ('55555555-0000-0000-0000-000000000021',
   'cccccccc-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'Docker Containerization Fundamentals', 0, true),

  ('55555555-0000-0000-0000-000000000022',
   'cccccccc-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'Kubernetes Orchestration & CI/CD Pipelines', 1, true),

  -- Modern Figma course sections (Course 12)
  ('55555555-0000-0000-0000-000000000023',
   'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'Figma UI Design & Auto-Layout', 0, true),

  ('55555555-0000-0000-0000-000000000024',
   'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'Design Systems & Interactive Prototypes', 1, true),

  -- Test tenant section
  ('55555555-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Postgres Basics', 0, true)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 10: Lessons
-- ============================================================================

INSERT INTO public.lessons (id, section_id, course_id, tenant_id, title, order_index, is_published, is_preview, duration_sec)
VALUES
  -- Course 1: React — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '55555555-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'What is React?', 0, true, true, 300),

  ('bbbbbbbb-0000-0000-0000-000000000002',
   '55555555-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Setting Up Your Environment', 1, true, false, 480),

  -- Course 1: React — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000003',
   '55555555-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Components, Props & State', 0, true, false, 620),

  ('bbbbbbbb-0000-0000-0000-000000000006',
   '55555555-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Mastering useEffect & Custom Hooks', 1, true, false, 750),

  -- Course 2: TypeScript — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000004',
   '55555555-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'TypeScript Basics & Type Annotations', 0, true, true, 540),

  ('bbbbbbbb-0000-0000-0000-000000000005',
   '55555555-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Generics Deep Dive', 1, true, false, 900),

  -- Course 2: TypeScript — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000007',
   '55555555-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Interfaces, Type Aliases & Unions', 0, true, false, 660),

  ('bbbbbbbb-0000-0000-0000-000000000008',
   '55555555-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Conditional Types & Utility Types', 1, true, false, 820),

  -- Course 3: Database Design — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000009',
   '55555555-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Relational Modeling & Normalization', 0, true, true, 580),

  ('bbbbbbbb-0000-0000-0000-000000000010',
   '55555555-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Foreign Keys, Cascades & Integrity', 1, true, false, 640),

  -- Course 3: Database Design — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000011',
   '55555555-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'B-Tree, Hash, and GIN Indexing Strategies', 0, true, false, 840),

  ('bbbbbbbb-0000-0000-0000-000000000012',
   '55555555-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Query Optimization & Execution Plans', 1, true, false, 790),

  -- Course 4: UI/UX Fundamentals — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000013',
   '55555555-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Introduction to User Experience (UX)', 0, true, true, 420),

  ('bbbbbbbb-0000-0000-0000-000000000014',
   '55555555-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'User Research & Personas', 1, true, false, 510),

  -- Course 4: UI/UX Fundamentals — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000015',
   '55555555-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Low-Fidelity Wireframes in Figma', 0, true, false, 680),

  ('bbbbbbbb-0000-0000-0000-000000000016',
   '55555555-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Visual Hierarchy & Typography', 1, true, false, 600),

  -- Course 5: Cloud Architecture AWS — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000017',
   '55555555-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'EC2, S3 & Cloud Storage Essentials', 0, true, true, 550),

  ('bbbbbbbb-0000-0000-0000-000000000018',
   '55555555-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Virtual Private Cloud (VPC) & Subnets', 1, true, false, 720),

  -- Course 5: Cloud Architecture AWS — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000019',
   '55555555-0000-0000-0000-000000000010', 'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'AWS Lambda & Serverless Microservices', 0, true, false, 810),

  ('bbbbbbbb-0000-0000-0000-000000000020',
   '55555555-0000-0000-0000-000000000010', 'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Auto-Scaling & Load Balancing', 1, true, false, 870),

  -- Course 6: Flutter & Dart — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000021',
   '55555555-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Flutter 3 Architecture & Widget Tree', 0, true, true, 480),

  ('bbbbbbbb-0000-0000-0000-000000000022',
   '55555555-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Responsive & Adaptive Layouts', 1, true, false, 690),

  -- Course 6: Flutter & Dart — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000023',
   '55555555-0000-0000-0000-000000000012', 'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'State Management with Riverpod 2.x', 0, true, false, 960),

  ('bbbbbbbb-0000-0000-0000-000000000024',
   '55555555-0000-0000-0000-000000000012', 'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Clean Architecture & Supabase Integration', 1, true, false, 1100),

  -- Course 7: Python Data Science — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000025',
   '55555555-0000-0000-0000-000000000013', 'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Python for Data Science Crash Course', 0, true, true, 520),

  ('bbbbbbbb-0000-0000-0000-000000000026',
   '55555555-0000-0000-0000-000000000013', 'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'NumPy Arrays & Mathematical Operations', 1, true, false, 640),

  -- Course 7: Python Data Science — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000027',
   '55555555-0000-0000-0000-000000000014', 'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Data Cleaning with Pandas DataFrames', 0, true, false, 830),

  ('bbbbbbbb-0000-0000-0000-000000000028',
   '55555555-0000-0000-0000-000000000014', 'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Data Storytelling with Matplotlib & Seaborn', 1, true, false, 750),

  -- Course 8: Next.js — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000029',
   '55555555-0000-0000-0000-000000000015', 'cccccccc-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'Next.js 14 App Router & Routing Patterns', 0, true, true, 600),

  ('bbbbbbbb-0000-0000-0000-000000000030',
   '55555555-0000-0000-0000-000000000015', 'cccccccc-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'React Server Components & Streaming', 1, true, false, 720),

  -- Course 8: Next.js — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000031',
   '55555555-0000-0000-0000-000000000016', 'cccccccc-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'Server Actions, Form Handling & Zod Validation', 0, true, false, 880),

  ('bbbbbbbb-0000-0000-0000-000000000032',
   '55555555-0000-0000-0000-000000000016', 'cccccccc-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'PostgreSQL Database & Auth Integration', 1, true, false, 950),

  -- Course 9: Cybersecurity — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000033',
   '55555555-0000-0000-0000-000000000017', 'cccccccc-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'Network Protocols, Firewalls & VPNs', 0, true, true, 580),

  ('bbbbbbbb-0000-0000-0000-000000000034',
   '55555555-0000-0000-0000-000000000017', 'cccccccc-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'Symmetric & Asymmetric Cryptography', 1, true, false, 670),

  -- Course 9: Cybersecurity — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000035',
   '55555555-0000-0000-0000-000000000018', 'cccccccc-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'OWASP Top 10 Web Vulnerabilities', 0, true, false, 910),

  ('bbbbbbbb-0000-0000-0000-000000000036',
   '55555555-0000-0000-0000-000000000018', 'cccccccc-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'Ethical Hacking & Penetration Testing Basics', 1, true, false, 840),

  -- Course 10: DSA — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000037',
   '55555555-0000-0000-0000-000000000019', 'cccccccc-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'Big-O Notation & Time Complexity', 0, true, true, 490),

  ('bbbbbbbb-0000-0000-0000-000000000038',
   '55555555-0000-0000-0000-000000000019', 'cccccccc-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'Linked Lists, Stacks, Queues & Trees', 1, true, false, 780),

  -- Course 10: DSA — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000039',
   '55555555-0000-0000-0000-000000000020', 'cccccccc-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'Graph Traversal: BFS & DFS', 0, true, false, 820),

  ('bbbbbbbb-0000-0000-0000-000000000040',
   '55555555-0000-0000-0000-000000000020', 'cccccccc-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'Dynamic Programming Patterns & Memoization', 1, true, false, 950),

  -- Course 11: DevOps — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000041',
   '55555555-0000-0000-0000-000000000021', 'cccccccc-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'Docker Architecture, Images & Containers', 0, true, true, 530),

  ('bbbbbbbb-0000-0000-0000-000000000042',
   '55555555-0000-0000-0000-000000000021', 'cccccccc-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'Docker Compose & Multi-Container Workflows', 1, true, false, 710),

  -- Course 11: DevOps — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000043',
   '55555555-0000-0000-0000-000000000022', 'cccccccc-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'Kubernetes Pods, Services & Deployments', 0, true, false, 890),

  ('bbbbbbbb-0000-0000-0000-000000000044',
   '55555555-0000-0000-0000-000000000022', 'cccccccc-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'Automated CI/CD Pipelines with GitHub Actions', 1, true, false, 940),

  -- Course 12: Modern Figma — Section 1
  ('bbbbbbbb-0000-0000-0000-000000000045',
   '55555555-0000-0000-0000-000000000023', 'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'Figma Interface, Canvas & Vector Tools', 0, true, true, 410),

  ('bbbbbbbb-0000-0000-0000-000000000046',
   '55555555-0000-0000-0000-000000000023', 'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'Auto-Layout & Responsive Constraints', 1, true, false, 680),

  -- Course 12: Modern Figma — Section 2
  ('bbbbbbbb-0000-0000-0000-000000000047',
   '55555555-0000-0000-0000-000000000024', 'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'Building Design Systems & Component Variants', 0, true, false, 860),

  ('bbbbbbbb-0000-0000-0000-000000000048',
   '55555555-0000-0000-0000-000000000024', 'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'Smart Animate & Interactive Prototypes', 1, true, false, 910),

  -- Test Tenant lessons (integration test data)
  ('bbbbbbbb-1111-1111-1111-000000000001',
   '55555555-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Lesson 1: Introduction to Postgres', 1, true, false, 600),

  ('bbbbbbbb-1111-1111-1111-000000000002',
   '55555555-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Lesson 2: Tables and Data Types', 2, true, false, 600),

  ('bbbbbbbb-1111-1111-1111-000000000003',
   '55555555-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Lesson 3: Queries and Joins', 3, true, false, 600),

  ('bbbbbbbb-1111-1111-1111-000000000004',
   '55555555-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Lesson 4: Transactions and ACID', 4, true, false, 600),

  ('bbbbbbbb-1111-1111-1111-000000000005',
   '55555555-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Lesson 5: Indexing and Performance', 5, true, false, 600)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 11: Lesson Contents (video paths — provider + opaque path, no raw URLs)
-- ============================================================================

INSERT INTO public.lesson_contents (lesson_id, course_id, section_id, tenant_id, provider, video_path, duration_sec)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'youtube', 'dQw4w9WgXcQ', 300),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'youtube', 'jNQXAC9IVRw', 480),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'youtube', 'kJQP7kiw5Fk', 620),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'youtube', '2lAe1cqCOXo', 750),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'youtube', 'OgIRAjrFHAY', 540),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'youtube', 'RgKAFK5djSk', 900),
  ('bbbbbbbb-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'youtube', 'fBNz5xF-Kx4', 660),
  ('bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'youtube', 'kUMe1FH4CHE', 820),
  ('bbbbbbbb-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'youtube', 'ztHopE5Wnpc', 580),
  ('bbbbbbbb-0000-0000-0000-000000000010', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'youtube', 'wS_2-57Q_yU', 640),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'youtube', 'cl63m1H9G1I', 840),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'youtube', 'BHwzDmxjgvA', 790),
  ('bbbbbbbb-0000-0000-0000-000000000013', 'cccccccc-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'youtube', 'c9Wg6Cb_YlU', 420),
  ('bbbbbbbb-0000-0000-0000-000000000014', 'cccccccc-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'youtube', 'v233P_336l0', 510),
  ('bbbbbbbb-0000-0000-0000-000000000015', 'cccccccc-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'youtube', 'FTFaQWZBqQ8', 680),
  ('bbbbbbbb-0000-0000-0000-000000000016', 'cccccccc-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'youtube', '126J8Pz9k_U', 600),
  ('bbbbbbbb-0000-0000-0000-000000000017', 'cccccccc-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'youtube', 'k1RI5locZE4', 550),
  ('bbbbbbbb-0000-0000-0000-000000000018', 'cccccccc-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'youtube', 'hiKPPy582vg', 720),
  ('bbbbbbbb-0000-0000-0000-000000000019', 'cccccccc-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'youtube', 'eOBq__h4OJ4', 810),
  ('bbbbbbbb-0000-0000-0000-000000000020', 'cccccccc-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'youtube', 'Xp9vV8q3W3k', 870),
  ('bbbbbbbb-0000-0000-0000-000000000021', 'cccccccc-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001', 'youtube', '1ukSR1GRt6c', 480),
  ('bbbbbbbb-0000-0000-0000-000000000022', 'cccccccc-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001', 'youtube', 'pTJJsmejUOQ', 690),
  ('bbbbbbbb-0000-0000-0000-000000000023', 'cccccccc-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001', 'youtube', 'zKnmZq54-e0', 960),
  ('bbbbbbbb-0000-0000-0000-000000000024', 'cccccccc-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001', 'youtube', 'd_m5cSmepPI', 1100),
  ('bbbbbbbb-0000-0000-0000-000000000025', 'cccccccc-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000013', '11111111-0000-0000-0000-000000000001', 'youtube', 'kqtD5dpn9C8', 520),
  ('bbbbbbbb-0000-0000-0000-000000000026', 'cccccccc-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000013', '11111111-0000-0000-0000-000000000001', 'youtube', 'QUT1VHiLmmI', 640),
  ('bbbbbbbb-0000-0000-0000-000000000027', 'cccccccc-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000014', '11111111-0000-0000-0000-000000000001', 'youtube', 'vmEHCJofslg', 830),
  ('bbbbbbbb-0000-0000-0000-000000000028', 'cccccccc-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000014', '11111111-0000-0000-0000-000000000001', 'youtube', '3ZWuPVWq7p4', 750),
  ('bbbbbbbb-0000-0000-0000-000000000029', 'cccccccc-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000015', '11111111-0000-0000-0000-000000000001', 'youtube', 'wm5gMKuwSYk', 600),
  ('bbbbbbbb-0000-0000-0000-000000000030', 'cccccccc-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000015', '11111111-0000-0000-0000-000000000001', 'youtube', 'ZjAqacIC_3c', 720),
  ('bbbbbbbb-0000-0000-0000-000000000031', 'cccccccc-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000016', '11111111-0000-0000-0000-000000000001', 'youtube', 'd5x0JCbA9Nc', 880),
  ('bbbbbbbb-0000-0000-0000-000000000032', 'cccccccc-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000016', '11111111-0000-0000-0000-000000000001', 'youtube', 'O3_1FuhAio8', 950),
  ('bbbbbbbb-0000-0000-0000-000000000033', 'cccccccc-0000-0000-0000-000000000009', '55555555-0000-0000-0000-000000000017', '11111111-0000-0000-0000-000000000001', 'youtube', 'inWWhr5tnEA', 580),
  ('bbbbbbbb-0000-0000-0000-000000000034', 'cccccccc-0000-0000-0000-000000000009', '55555555-0000-0000-0000-000000000017', '11111111-0000-0000-0000-000000000001', 'youtube', 'jhXCTbFnK8o', 670),
  ('bbbbbbbb-0000-0000-0000-000000000035', 'cccccccc-0000-0000-0000-000000000009', '55555555-0000-0000-0000-000000000018', '11111111-0000-0000-0000-000000000001', 'youtube', '3Kq1MIfTWCE', 910),
  ('bbbbbbbb-0000-0000-0000-000000000036', 'cccccccc-0000-0000-0000-000000000009', '55555555-0000-0000-0000-000000000018', '11111111-0000-0000-0000-000000000001', 'youtube', '6mCanDq_g3g', 840),
  ('bbbbbbbb-0000-0000-0000-000000000037', 'cccccccc-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000019', '11111111-0000-0000-0000-000000000001', 'youtube', 'D6xkbGLQesk', 490),
  ('bbbbbbbb-0000-0000-0000-000000000038', 'cccccccc-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000019', '11111111-0000-0000-0000-000000000001', 'youtube', 'RBSGKlAvoiM', 780),
  ('bbbbbbbb-0000-0000-0000-000000000039', 'cccccccc-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000020', '11111111-0000-0000-0000-000000000001', 'youtube', 'pcKY4hjDrxk', 820),
  ('bbbbbbbb-0000-0000-0000-000000000040', 'cccccccc-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000020', '11111111-0000-0000-0000-000000000001', 'youtube', 'oBt53YbR9Kk', 950),
  ('bbbbbbbb-0000-0000-0000-000000000041', 'cccccccc-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000021', '11111111-0000-0000-0000-000000000001', 'youtube', 'fqMOX6JJhGo', 530),
  ('bbbbbbbb-0000-0000-0000-000000000042', 'cccccccc-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000021', '11111111-0000-0000-0000-000000000001', 'youtube', 'HG6yLjDkE_w', 710),
  ('bbbbbbbb-0000-0000-0000-000000000043', 'cccccccc-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000022', '11111111-0000-0000-0000-000000000001', 'youtube', 'X48VuDVv0do', 890),
  ('bbbbbbbb-0000-0000-0000-000000000044', 'cccccccc-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000022', '11111111-0000-0000-0000-000000000001', 'youtube', 'R8_veQiYBjI', 940),
  ('bbbbbbbb-0000-0000-0000-000000000045', 'cccccccc-0000-0000-0000-000000000012', '55555555-0000-0000-0000-000000000023', '11111111-0000-0000-0000-000000000001', 'youtube', 'jwVkXybcFk4', 410),
  ('bbbbbbbb-0000-0000-0000-000000000046', 'cccccccc-0000-0000-0000-000000000012', '55555555-0000-0000-0000-000000000023', '11111111-0000-0000-0000-000000000001', 'youtube', 'NrKX46DzkGQ', 680),
  ('bbbbbbbb-0000-0000-0000-000000000047', 'cccccccc-0000-0000-0000-000000000012', '55555555-0000-0000-0000-000000000024', '11111111-0000-0000-0000-000000000001', 'youtube', 'II-6dSCQTmA', 860),
  ('bbbbbbbb-0000-0000-0000-000000000048', 'cccccccc-0000-0000-0000-000000000012', '55555555-0000-0000-0000-000000000024', '11111111-0000-0000-0000-000000000001', 'youtube', 'F4T2K9vXgG0', 910)

ON CONFLICT (lesson_id) DO NOTHING;

-- ============================================================================
-- PHASE 12: Enrollments
-- ============================================================================

INSERT INTO public.enrollments (id, user_id, course_id, tenant_id, enrolled_by, status, completed_at, progress_pct)
VALUES
  -- Omar enrolled in React (active)
  ('eeeeeeee-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0),

  -- Omar enrolled in TypeScript (active)
  ('eeeeeeee-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0),

  -- Omar enrolled in AWS (completed)
  ('eeeeeeee-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'completed', now(), 100),

  -- Omar enrolled in Flutter (active)
  ('eeeeeeee-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000006',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0),

  -- Omar enrolled in Python Data Science (active)
  ('eeeeeeee-0000-0000-0000-000000000006',
   'aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000007',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0),

  -- Lina enrolled in React (active)
  ('eeeeeeee-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0),

  -- Lina enrolled in UI/UX Fundamentals (active)
  ('eeeeeeee-0000-0000-0000-000000000007',
   'aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0),

  -- Lina enrolled in Modern Figma (active)
  ('eeeeeeee-0000-0000-0000-000000000008',
   'aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000012',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'active', NULL, 0)

ON CONFLICT (user_id, course_id) DO NOTHING;

-- ============================================================================
-- PHASE 13: User Progress
-- ============================================================================

INSERT INTO public.user_progress (user_id, course_id, lesson_id, tenant_id, progress_pct, completed)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', 75, false),

  ('aaaaaaaa-0000-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000001', 30, false),

  ('aaaaaaaa-0000-0000-0000-000000000005',
   'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', 20, false)

ON CONFLICT (user_id, course_id, lesson_id) DO NOTHING;

-- ============================================================================
-- PHASE 14: Warnings
-- ============================================================================

INSERT INTO public.warnings (id, user_id, tenant_id, issued_by, severity, reason)
VALUES
  ('ffffffff-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003',
   2, 'Repeated late submission of assignments.'),

  ('ffffffff-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003',
   1, 'Missed 3 consecutive live sessions.'),

  ('ffffffff-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002',
   3, 'Inappropriate conduct in course forum.')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 15: Tenant Settings
-- ============================================================================

INSERT INTO public.tenant_settings (tenant_id, key, value)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'max_courses_per_student', '10'),
  ('11111111-0000-0000-0000-000000000001', 'allow_self_enrollment',   'true'),
  ('11111111-0000-0000-0000-000000000001', 'course_approval_required', 'false'),
  ('11111111-0000-0000-0000-000000000001', 'default_language',         '"en"'),
  ('11111111-0000-0000-0000-000000000001', 'timezone',                 '"UTC"')

ON CONFLICT (tenant_id, key) DO NOTHING;

-- ============================================================================
-- PHASE 16: Notifications
-- ============================================================================

INSERT INTO public.notifications (id, tenant_id, title, body, target_audience, created_by)
VALUES
  ('b0b0b0b0-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Welcome to Eduzone!',
   'Get started with your learning journey. Explore our courses and start learning today.',
   'all', 'aaaaaaaa-0000-0000-0000-000000000002'),

  ('b0b0b0b0-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'New Course Available',
   'Check out our latest course: Cloud Architecture with AWS',
   'students', 'aaaaaaaa-0000-0000-0000-000000000002'),

  ('b0b0b0b0-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000001',
   'System Maintenance',
   'Scheduled maintenance on Sunday 2AM UTC. Expected downtime: 30 minutes.',
   'all', 'aaaaaaaa-0000-0000-0000-000000000001')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 17: User Notifications
-- ============================================================================

INSERT INTO public.user_notifications (id, user_id, tenant_id, notification_id, is_read)
VALUES
  ('c0c0c0c0-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'b0b0b0b0-0000-0000-0000-000000000001', false),

  ('c0c0c0c0-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'b0b0b0b0-0000-0000-0000-000000000001', false),

  ('c0c0c0c0-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'b0b0b0b0-0000-0000-0000-000000000002', true),

  ('c0c0c0c0-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'b0b0b0b0-0000-0000-0000-000000000002', true)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 18: Feature Flags (QA overrides — tenant-specific)
-- ============================================================================

INSERT INTO public.feature_flags (id, key, description, is_enabled, rollout_pct)
VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'beta_dashboard',     'New dashboard UI',                  true,  100),
  ('ffffffff-0000-0000-0000-000000000002', 'ai_recommendations', 'AI-powered course recommendations', false,  20),
  ('ffffffff-0000-0000-0000-000000000003', 'advanced_analytics', 'Advanced analytics for teachers',   true,   50),
  ('ffffffff-0000-0000-0000-000000000004', 'mobile_app',         'Mobile app features',               false,   0)

ON CONFLICT (key) DO NOTHING;

INSERT INTO public.tenant_feature_flags (tenant_id, flag_id, is_enabled)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', true),
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', true),
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000003', true),
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004', false)

ON CONFLICT (tenant_id, flag_id) DO NOTHING;

-- ============================================================================
-- PHASE 19: Devices
-- ============================================================================

INSERT INTO public.devices (
  id,
  user_id,
  tenant_id,
  device_id,
  fingerprint_version,
  platform,
  is_active,
  trust_score,
  device_info,
  last_seen
)
VALUES
  ('dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'chrome_desktop_001', 'v1', 'web', true, 85,
   '{"fingerprint_version": "v1", "browser": "Chrome 120", "os": "Windows 11", "screen": "1920x1080", "user_agent": "Mozilla/5.0"}',
   now() - interval '1 hour'),

  ('dddddddd-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'iphone_14_001', 'v1', 'ios', true, 95,
   '{"fingerprint_version": "v1", "model": "iPhone 14", "os": "iOS 17.2", "app_version": "2.1.0", "push_token": "abc123"}',
   now() - interval '30 minutes')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 20: Activity Logs (audit trail)
-- ============================================================================

INSERT INTO public.activity_logs (id, seq, user_id, tenant_id, activity_type, details, ip_address, device_id, risk_level, entry_hash, created_at)
VALUES
  (gen_random_uuid(), 1,
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'user_login', '{"action": "login", "success": true}', '192.168.1.100',
   'dddddddd-0000-0000-0000-000000000001', 'low', 'sha256hash001',
   now() - interval '3 hours'),

  (gen_random_uuid(), 2,
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'course_access', '{"action": "lesson_view", "course_id": "cccccccc-0000-0000-0000-000000000001"}',
   '192.168.1.100', 'dddddddd-0000-0000-0000-000000000001', 'low', 'sha256hash002',
   now() - interval '2 hours'),

  (gen_random_uuid(), 3,
   'aaaaaaaa-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'permission_denied', '{"action": "admin_access", "resource": "users"}',
   '10.0.0.25', NULL, 'critical', 'sha256hash003',
   now() - interval '1 day')

ON CONFLICT (tenant_id, created_at, id) DO NOTHING;

-- ============================================================================
-- PHASE 21: Access Rules
-- ============================================================================

INSERT INTO public.access_rules (id, tenant_id, rule_type, rule_value, is_active)
VALUES
  ('a0a0a0a0-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'time_window',
   '{"start_hour": 9, "end_hour": 17, "days": ["monday","tuesday","wednesday","thursday","friday"]}',
   true),

  ('a0a0a0a0-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'ip_whitelist',
   '{"allowed_ips": ["192.168.1.0/24", "10.0.0.0/8"]}',
   true)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 22: User Access Rules
-- ============================================================================

INSERT INTO public.user_access_rules (user_id, tenant_id, rule_id)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-000000000002')

ON CONFLICT (user_id, rule_id) DO NOTHING;

-- ============================================================================
-- PHASE 23: Rate Limits (sample data)
-- ============================================================================

INSERT INTO public.rate_limits (id, tenant_id, user_id, ip_address, action, window_start, hit_count, blocked_until)
VALUES
  ('77777777-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '192.168.1.100',
   'login', now() - interval '5 minutes', 3, now() + interval '15 minutes'),

  ('77777777-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '10.0.0.50',
   'api_call', now() - interval '2 minutes', 5, now() + interval '10 minutes')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 24: Todos
-- ============================================================================

INSERT INTO public.todos (id, user_id, tenant_id, title, is_completed, priority, due_at)
VALUES
  ('88888888-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Complete React course introduction', false, 1, now() + interval '3 days'),

  ('88888888-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Review TypeScript generics chapter', true, 0, now() - interval '1 day'),

  ('88888888-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Submit AWS architecture assignment', false, 2, now() + interval '1 week')

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PHASE 25: User Last Location
-- ============================================================================

INSERT INTO public.user_last_location (user_id, tenant_id, latitude, longitude, accuracy, source)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   24.7140, 46.6761, 15.2, 'gps'),

  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   24.7128, 46.6745, 8.7, 'ip_based')

ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PHASE 26: User Location Logs
-- ============================================================================

INSERT INTO public.user_location_logs (id, user_id, tenant_id, latitude, longitude, accuracy, source, event_type, device_info, logged_at)
VALUES
  ('99999999-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   24.7136, 46.6753, 10.5, 'ip_based', 'app_open',
   '{"browser": "Chrome", "os": "Windows", "device": "Desktop"}',
   now() - interval '2 hours'),

  ('99999999-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   24.7140, 46.6761, 15.2, 'gps', 'session',
   '{"browser": "Safari", "os": "iOS", "device": "iPhone"}',
   now() - interval '1 hour')

ON CONFLICT (tenant_id, logged_at, id) DO NOTHING;

-- ============================================================================
-- PHASE 27: Video Views
-- ============================================================================

INSERT INTO public.video_views (id, user_id, tenant_id, course_id, lesson_id, watch_time_sec, viewed_at)
VALUES
  ('66666666-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   300, now() - interval '1 day'),

  ('66666666-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
   480, now() - interval '2 days'),

  ('66666666-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000004',
   540, now() - interval '3 hours')

ON CONFLICT (tenant_id, viewed_at, id) DO NOTHING;

-- ============================================================================
-- PHASE 28: User Access Cache (private schema)
-- ============================================================================

INSERT INTO private.user_access_cache (user_id, course_id, tenant_id, status)
VALUES
  -- Omar
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'completed'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'active'),
  -- Lina
  ('aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001', 'active')

ON CONFLICT (user_id, course_id) DO NOTHING;

-- ============================================================================
-- PHASE 29: Schema Migration Marker
-- ============================================================================

INSERT INTO public.schema_migrations (version, description)
VALUES
  ('13.0.0',
   'v13 QA Consolidated seed — 6 users, 3 tenants, 13 courses, 25 sections, 53 lessons, 48 lesson_contents, 8 enrollments, 3 warnings, 5 tenant_settings, 3 notifications, 4 feature_flags, 3 video_views, 8 user_access_cache, 5 course_prerequisites, 24 course_learning_objectives, 2 user_location_logs, 2 user_last_location, 2 access_rules, 2 user_access_rules, 3 todos, 2 rate_limits, 2 devices, 3 activity_logs')

ON CONFLICT (version) DO NOTHING;

COMMIT;
