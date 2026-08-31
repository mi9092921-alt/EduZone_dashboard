-- Canonical schema source. supabase/schema/ (this file and its siblings, per
-- supabase/config.toml schema_paths) is the single source of truth -- no
-- migrations, patches, or external SQL files. Historical note: originally
-- generated from a monolithic Eduzone_schema_v13.sql during a normalization
-- pass (#3, ownership rules); that file no longer exists in this repo.

-- ============================================================================
-- Section 12: server-authoritative offline entitlements
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.offline_download_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL,
  content_type text NOT NULL DEFAULT 'lesson' CHECK (content_type = 'lesson'),
  device_id text NOT NULL CHECK (btrim(device_id) <> ''),
  download_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PENDING','ACTIVE','EXPIRED','REVOKED','DELETED','CORRUPTED')),
  content_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_entitlement_dates CHECK (expires_at > issued_at),
  CONSTRAINT offline_entitlement_revoked_state CHECK (
    (status <> 'REVOKED') OR revoked_at IS NOT NULL
  ),
  CONSTRAINT offline_entitlement_active_state CHECK (
    (status <> 'ACTIVE') OR revoked_at IS NULL
  ),
  UNIQUE (user_id, download_id)
);

CREATE INDEX IF NOT EXISTS idx_offline_entitlements_owner
  ON public.offline_download_entitlements (user_id, device_id, content_id, status);

CREATE INDEX IF NOT EXISTS idx_offline_entitlements_expiry
  ON public.offline_download_entitlements (expires_at)
  WHERE status IN ('PENDING','ACTIVE');

-- Security telemetry written by the authenticated client when a local
-- integrity/RASP control (SecurityService, freeRASP) detects a threat.
-- This is telemetry only and is never an authorization boundary — no
-- client-facing authorization decision may depend on rows in this table.
-- No UPDATE/DELETE policy exists for authenticated users; rows are
-- append-only from the client's perspective.
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  threat text NOT NULL CHECK (length(btrim(threat)) BETWEEN 1 AND 128),
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'linux', 'macos', 'windows', 'fuchsia')),
  platform_version text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  is_release_build boolean NOT NULL DEFAULT false,
  device_fingerprint text,
  app_version text,
  app_build_number text
);

-- ============================================================================
-- 000_core_settings.sql
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.settings_kv (
  key text PRIMARY KEY CHECK (btrim(key) <> ''),
  value jsonb NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  is_public boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by uuid, -- REFERENCES public.users(id) added in migration block
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings_cache (
  key text PRIMARY KEY REFERENCES public.settings_kv(key) ON DELETE CASCADE,
  value jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- ============================================================================
-- 001_pii_security.sql (CRIT-03)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit.pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, -- references users(id) added later
  accessed_by uuid NOT NULL, -- references users(id) added later
  pii_field text NOT NULL CHECK (pii_field IN ('email', 'phone', 'device_token')),
  accessed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  ip_address inet
);

-- HIGH-03: Slow query log
CREATE TABLE IF NOT EXISTS audit.slow_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  execution_ms int NOT NULL,
  tenant_id uuid,
  executed_by uuid,
  executed_at timestamptz NOT NULL DEFAULT now()
);

-- HIGH-05: Deletion audit
CREATE TABLE IF NOT EXISTS audit.deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  deleted_by uuid NOT NULL, -- FK to public.users(id) added in migration section
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  restored_at timestamptz,
  restored_by uuid -- FK to public.users(id) added in migration section
);

-- MEDIUM-02: Lesson state transitions
CREATE TABLE IF NOT EXISTS audit.lesson_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL, -- FK to public.lessons(id) added in migration section
  old_state text NOT NULL,
  new_state text NOT NULL,
  changed_by uuid NOT NULL, -- FK to public.users(id) added in migration section
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

-- 5.2 Settings Validation (JSONB Type Safety)
CREATE TABLE IF NOT EXISTS public.setting_definitions (
  key text PRIMARY KEY,
  expected_type text NOT NULL,
  is_nullable boolean NOT NULL DEFAULT false
);

-- ============================================================================
-- 002_types.sql
-- No custom enum/domain types are used in v13; CHECK constraints are kept close
-- to the owning tables for easier tenant-safe migrations.
-- Bootstrap helpers required by table seeds and expression indexes follow here.
-- ============================================================================

-- LOW-05: Constants table for magic strings
CREATE TABLE IF NOT EXISTS public.constants (
  id text PRIMARY KEY,
  category text NOT NULL,
  description text,
  valid_values text[], -- Array of valid string values
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 003_tables.sql
-- Core reference and identity tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_version_format CHECK (version ~ '^v?[0-9]+\.[0-9]+\.[0-9]+$')
);

CREATE TABLE IF NOT EXISTS public.regions (
  id text PRIMARY KEY,
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

INSERT INTO public.regions (id, label, is_active, is_primary) VALUES
  ('me-south-1', 'Middle East (Bahrain)', true, true),
  ('eu-west-1', 'Europe (Ireland)', true, false),
  ('us-east-1', 'US East (Virginia)', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.constants (id, category, description, valid_values) VALUES
  ('REGION_ME_SOUTH_1', 'region', 'Default region id', ARRAY['me-south-1']::text[])
ON CONFLICT (id) DO NOTHING;

-- Bootstrap: required before tenants/users/courses DEFAULT expressions (full defs in 07_functions.sql)
CREATE OR REPLACE FUNCTION public.get_constant(p_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (valid_values[1])::text FROM public.constants WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.get_default_region_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN coalesce(
    (SELECT value #>> '{}' FROM public.settings_kv WHERE key = 'default_region_id'),
    public.get_constant('REGION_ME_SOUTH_1')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.system_tenant_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  region_id text NOT NULL DEFAULT public.get_default_region_id() REFERENCES public.regions(id),
  data_residency text NOT NULL DEFAULT public.get_default_region_id() REFERENCES public.regions(id),
  max_users integer NOT NULL DEFAULT 1000 CHECK (max_users >= 0),
  max_courses integer NOT NULL DEFAULT 50 CHECK (max_courses >= 0),
  max_storage_bytes bigint NOT NULL DEFAULT 10737418240 CHECK (max_storage_bytes >= 0),
  -- unmaintained counters removed in hardening phase
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_ip inet DEFAULT NULL,
  updated_by_ip inet DEFAULT NULL,
  deleted_at timestamptz,
  CONSTRAINT tenants_slug_not_blank CHECK (length(btrim(slug)) > 0)
);

COMMENT ON TABLE public.tenants IS 
'Multi-tenant organization container. One tenant = one customer/organization.
Each tenant has independent data isolation via RLS policies.
Lifecycle: created_at Ã¢â€ â€™ active Ã¢â€ â€™ billing Ã¢â€ â€™ deleted_at (soft).';

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  email text,
  phone text,
  email_encrypted bytea,
  phone_encrypted bytea,
  email_hash text, -- for O(1) lookups (HIGH-08)
  first_name text,
  last_name text,
  avatar_url text,
  timezone text DEFAULT 'UTC',
  locale text DEFAULT 'en',
  primary_role text NOT NULL DEFAULT 'student'
    CHECK (primary_role IN ('student', 'teacher', 'admin', 'super_admin')),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'inactive', 'suspended', 'locked', 'banned')),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
  ) STORED,

  lock_reason text,
  locked_at timestamptz,
  locked_by uuid,
  suspension_until timestamptz,
  token_version integer NOT NULL DEFAULT 0 CHECK (token_version >= 0),
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  login_count integer NOT NULL DEFAULT 0 CHECK (login_count >= 0),
  region_id text NOT NULL DEFAULT public.get_default_region_id() REFERENCES public.regions(id),
  shard_key smallint GENERATED ALWAYS AS (abs(hashtext(id::text)) % 256) STORED,
  last_login timestamptz,
  last_seen_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_ip inet DEFAULT NULL,
  updated_by_ip inet DEFAULT NULL,
  deleted_at timestamptz,
  CONSTRAINT users_email_format CHECK (
    email IS NULL OR (
      email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
      AND length(email) <= 255
      AND pg_catalog.btrim(email) = email
    )
  ),
  CONSTRAINT users_timezone_format CHECK (
    timezone IS NULL OR timezone = 'UTC' OR timezone ~ '^([A-Za-z_]+)(/[A-Za-z0-9_+-]+)+$'
  ),
  CONSTRAINT users_locale_format CHECK (
    locale IS NULL OR locale ~ '^[a-z]{2}(-[A-Z]{2})?$'
  ),
  CONSTRAINT users_email_or_phone_required CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT chk_users_first_name_len CHECK (length(first_name) <= 255),
  CONSTRAINT chk_users_last_name_len  CHECK (length(last_name)  <= 255),
  CONSTRAINT chk_users_email_hash_consistency CHECK (
    email_hash IS NULL OR email_hash = encode(extensions.digest(lower(btrim(email)), 'sha256'), 'hex')
  ),
  CONSTRAINT uq_users_email_tenant UNIQUE (tenant_id, email), -- HIGH-08: Tenant-scoped uniqueness
  CONSTRAINT uq_users_email_hash_tenant UNIQUE (tenant_id, email_hash) -- CRIT-03: Hash uniqueness
) WITH (fillfactor = 85);

COMMENT ON TABLE public.users IS 
'User identity table (students, instructors, admins). Multi-tenant scoped.
Soft delete with cascade to enrollments, sessions, roles.
Email is tenant-scoped unique (must be validated before INSERT).';

-- safety guard if deployed from earlier draft

-- LOW-04: admins_legacy is deprecated and removed.
-- Logic previously here migrated to public.user_roles.

-- ============================================================================
-- RBAC and feature configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  label text,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  priority smallint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  resource text NOT NULL CHECK (btrim(resource) <> ''),
  action text NOT NULL CHECK (btrim(action) <> ''),
  scope text NOT NULL DEFAULT 'tenant' CHECK (scope IN ('global', 'tenant', 'own')),
  description text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- HIGH-07: Unlogged table for job progress
CREATE UNLOGGED TABLE IF NOT EXISTS internal.enrollment_progress_temp (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id uuid NOT NULL,
  new_progress_pct numeric,
  completed boolean,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.user_permission_cache (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  permission_name text NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (user_id, tenant_id, permission_name)
);

CREATE TABLE IF NOT EXISTS public.cache_invalidation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  cache_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Feature Flags — canonical production data model
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  rollout_pct smallint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  enabled_from timestamptz,
  enabled_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS enabled_from timestamptz;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS enabled_until timestamptz;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;


COMMENT ON TABLE public.feature_flags IS
'Global feature-flag definitions. Runtime evaluation is performed by the canonical SECURITY DEFINER evaluator. Client applications do not read this table directly.';
COMMENT ON COLUMN public.feature_flags.rollout_pct IS
'Deterministic rollout percentage in basis points: 0..10000 (10000 = 100%).';
COMMENT ON COLUMN public.feature_flags.is_enabled IS
'Global kill switch. FALSE always disables the flag, regardless of targeting or rollout.';
COMMENT ON COLUMN public.feature_flags.version IS
'Monotonic configuration revision used for cache invalidation and optimistic consistency.';

-- Tenant–specific overrides for global settings (P1)
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (btrim(key) <> ''),
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS public.security_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_timeout_minutes integer NOT NULL DEFAULT 1440 CHECK (session_timeout_minutes BETWEEN 5 AND 43200),
  force_single_session boolean NOT NULL DEFAULT true,
  max_devices_per_user integer NOT NULL DEFAULT 1 CHECK (max_devices_per_user BETWEEN 1 AND 25),
  max_warnings_before_action integer NOT NULL DEFAULT 3 CHECK (max_warnings_before_action BETWEEN 1 AND 25),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.security_settings IS 
'Tenant-specific security policies including session timeouts and MFA requirements.
force_single_session prevents concurrent logins across multiple devices.';

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  is_enabled boolean,
  rollout_pct smallint,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_id)
);

ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS rollout_pct smallint;
ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.tenant_feature_flags ALTER COLUMN is_enabled DROP NOT NULL;

COMMENT ON TABLE public.tenant_feature_flags IS
'Tenant-scoped override of a global feature flag. A row must contain at least one explicit override (enabled state or rollout percentage).';

CREATE TABLE IF NOT EXISTS public.feature_flag_roles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_id, role_id)
);

COMMENT ON TABLE public.feature_flag_roles IS
'Explicit role targeting. FALSE is an explicit deny; TRUE is an explicit allow. The evaluator uses deny-over-allow when a user has multiple matching roles.';

CREATE TABLE IF NOT EXISTS public.feature_flag_users (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_id, user_id)
);

COMMENT ON TABLE public.feature_flag_users IS
'Explicit user targeting. A matching user override takes precedence over role targeting and rollout, but never over the global kill switch.';

-- ============================================================================
-- NEW: User Validity Cache (v13.2 enhancement)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_validity_cache (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  is_valid boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 0,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.feature_flag_roles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_id, role_id)
);

ALTER TABLE public.feature_flag_roles ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.feature_flag_roles ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.feature_flag_roles ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flag_roles ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flag_roles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.feature_flag_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.feature_flag_roles IS
'Explicit role targeting. FALSE is an explicit deny; TRUE is an explicit allow. The evaluator uses deny-over-allow when a user has multiple matching roles.';

CREATE TABLE IF NOT EXISTS public.feature_flag_users (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_id, user_id)
);

ALTER TABLE public.feature_flag_users ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.feature_flag_users ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.feature_flag_users ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flag_users ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flag_users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.feature_flag_users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.feature_flag_users IS
'Explicit user targeting. A matching user override takes precedence over role targeting and rollout, but never over the global kill switch.';

-- ============================================================================
-- Learning content
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  total_lessons integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_discoverable boolean NOT NULL DEFAULT true,
  thumbnail_url text,
  slug text CHECK (slug IS NULL OR length(btrim(slug)) > 0),
  teacher_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  category text NOT NULL DEFAULT 'general',
  level text NOT NULL DEFAULT 'beginner'
    CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_free boolean GENERATED ALWAYS AS (price = 0) STORED,
  region_id text NOT NULL DEFAULT public.get_default_region_id() REFERENCES public.regions(id),
  language text NOT NULL DEFAULT 'en',
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_ip inet DEFAULT NULL,
  updated_by_ip inet DEFAULT NULL,
  deleted_at timestamptz,
  CONSTRAINT courses_id_tenant_unique UNIQUE (id, tenant_id)
) WITH (fillfactor = 85);

COMMENT ON TABLE public.courses IS 
'Educational courses. Managed by teachers, accessible by enrolled students.
Soft-delete via deleted_at. Status state machine: draft -> published -> archived.';

-- Trigger removed: trg_normalize_course_fields function does not exist
-- DROP TRIGGER IF EXISTS trg_normalize_courses ON public.courses;


CREATE TABLE IF NOT EXISTS public.course_prerequisites (
  course_id uuid NOT NULL,
  prerequisite_course_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  PRIMARY KEY (course_id, prerequisite_course_id),
  CONSTRAINT course_prerequisites_not_self CHECK (course_id <> prerequisite_course_id)
);

CREATE TABLE IF NOT EXISTS public.course_learning_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  objective text NOT NULL CHECK (btrim(objective) <> ''),
  order_index integer NOT NULL DEFAULT 0,
  UNIQUE (course_id, objective),
  UNIQUE (course_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  order_index integer NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (course_id, order_index),
  UNIQUE (id, course_id, tenant_id), -- Ensure composite uniqueness for FKs
  CONSTRAINT sections_course_tenant_fkey
    FOREIGN KEY (course_id, tenant_id)
    REFERENCES public.courses(id, tenant_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  course_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title) <> ''),
  order_index integer NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  is_published boolean NOT NULL DEFAULT false,
  is_preview boolean NOT NULL DEFAULT false,
  duration_sec integer CHECK (duration_sec IS NULL OR duration_sec >= 0),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (course_id, section_id, order_index) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (id, course_id, section_id, tenant_id), -- Ensure composite uniqueness for FKs
  CONSTRAINT lessons_section_tenant_fkey
    FOREIGN KEY (section_id, course_id, tenant_id)
    REFERENCES public.sections(id, course_id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_lessons_publication_state CHECK (
    (is_published = false) OR (is_published = true AND deleted_at IS NULL)
  ),
  CONSTRAINT chk_lessons_title_length CHECK (length(btrim(title)) > 0 AND length(title) <= 255)
);

COMMENT ON TABLE public.lessons IS 
'Educational lessons within a course section.
is_published = true makes it visible to students. is_preview allows viewing without enrollment.';

-- Trigger removed: trg_normalize_lesson_fields function does not exist
-- DROP TRIGGER IF EXISTS trg_normalize_lessons ON public.lessons;


CREATE TABLE IF NOT EXISTS public.lesson_contents (
  lesson_id uuid PRIMARY KEY,
  course_id uuid NOT NULL,
  section_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'youtube'
    CHECK (provider IN ('youtube', 's3', 'bunny', 'mux', 'vimeo')),
  video_path text NOT NULL CONSTRAINT lesson_contents_video_path_relative_only CHECK (
    btrim(video_path) <> ''
    AND video_path !~* '^https?://'
    AND video_path !~* 'javascript:'
  ),
  captions_path text CHECK (captions_path IS NULL OR captions_path !~* '^https?://'),
  duration_sec integer CHECK (duration_sec IS NULL OR duration_sec >= 0),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_contents_tenant_fkey
    FOREIGN KEY (lesson_id, course_id, section_id, tenant_id)
    REFERENCES public.lessons(id, course_id, section_id, tenant_id)
    ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'offline_entitlements_content_fkey'
      AND conrelid = 'public.offline_download_entitlements'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.offline_download_entitlements
      ADD CONSTRAINT offline_entitlements_content_fkey
      FOREIGN KEY (content_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- ============================================================================
-- Enrollment, progress, activity, and devices
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  enrolled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired', 'completed')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason text,
  last_watched_at timestamptz,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),

  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, course_id),
  CONSTRAINT enrollments_completed_state CHECK (
    (status <> 'completed') OR completed_at IS NOT NULL
  ),
  CONSTRAINT enrollments_revoked_state CHECK (
    (status <> 'revoked') OR revoked_at IS NOT NULL
  )
) WITH (
  fillfactor = 85,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 25
);

COMMENT ON TABLE public.enrollments IS 
'Student course enrollment record. Links user → course.
Soft-delete aware: deleted_at = unenroll.
Progress tracked separately in user_progress table (1:many).';

CREATE TABLE IF NOT EXISTS public.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  watch_time_sec integer NOT NULL DEFAULT 0 CHECK (watch_time_sec >= 0),
  last_watched timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, course_id, lesson_id),
  CONSTRAINT user_progress_completed_state CHECK (
    completed = false OR completed_at IS NOT NULL
  ),
  -- M-04 FIX: Ensure progress/completion consistency constraint exists.
  CONSTRAINT chk_progress_completion_consistency CHECK (
    NOT (completed = false AND progress_pct >= 100)
    AND NOT (completed = true  AND completed_at IS NULL)
  )
) WITH (
  fillfactor = 85,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 25
);

COMMENT ON TABLE public.user_progress IS 
'Lesson-level progress for each user-course enrollment.
Tracks: completion %, last access time, completed_at timestamp.
Updated by learner watching video (real-time).';

CREATE TABLE IF NOT EXISTS private.user_access_cache (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL,
  -- 'completed' maps to 'active' for access purposes (patch 22 fix)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'completed')),
  valid_until timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  device_id text NOT NULL CHECK (btrim(device_id) <> ''),
  fingerprint_version text NOT NULL DEFAULT 'v2'
    CHECK (fingerprint_version IN ('v1', 'v2')),
  platform text CHECK (platform IN ('android', 'ios', 'web')),
  is_active boolean NOT NULL DEFAULT true,
  trust_score smallint NOT NULL DEFAULT 100 CHECK (trust_score BETWEEN 0 AND 100),
  device_info jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(device_info) = 'object'),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS fingerprint_version text NOT NULL DEFAULT 'v2';

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  region_id text REFERENCES public.regions(id) ON DELETE SET NULL,
  ip_address inet,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  ended_at timestamptz,
  end_reason text,
  risk_score smallint NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (tenant_id, started_at, id)
) PARTITION BY RANGE (started_at);

-- Drop all quarterly partitions to avoid conflicts with yearly partitions
-- production-safe: DROP TABLE IF EXISTS public.sessions_2026_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2026_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2026_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2026_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2027_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2027_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2027_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2027_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2028_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2028_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2028_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2028_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2029_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2029_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2029_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2029_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2030_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2030_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2030_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2030_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2031_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2031_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2031_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_2031_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.sessions_future CASCADE; -- disabled; use an audited partition migration if needed

CREATE TABLE IF NOT EXISTS public.sessions_2026
  PARTITION OF public.sessions FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.sessions_2027
  PARTITION OF public.sessions FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS public.sessions_2028
  PARTITION OF public.sessions FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS public.sessions_2029
  PARTITION OF public.sessions FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS public.session_locks (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  locked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.active_sessions (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, started_at, session_id) REFERENCES public.sessions(tenant_id, started_at, id) ON DELETE CASCADE
) WITH (fillfactor = 85);

CREATE TABLE IF NOT EXISTS public.session_snapshots (
  session_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  user_snapshot jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(user_snapshot) = 'object'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  PRIMARY KEY (tenant_id, started_at, session_id),
  FOREIGN KEY (tenant_id, started_at, session_id) REFERENCES public.sessions(tenant_id, started_at, id) ON DELETE CASCADE
) PARTITION BY RANGE (started_at);

CREATE TABLE IF NOT EXISTS public.session_snapshots_2026
  PARTITION OF public.session_snapshots FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.session_snapshots_2027
  PARTITION OF public.session_snapshots FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS public.session_snapshots_2028
  PARTITION OF public.session_snapshots FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS public.session_snapshots_2029
  PARTITION OF public.session_snapshots FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS public.video_views (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  watch_time_sec integer NOT NULL DEFAULT 0 CHECK (watch_time_sec >= 0),
  is_vertical boolean NOT NULL DEFAULT false,
  aspect_ratio numeric(5,2),
  user_snapshot jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(user_snapshot) = 'object'),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, viewed_at, id)
) PARTITION BY RANGE (viewed_at);

-- production-safe: DROP TABLE IF EXISTS public.video_views_2026_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2026_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2026_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2026_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2027_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2027_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2027_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2027_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2028_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2028_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2028_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2028_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2029_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2029_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2029_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2029_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2030_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2030_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2030_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2030_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2031_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2031_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2031_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_2031_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.video_views_future CASCADE; -- disabled; use an audited partition migration if needed

CREATE TABLE IF NOT EXISTS public.video_views_2026
  PARTITION OF public.video_views FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.video_views_2027
  PARTITION OF public.video_views FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS public.video_views_2028
  PARTITION OF public.video_views FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS public.video_views_2029
  PARTITION OF public.video_views FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title) <> ''),
  is_completed boolean NOT NULL DEFAULT false,
  priority smallint NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 2),
  due_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  severity smallint NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  is_acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  device_id text NOT NULL CHECK (btrim(device_id) <> ''),
  token text NOT NULL UNIQUE CHECK (btrim(token) <> ''),
  platform text CHECK (platform IN ('android', 'ios', 'web')),
  device_info jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(device_info) = 'object'),
  app_version text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
UPDATE public.push_tokens
SET device_id = 'legacy-' || id::text
WHERE device_id IS NULL OR btrim(device_id) = '';
UPDATE public.push_tokens
SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at, now())
WHERE last_seen_at IS NULL;
ALTER TABLE public.push_tokens ALTER COLUMN device_id SET NOT NULL;
ALTER TABLE public.push_tokens ALTER COLUMN last_seen_at SET DEFAULT now();
ALTER TABLE public.push_tokens ALTER COLUMN last_seen_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_location_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  session_id uuid,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy double precision CHECK (accuracy IS NULL OR accuracy >= 0),
  source text NOT NULL DEFAULT 'ip_based' CHECK (source IN ('gps', 'wifi', 'manual', 'ip_based')),
  event_type text NOT NULL DEFAULT 'app_open' CHECK (event_type IN ('app_open', 'manual', 'session')),
  device_info jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(device_info) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  logged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, logged_at, id)
) PARTITION BY RANGE (logged_at);

-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2026_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2026_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2026_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2026_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2027_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2027_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2027_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2027_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2028_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2028_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2028_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2028_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2029_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2029_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2029_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2029_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2030_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2030_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2030_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2030_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2031_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2031_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2031_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_2031_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS public.user_location_logs_future CASCADE; -- disabled; use an audited partition migration if needed

CREATE TABLE IF NOT EXISTS public.user_location_logs_2026
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.user_location_logs_2027
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS public.user_location_logs_2028
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS public.user_location_logs_2029
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS public.user_location_logs_2030
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');

CREATE TABLE IF NOT EXISTS public.user_location_logs_2031
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2031-01-01') TO ('2032-01-01');

CREATE TABLE IF NOT EXISTS public.user_last_location (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy double precision CHECK (accuracy IS NULL OR accuracy >= 0),
  source text CHECK (source IN ('gps', 'network', 'wifi', 'manual', 'ip_based')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- idx_lesson_access_tenant_time is created after audit.lesson_access_log exists (see 005b_deferred_indexes below)


-- ============================================================================
-- Audit, notifications, access rules, and internal jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit.lesson_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  ip_address inet,
  access_type text NOT NULL DEFAULT 'stream' CHECK (access_type IN ('stream', 'download', 'preview')),
  decision text NOT NULL DEFAULT 'allow' CHECK (decision IN ('allow', 'block')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  accessed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (accessed_at, id)
) PARTITION BY RANGE (accessed_at);

-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2026_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2026_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2026_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2026_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2027_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2027_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2027_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2027_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2028_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2028_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2028_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2028_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2029_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2029_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2029_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2029_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2030_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2030_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2030_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2030_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2031_q1 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2031_q2 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2031_q3 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_2031_q4 CASCADE; -- disabled; use an audited partition migration if needed
-- production-safe: DROP TABLE IF EXISTS audit.lesson_access_log_future CASCADE; -- disabled; use an audited partition migration if needed

CREATE TABLE IF NOT EXISTS audit.lesson_access_log_2026
  PARTITION OF audit.lesson_access_log FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS audit.lesson_access_log_2027
  PARTITION OF audit.lesson_access_log FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS audit.lesson_access_log_2028
  PARTITION OF audit.lesson_access_log FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS audit.alert_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  query_name text NOT NULL,
  error_message text,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS audit.alert_log_2026
  PARTITION OF audit.alert_log FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS audit.alert_log_2027
  PARTITION OF audit.alert_log FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS audit.alert_log_2028
  PARTITION OF audit.alert_log FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS public.activity_log_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  activity_type text NOT NULL CHECK (btrim(activity_type) <> ''),
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  ip_address inet,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  flushed_at timestamptz,
  last_flush_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
) WITH (fillfactor = 85);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid NOT NULL,
  seq bigint NOT NULL,
  user_id uuid, -- referenced in composite FK later
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  activity_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  ip_address inet,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  prev_hash text,
  entry_hash text NOT NULL CHECK (entry_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, created_at, id)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE public.activity_logs IS 
'Audit trail of user actions (login, course completed, etc).
Append-only: no UPDATE/DELETE.
Partitioned by year to improve maintenance performance.';

CREATE TABLE IF NOT EXISTS public.activity_logs_2026
  PARTITION OF public.activity_logs FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.activity_logs_2027
  PARTITION OF public.activity_logs FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS public.activity_logs_2028
  PARTITION OF public.activity_logs FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS public.activity_logs_2029
  PARTITION OF public.activity_logs FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');


CREATE TABLE IF NOT EXISTS public.audit_chain_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_seq bigint NOT NULL DEFAULT 0,
  last_hash text NOT NULL DEFAULT repeat('0', 64),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  activity text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS 'Simple audit log for tracking system events.';

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 100),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 500),
  region_id text REFERENCES public.regions(id) ON DELETE SET NULL,
  target_audience text NOT NULL DEFAULT 'all'
    CHECK (target_audience IN ('all', 'students', 'teachers', 'admins')),
  target_permission text REFERENCES public.permissions(name) ON DELETE RESTRICT,
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS 
'In-app notifications for users. region_id allows targeting by data residency region.
Soft-delete via deleted_at.';

CREATE TABLE IF NOT EXISTS public.notification_targets (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, notification_id)
);

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_notification_id uuid REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  push_token_id uuid REFERENCES public.push_tokens(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'invalid_token')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_message_id text,
  provider_error_code text,
  provider_error_message text,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, push_token_id)
);

CREATE TABLE IF NOT EXISTS public.access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  rule_type text NOT NULL CHECK (rule_type IN ('time_window', 'ip_whitelist', 'geo_location', 'device_type')),
  rule_value jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.user_access_rules (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL REFERENCES public.access_rules(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, rule_id)
);

CREATE TABLE IF NOT EXISTS public.rate_limit_rules (
  action text PRIMARY KEY,
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  max_hits integer NOT NULL CHECK (max_hits > 0),
  block_seconds integer NOT NULL DEFAULT 0 CHECK (block_seconds >= 0),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address inet,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  action text NOT NULL REFERENCES public.rate_limit_rules(action) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 1 CHECK (hit_count >= 0),
  blocked_until timestamptz,
  rate_limit_key_hash text, -- HIGH-04: Opaque key to prevent enumeration
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- HIGH-03 FIX: Operational maintenance for job queue.
CREATE TABLE IF NOT EXISTS internal.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL UNIQUE,
  last_heartbeat timestamptz NOT NULL DEFAULT pg_catalog.now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS internal.job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (btrim(job_type) <> ''),
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash text GENERATED ALWAYS AS (md5(payload::text)) STORED,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  locked_by_worker_id uuid REFERENCES internal.workers(id) ON DELETE SET NULL,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  next_retry_at timestamptz,
  run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PERF-2A: Aggressive autovacuum for internal.job_queue.
-- This table sees extreme INSERT/UPDATE/DELETE churn (pending→processing→done/failed)
-- on every job execution cycle. Default autovacuum (scale_factor=0.2) fires far too
-- late, allowing dead-tuple bloat to fragment indexes and degrade priority scans.
-- These thresholds fire autovacuum after just 20 dead tuples or 5% of the table —
-- keeping the heap clean and index pages dense under sustained concurrent load.
ALTER TABLE internal.job_queue SET (
  autovacuum_vacuum_scale_factor   = 0.05,   -- vacuum after 5% dead tuples
  autovacuum_vacuum_threshold      = 20,     -- minimum 20 dead tuples before vacuum
  autovacuum_analyze_scale_factor  = 0.02,   -- analyze after 2% changed rows
  autovacuum_analyze_threshold     = 10      -- minimum 10 changed rows before analyze
);

-- HIGH-07 FIX: Job progress tracking for checkpointing
CREATE TABLE IF NOT EXISTS internal.job_progress (
  job_type text NOT NULL,
  checkpoint_key text NOT NULL,
  last_processed_at timestamptz NOT NULL DEFAULT now(),
  processed_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (job_type, checkpoint_key)
);

CREATE TABLE IF NOT EXISTS private.dashboard_stats_cache (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stats jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.enrollments        IS 'Student course enrollments - tenant-isolated, soft-delete via status';

COMMENT ON TABLE public.courses            IS 'Course master table - soft-delete via deleted_at';

COMMENT ON TABLE public.notifications      IS 'Tenant notifications - async fanout via internal.job_queue';

COMMENT ON TABLE public.user_roles         IS 'RBAC role assignments - source of truth for admin checks';

COMMENT ON TABLE public.activity_logs      IS 'Immutable audit chain - partitioned by created_at, no DELETE/UPDATE';

COMMENT ON TABLE public.user_location_logs IS 'Telemetry location logs - partitioned by logged_at, INSERT-only';

COMMENT ON TABLE public.settings_kv        IS 'Global settings store - version-tracked, cache-invalidated on write';

-- CRIT-06 FIX: First cron block removed. All scheduling is consolidated below
-- in the idempotent block that DELETEs first then re-inserts (avoids duplicates).

-- Future partitions
CREATE TABLE IF NOT EXISTS public.sessions_future
  PARTITION OF public.sessions FOR VALUES FROM ('2030-01-01') TO (MAXVALUE);

CREATE TABLE IF NOT EXISTS public.video_views_future
  PARTITION OF public.video_views FOR VALUES FROM ('2030-01-01') TO (MAXVALUE);

CREATE TABLE IF NOT EXISTS public.user_location_logs_future
  PARTITION OF public.user_location_logs FOR VALUES FROM ('2032-01-01') TO (MAXVALUE);

CREATE TABLE IF NOT EXISTS public.activity_logs_future
  PARTITION OF public.activity_logs FOR VALUES FROM ('2030-01-01') TO (MAXVALUE);

CREATE TABLE IF NOT EXISTS public.session_snapshots_future
  PARTITION OF public.session_snapshots FOR VALUES FROM ('2030-01-01') TO (MAXVALUE);

CREATE TABLE IF NOT EXISTS audit.lesson_access_log_future
  PARTITION OF audit.lesson_access_log FOR VALUES FROM ('2030-01-01') TO (MAXVALUE);

CREATE TABLE IF NOT EXISTS audit.alert_log_future
  PARTITION OF audit.alert_log FOR VALUES FROM ('2030-01-01') TO (MAXVALUE);

-- LOW-01/04/05 FIX: Comprehensive Documentation and Constant Management
COMMENT ON TABLE public.users IS 'Multi-tenant user identity table. token_version is used for session revocation.';

COMMENT ON TABLE public.tenants IS 'Multi-tenant organization container. Each tenant has independent data isolation.';

COMMENT ON TABLE public.enrollments IS 'Student course enrollment record. Links user to course. fillfactor=85 for high write concurrency.';

COMMENT ON TABLE public.courses IS 'Educational courses. Managed by teachers, accessible by enrolled students.';

COMMENT ON TABLE public.user_progress IS 'Lesson-level progress for each user-course enrollment. fillfactor=85 for frequent updates.';

COMMENT ON TABLE public.activity_logs IS 'Audit trail of user actions. Partitioned by year for performance.';

COMMENT ON TABLE public.notifications IS 'System and teacher notifications for users.';

COMMENT ON TABLE public.rate_limits IS 'Atomic rate limiting tracking. RLS protected to prevent bypass.';

COMMENT ON TABLE internal.job_queue IS 'Background task queue. Accessed only via service_role and internal functions.';

-- ─────────────────────────────────────────────────────────────────────────────
-- video_cache
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_cache (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  url        text        NOT NULL,
  url_hash   text        UNIQUE NOT NULL,
  data       jsonb       NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

COMMENT ON TABLE public.video_cache IS 'Cache for video streaming URLs and metadata.';

-- ─────────────────────────────────────────────────────────────────────────────
-- download_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.download_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users(id),
  lesson_id         uuid,
  course_id         uuid,
  quality           text,
  downloaded_at     timestamptz DEFAULT now(),
  access_expires_at timestamptz
);

COMMENT ON TABLE public.download_logs IS 'Log of offline content downloads by students.';
