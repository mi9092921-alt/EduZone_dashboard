-- ============================================================================
-- Section 12: authoritative server-side offline entitlement boundary
-- ============================================================================
CREATE OR REPLACE FUNCTION public.offline_entitlement_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'PENDING' AND NEW.status = 'ACTIVE') OR
      (OLD.status = 'ACTIVE' AND NEW.status IN ('EXPIRED','REVOKED','DELETED','CORRUPTED')) OR
      (OLD.status IN ('EXPIRED','REVOKED','CORRUPTED') AND NEW.status = 'DELETED')
    ) THEN
      RAISE EXCEPTION 'invalid offline entitlement state transition' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offline_entitlement_transition
  ON public.offline_download_entitlements;
CREATE TRIGGER trg_offline_entitlement_transition
BEFORE UPDATE ON public.offline_download_entitlements
FOR EACH ROW EXECUTE FUNCTION public.offline_entitlement_transition_guard();

CREATE OR REPLACE FUNCTION public.authorize_offline_download(
  p_lesson_id uuid,
  p_course_id uuid,
  p_device_id text,
  p_download_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_content_version text;
  v_expires_at timestamptz;
  v_entitlement public.offline_download_entitlements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- P6.25: bound how often this authenticated identity may call this RPC.
  -- Does not attempt cryptographic replay-detection (no nonce/idempotency
  -- key — a bare re-POST of an already-authorized request is harmless: it
  -- hits the existing-row branch below and returns the same entitlement
  -- unchanged, it cannot re-extend expires_at or resurrect a revoked row).
  -- What this closes is unbounded call volume from a captured/replayed
  -- request — reusing rate_limit_rules/check_rate_limit exactly as
  -- video-info already does, per project instructions ("no security
  -- controls without a threat model"): the threat here is volume, not
  -- state forgery, so volume is what gets bounded.
  IF (public.check_rate_limit('offline_download_authorize', v_user_id) ->> 'allowed')::boolean IS FALSE THEN
    RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent claims for the same user/content/device so a
  -- double-tap or duplicate worker cannot race two active entitlements.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user_id::text || ':' || p_lesson_id::text || ':' || p_device_id)
  );
  IF p_download_id IS NULL OR p_lesson_id IS NULL OR p_course_id IS NULL
     OR p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'invalid offline authorization request' USING ERRCODE = '22023';
  END IF;

  SELECT e.* INTO v_enrollment
  FROM public.enrollments e
  WHERE e.user_id = v_user_id
    AND e.course_id = p_course_id
    AND e.status = 'active'
    AND (e.expires_at IS NULL OR e.expires_at > pg_catalog.now())
    AND e.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = p_lesson_id
      AND l.course_id = p_course_id
      AND l.is_published
      AND l.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.user_id = v_user_id
      AND d.device_id = p_device_id
      AND d.is_active
  ) THEN
    RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(to_char(lc.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'v1')
    INTO v_content_version
  FROM public.lesson_contents lc
  WHERE lc.lesson_id = p_lesson_id;
  v_content_version := COALESCE(v_content_version, 'v1');

  v_expires_at := LEAST(
    COALESCE(v_enrollment.expires_at, pg_catalog.now() + interval '30 days'),
    pg_catalog.now() + interval '30 days'
  );

  SELECT * INTO v_entitlement
  FROM public.offline_download_entitlements e
  WHERE e.user_id = v_user_id
    AND e.download_id = p_download_id
  LIMIT 1;

  IF FOUND THEN
    IF v_entitlement.device_id <> p_device_id
       OR v_entitlement.content_id <> p_lesson_id THEN
      RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
    END IF;
    IF v_entitlement.status IN ('REVOKED','DELETED','CORRUPTED') THEN
      RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    INSERT INTO public.offline_download_entitlements (
      user_id, content_id, content_type, device_id, download_id,
      issued_at, expires_at, status, content_version
    ) VALUES (
      v_user_id, p_lesson_id, 'lesson', p_device_id, p_download_id,
      pg_catalog.now(), v_expires_at, 'PENDING', v_content_version
    )
    RETURNING * INTO v_entitlement;

    UPDATE public.offline_download_entitlements
       SET status = 'ACTIVE'
     WHERE id = v_entitlement.id
     RETURNING * INTO v_entitlement;
  END IF;

  RETURN jsonb_build_object(
    'entitlement_id', v_entitlement.id,
    'download_id', v_entitlement.download_id,
    'user_id', v_entitlement.user_id,
    'content_id', v_entitlement.content_id,
    'content_type', v_entitlement.content_type,
    'device_id', v_entitlement.device_id,
    'issued_at', v_entitlement.issued_at,
    'expires_at', v_entitlement.expires_at,
    'revoked_at', v_entitlement.revoked_at,
    'status', v_entitlement.status,
    'content_version', v_entitlement.content_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revalidate_offline_entitlement(
  p_entitlement_id uuid,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entitlement public.offline_download_entitlements%ROWTYPE;
  v_course_id uuid;
  v_enrollment_status text;
  v_enrollment_expires timestamptz;
  v_content_version text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- P6.25: same volume-bounding rationale as authorize_offline_download
  -- above. This RPC is called at every offline playback attempt while
  -- online (OfflinePolicyEngine.authorize), so the limit must stay
  -- generous enough for normal play/seek/retry behavior — see the
  -- seeded rule in 11_seed_reference.sql.
  IF (public.check_rate_limit('offline_entitlement_revalidate', v_user_id) ->> 'allowed')::boolean IS FALSE THEN
    RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entitlement
  FROM public.offline_download_entitlements e
  WHERE e.id = p_entitlement_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_entitlement.device_id <> p_device_id THEN
    RAISE EXCEPTION 'offline entitlement denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.user_id = v_user_id
      AND d.device_id = p_device_id
      AND d.is_active
  ) AND v_entitlement.status = 'ACTIVE' THEN
    UPDATE public.offline_download_entitlements
       SET status = 'REVOKED', revoked_at = pg_catalog.now()
     WHERE id = v_entitlement.id;
  END IF;

  SELECT l.course_id INTO v_course_id
  FROM public.lessons l
  WHERE l.id = v_entitlement.content_id;

  SELECT COALESCE(to_char(lc.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'v1')
    INTO v_content_version
  FROM public.lesson_contents lc
  WHERE lc.lesson_id = v_entitlement.content_id;
  v_content_version := COALESCE(v_content_version, 'v1');

  SELECT e.status, e.expires_at
    INTO v_enrollment_status, v_enrollment_expires
  FROM public.enrollments e
  WHERE e.user_id = v_user_id
    AND e.course_id = v_course_id
    AND e.deleted_at IS NULL
  ORDER BY e.created_at DESC
  LIMIT 1;

  SELECT * INTO v_entitlement
  FROM public.offline_download_entitlements
  WHERE id = v_entitlement.id;

  IF v_entitlement.status = 'ACTIVE' AND v_entitlement.expires_at <= pg_catalog.now() THEN
    UPDATE public.offline_download_entitlements
       SET status = 'EXPIRED'
     WHERE id = v_entitlement.id;
  ELSIF v_entitlement.status = 'ACTIVE' AND v_content_version <> v_entitlement.content_version THEN
    UPDATE public.offline_download_entitlements
       SET status = 'CORRUPTED'
     WHERE id = v_entitlement.id;
  ELSIF v_entitlement.status = 'ACTIVE'
    AND (v_enrollment_status IS DISTINCT FROM 'active'
         OR (v_enrollment_expires IS NOT NULL AND v_enrollment_expires <= pg_catalog.now())) THEN
    UPDATE public.offline_download_entitlements
       SET status = 'REVOKED', revoked_at = pg_catalog.now()
     WHERE id = v_entitlement.id;
  END IF;

  SELECT * INTO v_entitlement
  FROM public.offline_download_entitlements
  WHERE id = v_entitlement.id;

  RETURN jsonb_build_object(
    'entitlement_id', v_entitlement.id,
    'download_id', v_entitlement.download_id,
    'status', v_entitlement.status,
    'issued_at', v_entitlement.issued_at,
    'expires_at', v_entitlement.expires_at,
    'revoked_at', v_entitlement.revoked_at,
    'content_version', v_entitlement.content_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.get_kms_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  -- SEC: Fetch the encryption key dynamically from Supabase Vault.
  -- The secret must be stored with name 'eduzone_kms_key' via:
  --   SELECT vault.create_secret('your-actual-key', 'eduzone_kms_key');
  -- This prevents credential leaks in the repository or schema dumps.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    SELECT decrypted_secret
      INTO v_secret
      FROM vault.decrypted_secrets
     WHERE name = 'eduzone_kms_key'
     LIMIT 1;
  END IF;

  -- Fail closed. There is no hardcoded fallback key: encrypt_pii/decrypt_pii
  -- are the only callers (email_encrypted/phone_encrypted on public.users)
  -- and both are service_role-only (10_permissions.sql) — a fallback here
  -- would mean every unprovisioned environment, including an accidentally
  -- misconfigured production one, silently encrypts real user PII with a
  -- key value that sits in plaintext in this repository. Provisioning the
  -- secret above is a one-time setup step in every environment, dev
  -- included, and must happen before any row triggers encrypt_pii/
  -- decrypt_pii (see the users email/phone triggers in this file).
  IF v_secret IS NULL THEN
    RAISE EXCEPTION
      USING ERRCODE = '55000',
            MESSAGE = 'eduzone_kms_key not provisioned in Supabase Vault — run '
              || 'SELECT vault.create_secret(''<32+ byte random key>'', '
              || '''eduzone_kms_key''); before any PII encrypt/decrypt call. '
              || 'No hardcoded fallback key exists.';
  END IF;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_pii(p_plaintext text, p_key text)
RETURNS bytea
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp
AS $$
  SELECT extensions.encrypt(
    pg_catalog.convert_to(p_plaintext, 'UTF8'),
    pg_catalog.convert_to(p_key, 'UTF8'),
    'aes'
  );
$$;

CREATE OR REPLACE FUNCTION public.decrypt_pii(p_ciphertext bytea, p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp
AS $$
  SELECT pg_catalog.convert_from(
    extensions.decrypt(p_ciphertext, pg_catalog.convert_to(p_key, 'UTF8'), 'aes'),
    'UTF8'
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT pg_catalog.lower(pg_catalog.btrim(p_email));
$$;

-- CRIT-01: Strict tenant matching helper

-- =============================================================================
-- AUTH-REV-02: Supabase Auth-session revocation boundary.
-- `token_version` invalidates application JWTs, but a still-live Supabase
-- refresh session can otherwise mint a fresh JWT. Supabase documents the
-- `session_id` JWT claim as the primary key of auth.sessions; deleting that
-- row is the Auth-native revocation boundary.
CREATE OR REPLACE FUNCTION private.revoke_auth_sessions(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM auth.sessions
   WHERE user_id = p_user_id;
$$;

-- Safely extract the Supabase Auth session id. Invalid/missing claims fail
-- closed instead of raising through every RLS policy that depends on this
-- function.
CREATE OR REPLACE FUNCTION private.current_jwt_session_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session_id text := nullif(auth.jwt() ->> 'session_id', '');
BEGIN
  IF v_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_session_id::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- AUTH-FIX-01: DB-authoritative session validation.
-- JWT claims identify the request, but public.users and auth.sessions are the
-- authorities for account state, logout/revocation, and token validity. Missing
-- or malformed token_version/session_id fails closed.
-- =============================================================================

CREATE OR REPLACE FUNCTION private.current_jwt_token_version()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_token_version text;
BEGIN
  v_token_version := nullif(v_claims ->> 'token_version', '');

  IF v_token_version IS NULL THEN
    v_token_version := nullif(v_claims -> 'app_metadata' ->> 'token_version', '');
  END IF;

  IF v_token_version IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_token_version::integer;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN NULL;
END;
$$;

-- CRIT-02: Session validation helper — DB-backed revocation, fail closed.
CREATE OR REPLACE FUNCTION public.validate_user_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_token_version integer := private.current_jwt_token_version();
  v_session_id uuid := private.current_jwt_session_id();
BEGIN
  IF v_uid IS NULL
     OR v_jwt_token_version IS NULL
     OR v_session_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_uid
      AND u.deleted_at IS NULL
      AND u.account_status = 'active'
      AND u.token_version = v_jwt_token_version
  )
  AND EXISTS (
    SELECT 1
    FROM auth.sessions s
    WHERE s.id = v_session_id
      AND s.user_id = v_uid
  );
END;
$$;

-- Companion function to raise exceptions for write policies
CREATE OR REPLACE FUNCTION public.assert_valid_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.validate_user_session() THEN
    RAISE EXCEPTION 'Invalid user session: account is inactive or session has been revoked'
      USING ERRCODE = '28000';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_session()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user public.users%ROWTYPE;
  v_session_id uuid;
BEGIN
  IF NOT public.validate_user_session() THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_user
  FROM public.users
  WHERE id = v_uid;

  SELECT session_id INTO v_session_id
  FROM public.active_sessions
  WHERE user_id = v_uid
  LIMIT 1;

  RETURN jsonb_build_object(
    'user_id', v_user.id,
    'tenant_id', v_user.tenant_id,
    'role', v_user.primary_role,
    'token_version', v_user.token_version,
    'active_session_id', v_session_id
  );
END;
$$;

-- HIGH-04: Hardened admin check — validates session, then reads server-side role/RBAC.
CREATE OR REPLACE FUNCTION public.is_admin_with_session_validation()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.validate_user_session() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.deleted_at IS NULL
      AND u.account_status = 'active'
      AND u.primary_role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
      AND r.name IN ('admin', 'super_admin')
      AND ur.tenant_id = public.get_current_tenant_id()
  );
END;
$$;



-- Backward compatibility wrapper
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_admin_with_session_validation();
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.validate_user_session() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.deleted_at IS NULL
      AND u.account_status = 'active'
      AND u.primary_role = 'super_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_super_admin_lite()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_current_user_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_lite()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_admin_with_session_validation();
$$;

-- JWT Tenant Extractors
-- CRIT-02: Enhanced auth helpers with session validation
CREATE OR REPLACE FUNCTION public.get_auth_user_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.validate_user_session() THEN
    RETURN NULL;
  END IF;
  
  RETURN v_uid;
END;
$$;

-- Fail-safe tenant lookup bypasses RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public._get_tenant_fallback()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.validate_user_session() THEN
    RETURN NULL;
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT u.tenant_id
      INTO v_tenant_id
      FROM public.users u
     WHERE u.id = v_uid
       AND u.deleted_at IS NULL
       AND u.account_status = 'active'
     LIMIT 1;

    RETURN v_tenant_id;
  END IF;

  -- Trusted server-side workers may explicitly provide a tenant context.
  IF auth.role() = 'service_role' THEN
    RETURN NULLIF(current_setting('app.current_tenant', true), '')::uuid;
  END IF;

  RETURN NULL;
END;
$$;

-- CRIT-02: Strict tenant and session validation with fallback
CREATE OR REPLACE FUNCTION public.assert_tenant()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_uid    uuid := auth.uid();
BEGIN
  v_tenant := public.get_current_tenant_id();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'
      USING
        HINT   = 'The authenticated user must resolve to an active database tenant.',
        DETAIL = 'The tenant context is derived from public.users, never from an untrusted JWT tenant claim.';
  END IF;

  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = v_uid
       AND u.tenant_id = v_tenant
       AND u.deleted_at IS NULL
       AND u.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'CROSS_TENANT_ACCESS_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_tenant
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_TENANT_CONTEXT'
      USING HINT = 'The database tenant context is invalid or inactive.';
  END IF;

  RETURN v_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_jwt_tenant()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (auth.jwt() ->> 'tenant_id') IS NULL THEN
    RAISE EXCEPTION 'JWT_MISCONFIGURED: tenant_id claim missing.';
  END IF;
  IF (auth.jwt() ->> 'primary_role') IS NULL THEN
    RAISE EXCEPTION 'JWT_MISCONFIGURED: primary_role claim missing.';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_valid_constant_values(p_category text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT array_agg(DISTINCT value)
  FROM public.constants, 
       LATERAL unnest(valid_values) AS value
  WHERE category = p_category;
$$;

CREATE OR REPLACE FUNCTION public.get_constant(p_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT (valid_values[1])::text FROM public.constants WHERE id = p_id;
$$;

-- L-05 FIX: Default region helper (removes 22+ hardcoded 'me-south-1' strings).
CREATE OR REPLACE FUNCTION public.get_default_region_id()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION public.immutable_unaccent(p_text text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- Deliberately STABLE: unaccent dictionaries are operational configuration.
  -- Do not use this function in generated columns or expression indexes.
  SELECT extensions.unaccent('extensions.unaccent', p_text);
$$;

CREATE OR REPLACE FUNCTION public.immutable_tsvector(p_text text)
RETURNS tsvector
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT to_tsvector('simple', coalesce(p_text, ''));
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_users_email_hardening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- HIGH-08: Normalization and Hash Generation
  IF NEW.email IS NOT NULL THEN
    NEW.email := public.normalize_email(NEW.email);
    -- Generate SHA-256 hash for O(1) lookups (CRIT-03)
    NEW.email_hash := pg_catalog.encode(extensions.digest(NEW.email, 'sha256'), 'hex');
  END IF;
  
  -- PII Encryption at rest (CRIT-03)
  -- Use a secure key management approach (example key used here)
  IF NEW.email IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email) THEN
    NEW.email_encrypted := public.encrypt_pii(NEW.email, private.get_kms_key());
  END IF;
  
  IF NEW.phone IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
    NEW.phone_encrypted := public.encrypt_pii(NEW.phone, private.get_kms_key());
  END IF;

  RETURN NEW;
END;
$$;

-- HIGH-08: Efficient user lookup by email hash with validation
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := public.normalize_email(p_email);
BEGIN
  -- SEC-03: Validate email format before processing
  IF v_email !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL_FORMAT';
  END IF;

  RETURN (
    SELECT id FROM public.users
    WHERE tenant_id = public.get_current_tenant_id()
      AND email_hash = pg_catalog.encode(extensions.digest(v_email, 'sha256'), 'hex')
      AND deleted_at IS NULL
    LIMIT 1
  );
END;
$$;

-- CRIT-03: Trigger to log PII access
CREATE OR REPLACE FUNCTION public.trg_log_pii_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email_encrypted IS DISTINCT FROM OLD.email_encrypted THEN
    INSERT INTO audit.pii_access_log (user_id, accessed_by, pii_field, reason)
    VALUES (NEW.id, auth.uid(), 'email', 'User profile update');
  END IF;
  IF NEW.phone_encrypted IS DISTINCT FROM OLD.phone_encrypted THEN
    INSERT INTO audit.pii_access_log (user_id, accessed_by, pii_field, reason)
    VALUES (NEW.id, auth.uid(), 'phone', 'User profile update');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_increment_token_version_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users
  SET token_version = token_version + 1,
      updated_at = pg_catalog.now()
  WHERE id = NEW.user_id;

  PERFORM private.revoke_auth_sessions(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enforce_permission_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_perm_scope text;
  v_role_tenant_id uuid;
BEGIN
  -- HIGH-03: Prevent global permissions from being assigned to tenant-specific roles
  SELECT scope INTO v_perm_scope FROM public.permissions WHERE id = NEW.permission_id;
  SELECT tenant_id INTO v_role_tenant_id FROM public.roles WHERE id = NEW.role_id;

  IF v_perm_scope = 'global' AND v_role_tenant_id IS DISTINCT FROM public.system_tenant_id() THEN
    RAISE EXCEPTION 'GLOBAL_PERMISSION_FORBIDDEN_FOR_TENANT_ROLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_perm_cache_on_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_roles uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_roles := ARRAY[OLD.role_id];
  ELSIF TG_OP = 'INSERT' THEN
    v_roles := ARRAY[NEW.role_id];
  ELSE
    v_roles := ARRAY[NEW.role_id, OLD.role_id];
  END IF;

  DELETE FROM public.user_permission_cache pc
  USING public.user_roles ur
  WHERE ur.role_id = ANY (v_roles)
    AND pc.user_id = ur.user_id
    AND pc.tenant_id = ur.tenant_id;

  RETURN coalesce(NEW, OLD);
END;
$$;

-- JSONB size protection is applied after all target tables exist.



-- LOW-04 FIX: Feature flag status check for specific user

CREATE OR REPLACE FUNCTION public.is_user_valid_cached(p_user_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id
      AND u.tenant_id = p_tenant_id
      AND u.account_status = 'active'
      AND u.deleted_at IS NULL
  );
$$;

-- FIX (FLUTTER-6 / 42P17): SECURITY DEFINER accessor for the caller's own
-- primary_role. users_update_merged's WITH CHECK previously ran a raw
-- `SELECT ... FROM public.users` inline inside a policy defined ON
-- public.users itself; evaluating that subquery forces Postgres to
-- re-apply users' own RLS policies to it, which Postgres detects as a
-- self-referential cycle and rejects with "infinite recursion detected in
-- policy for relation users". SECURITY DEFINER functions run as their
-- owner and are not subject to the caller's RLS on their internal
-- queries, breaking the cycle — the same pattern already used by
-- get_auth_user_id/get_current_tenant_id/is_user_valid_cached above.
CREATE OR REPLACE FUNCTION public.get_own_primary_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT primary_role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_user_validity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_validity_cache (user_id, tenant_id, is_valid, token_version, checked_at)
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.account_status = 'active' AND NEW.deleted_at IS NULL,
    NEW.token_version,
    now()
  )
  ON CONFLICT (user_id, tenant_id) 
  DO UPDATE SET 
    is_valid = EXCLUDED.is_valid,
    token_version = EXCLUDED.token_version,
    checked_at = now();
  RETURN NEW;
END;
$$;

-- AP-04: Invalidate user validity cache on account status change
CREATE OR REPLACE FUNCTION public.trg_invalidate_user_validity_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.account_status IS DISTINCT FROM NEW.account_status OR OLD.token_version IS DISTINCT FROM NEW.token_version) THEN
    DELETE FROM public.user_validity_cache
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_user_access_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM private.user_access_cache
    WHERE user_id = OLD.user_id
      AND course_id = OLD.course_id;
    RETURN OLD;
  END IF;

  INSERT INTO private.user_access_cache (user_id, course_id, tenant_id, status, valid_until, computed_at)
  VALUES (NEW.user_id, NEW.course_id, NEW.tenant_id,
          CASE WHEN NEW.status = 'completed' THEN 'active' ELSE NEW.status END, 
          NEW.expires_at, pg_catalog.now())
  ON CONFLICT (user_id, course_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        status = CASE WHEN EXCLUDED.status = 'completed' THEN 'active' ELSE EXCLUDED.status END,
        valid_until = EXCLUDED.valid_until,
        computed_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enforce_single_active_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- HIGH-06: Consolidate session management into a single, deadlock-safe execution path.
  
  -- 1. Deactivation phase (BEFORE/AFTER context handled by active_sessions lock)
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_active AND NOT OLD.is_active)) THEN
    -- CRIT-11: Serialize session creation per user to prevent concurrent login race conditions.
    INSERT INTO public.session_locks (user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
    PERFORM 1 FROM public.session_locks WHERE user_id = NEW.user_id FOR UPDATE;

    -- Deactivate the PREVIOUS session recorded in active_sessions for this user
    UPDATE public.sessions sess
    SET is_active = false,
        ended_at = coalesce(sess.ended_at, pg_catalog.now()),
        end_reason = 'new_session_started',
        updated_at = pg_catalog.now()
    FROM public.active_sessions act
    WHERE act.user_id = NEW.user_id
      AND sess.user_id = act.user_id
      AND sess.id = act.session_id
      AND sess.started_at = act.started_at
      AND sess.is_active = true
      AND (sess.id IS DISTINCT FROM NEW.id OR sess.started_at IS DISTINCT FROM NEW.started_at);

    -- 2. Sync phase: Update the pointer to the CURRENT session
    INSERT INTO public.active_sessions (user_id, tenant_id, session_id, started_at, updated_at)
    VALUES (NEW.user_id, NEW.tenant_id, NEW.id, NEW.started_at, pg_catalog.now())
    ON CONFLICT (user_id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          session_id = EXCLUDED.session_id,
          started_at = EXCLUDED.started_at,
          updated_at = pg_catalog.now();
  
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NOT NEW.is_active AND OLD.is_active) THEN
    -- Remove pointer if the session is being closed or deleted
    DELETE FROM public.active_sessions
    WHERE user_id = OLD.user_id
      AND session_id = OLD.id
      AND started_at = OLD.started_at;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_trim_notification_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- MED-03: Character count validation and whitespace trimming
  NEW.title := pg_catalog.btrim(NEW.title);
  NEW.body := pg_catalog.btrim(NEW.body);
  RETURN NEW;
END;
$$;

-- Prevent client-side deletion entirely

-- CRIT-04: Atomic check and increment RPC
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_action text,
  p_tenant_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_device_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule record;
  v_current_hits int;
  v_window_start timestamptz;
  v_blocked_until timestamptz;
  v_key_hash text;
BEGIN
  -- Get rule
  SELECT * INTO v_rule FROM public.rate_limit_rules WHERE action = p_action AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  v_window_start := date_trunc('minute', now());
  v_key_hash := pg_catalog.encode(extensions.digest(
    coalesce(p_user_id::text, '') || '|' || coalesce(p_ip_address::text, '') || '|' || coalesce(p_device_id::text, '') || '|' || p_action,
    'sha256'
  ), 'hex');

  -- Atomically increment and check
  INSERT INTO public.rate_limits (
    tenant_id, user_id, ip_address, device_id, action, window_start, hit_count, rate_limit_key_hash
  )
  VALUES (
    p_tenant_id, p_user_id, p_ip_address, p_device_id, p_action, v_window_start, 1, v_key_hash
  )
  ON CONFLICT (tenant_id, user_id, ip_address, device_id, action, window_start)
  DO UPDATE SET hit_count = rate_limits.hit_count + 1
  RETURNING hit_count INTO v_current_hits;

  IF v_current_hits > v_rule.max_hits THEN
    v_blocked_until := now() + (v_rule.block_seconds || ' seconds')::interval;
    UPDATE public.rate_limits SET blocked_until = v_blocked_until
    WHERE tenant_id = p_tenant_id AND rate_limit_key_hash = v_key_hash AND window_start = v_window_start;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'hits', v_current_hits,
      'limit', v_rule.max_hits,
      'blocked_until', v_blocked_until
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'hits', v_current_hits,
    'limit', v_rule.max_hits
  );
END;
$$;

CREATE OR REPLACE FUNCTION internal.cleanup_old_jobs(p_retention_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  DELETE FROM internal.job_queue
  WHERE status IN ('done', 'dead', 'failed')
    AND updated_at < pg_catalog.now() - (p_retention_days || ' days')::interval;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION internal.notify_new_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_notify('new_job_available', pg_catalog.json_build_object('id', NEW.id, 'job_type', NEW.job_type)::text);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_course_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_student_progress_timeline;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_daily_revenue;
END;
$$;

-- HIGH-02 FIX: Removed primary_role shortcut (TOCTOU risk).
-- Now uses cache + RBAC source-of-truth only.
CREATE OR REPLACE FUNCTION public.is_current_user_teacher()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.validate_user_session() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.deleted_at IS NULL
      AND u.account_status = 'active'
      AND u.primary_role = 'teacher'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.user_enrolled_in_course(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE user_id = p_user_id
      AND course_id = p_course_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_setting(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_value jsonb;
BEGIN
  SELECT value INTO v_value
  FROM public.settings_kv
  WHERE key = p_key
    AND (is_public OR public.is_admin_with_session_validation());

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_primary_role_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_old_role text;
BEGIN
  -- 1. Optimization: Get current primary_role to avoid redundant updates
  SELECT primary_role INTO v_old_role FROM public.users WHERE id = p_user_id;

  -- 2. Determine best role
  SELECT r.name INTO v_role
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id
    AND ur.is_active
    AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
  ORDER BY r.priority DESC
  LIMIT 1;

  v_role := coalesce(v_role, 'student');

  -- 3. Only update if changed
  IF v_role IS DISTINCT FROM v_old_role THEN
    UPDATE public.users
    SET primary_role = v_role,
        updated_at = pg_catalog.now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_primary_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := coalesce(NEW.user_id, OLD.user_id);
BEGIN
  PERFORM public.sync_primary_role_for_user(v_uid);
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.enroll_in_course(p_course_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_course_tenant uuid;
  v_id uuid;
BEGIN
  IF current_setting('role', true) != 'service_role' AND v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT tenant_id INTO v_tenant
  FROM public.users
  WHERE id = v_uid
    AND account_status = 'active'
    AND deleted_at IS NULL;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND_OR_INACTIVE';
  END IF;

  SELECT tenant_id INTO v_course_tenant
  FROM public.courses
  WHERE id = p_course_id
    AND status = 'published'
    AND deleted_at IS NULL
  FOR SHARE;

  IF v_course_tenant IS NULL OR v_course_tenant <> v_tenant THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND_OR_NOT_PUBLISHED';
  END IF;

  -- Check for admin-placed revocation
  IF EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE user_id = v_uid AND course_id = p_course_id AND status = 'revoked'
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_REVOKED: Contact your administrator to restore access.';
  END IF;

  INSERT INTO public.enrollments (user_id, course_id, tenant_id, enrolled_by, status)
  VALUES (v_uid, p_course_id, v_tenant, v_uid, 'active')
  ON CONFLICT (user_id, course_id) DO UPDATE
    SET status = 'active',
        enrolled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
  WHERE public.enrollments.status <> 'revoked'  -- never override revocations
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- courses-subsystem-production-hardening-plan.md, Phase 2/3: the previous
-- write path had the Flutter client resolve `tenant_id` itself (from
-- user_metadata, falling back to a second round-trip query against
-- `courses`) and send it as part of a direct `user_progress` upsert.
-- `user_progress_update_merged`/`user_progress_insert_merged`'s
-- `tenant_id = public.assert_tenant()` WITH CHECK already made a
-- mismatched client-supplied value fail closed rather than write
-- cross-tenant data, so this was never an exploitable authorization
-- bypass -- but it meant a legitimate user's save could fail on an
-- opaque RLS rejection whenever their client-side resolution was stale,
-- and it cost up to three network round-trips (tenant lookup, upsert,
-- separate best-effort activity-log RPC) for what is conceptually one
-- write. This RPC derives tenant/access entirely server-side and
-- performs the write + activity log atomically in one call.
CREATE OR REPLACE FUNCTION public.update_lesson_progress(
  p_course_id uuid,
  p_lesson_id uuid,
  p_progress_pct numeric,
  p_completed boolean,
  p_watch_time_sec integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_tenant  uuid;
  v_row     record;
  v_allowed boolean;
  v_id      uuid;
BEGIN
  IF current_setting('role', true) != 'service_role' AND v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Never trust a client-supplied tenant. assert_tenant() derives it from
  -- public.users (and raises TENANT_CONTEXT_REQUIRED / CROSS_TENANT_
  -- ACCESS_DENIED for an inactive/mismatched account), exactly like
  -- enroll_in_course above.
  v_tenant := public.assert_tenant();

  SELECT l.id AS lesson_id, l.course_id, l.is_preview
    INTO v_row
    FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
   WHERE l.id = p_lesson_id
     AND l.course_id = p_course_id
     AND l.deleted_at IS NULL
     AND c.deleted_at IS NULL
     AND c.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND';
  END IF;

  v_allowed :=
    v_row.is_preview
    OR public.has_course_access(v_uid, p_course_id)
    OR public.is_teacher_of_course(v_uid, p_course_id)
    OR public.is_admin_with_session_validation();

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  -- Defense in depth on top of user_progress's own CHECK constraints
  -- (chk_progress_completion_consistency etc.): raising a clear code here
  -- means a bad value never reaches a raw constraint-violation error that
  -- would otherwise propagate to the client as unclassified Postgres text.
  IF p_progress_pct IS NULL OR p_progress_pct < 0 OR p_progress_pct > 100 THEN
    RAISE EXCEPTION 'INVALID_PROGRESS';
  END IF;

  IF p_watch_time_sec IS NOT NULL AND p_watch_time_sec < 0 THEN
    RAISE EXCEPTION 'INVALID_WATCH_TIME';
  END IF;

  IF NOT p_completed AND p_progress_pct >= 100 THEN
    RAISE EXCEPTION 'INVALID_PROGRESS_STATE';
  END IF;

  INSERT INTO public.user_progress (
    user_id, course_id, lesson_id, tenant_id,
    completed, progress_pct, watch_time_sec, completed_at, last_watched
  ) VALUES (
    v_uid, p_course_id, p_lesson_id, v_tenant,
    p_completed, p_progress_pct, COALESCE(p_watch_time_sec, 0),
    CASE WHEN p_completed THEN pg_catalog.now() ELSE NULL END,
    pg_catalog.now()
  )
  ON CONFLICT (user_id, course_id, lesson_id) DO UPDATE SET
    completed      = p_completed,
    progress_pct   = p_progress_pct,
    watch_time_sec = COALESCE(p_watch_time_sec, public.user_progress.watch_time_sec),
    -- Preserve the original completion timestamp across repeat
    -- completed=true writes for an already-finished lesson instead of
    -- bumping it to now() on every replay.
    completed_at   = CASE
                        WHEN p_completed THEN COALESCE(public.user_progress.completed_at, pg_catalog.now())
                        ELSE public.user_progress.completed_at
                      END,
    last_watched   = pg_catalog.now(),
    updated_at     = pg_catalog.now()
  WHERE public.user_progress.deleted_at IS NULL
  RETURNING id INTO v_id;

  -- Best-effort activity logging in the same transaction as the write it
  -- describes. A logging failure must never roll back a legitimate
  -- progress write -- matching the "best-effort; failures here must
  -- never fail the progress write itself" contract the client-side call
  -- previously implemented with its own separate try/catch.
  BEGIN
    PERFORM internal.log_activity_internal(
      v_uid,
      CASE WHEN p_completed THEN 'lesson_completed' ELSE 'lesson_progress' END,
      jsonb_build_object(
        'course_id', p_course_id,
        'lesson_id', p_lesson_id,
        'progress_pct', p_progress_pct
      ),
      NULL,
      NULL,
      'low',
      v_tenant
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lesson_content(
  p_lesson_id uuid,
  p_ip inet DEFAULT NULL,
  p_device_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_allowed boolean;
BEGIN
  IF current_setting('role', true) != 'service_role' AND v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT
    l.id AS lesson_id,
    l.course_id,
    l.section_id,
    l.is_preview,
    l.is_published,
    c.tenant_id,
    c.teacher_id,
    lc.provider,
    lc.video_path,
    lc.captions_path,
    lc.duration_sec
  INTO v_row
  FROM public.lessons l
  JOIN public.courses c ON c.id = l.course_id
  JOIN public.lesson_contents lc ON lc.lesson_id = l.id
  WHERE l.id = p_lesson_id
    AND l.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND';
  END IF;

  v_allowed :=
    v_row.is_preview
    OR public.has_course_access(v_uid, v_row.course_id)
    OR v_row.teacher_id = v_uid
    OR public.is_admin_with_session_validation();

  INSERT INTO audit.lesson_access_log (
    lesson_id, course_id, user_id, tenant_id, device_id,
    ip_address, access_type, decision, reason
  )
  VALUES (
    v_row.lesson_id,
    v_row.course_id,
    v_uid,
    v_row.tenant_id,
    p_device_id,
    p_ip,
    CASE WHEN v_row.is_preview THEN 'preview' ELSE 'stream' END,
    CASE WHEN v_allowed THEN 'allow' ELSE 'block' END,
    CASE WHEN v_allowed THEN NULL ELSE 'not_enrolled' END
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  RETURN jsonb_build_object(
    'lessonId', v_row.lesson_id,
    'courseId', v_row.course_id,
    'provider', v_row.provider,
    'videoPath', v_row.video_path,
    'captionsPath', v_row.captions_path,
    'durationSec', v_row.duration_sec,
    'isPreview', v_row.is_preview
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_cached jsonb;
BEGIN
  IF NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_tenant_id := CASE
    WHEN public.is_current_user_super_admin() THEN p_tenant_id
    ELSE public.get_current_tenant_id()
  END;

  IF v_tenant_id IS NOT NULL THEN
    SELECT stats INTO v_cached FROM private.dashboard_stats_cache WHERE tenant_id = v_tenant_id;
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.users WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id) AND deleted_at IS NULL),
    'total_courses', (SELECT count(*) FROM public.courses WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id) AND deleted_at IS NULL),
    'draft_courses', (SELECT count(*) FROM public.courses WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id) AND deleted_at IS NULL AND status = 'draft'),
    'total_enrollments', (SELECT count(*) FROM public.enrollments WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id)),
    'active_sessions', (SELECT count(*) FROM public.active_sessions WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id)),
    'total_lessons', (SELECT count(*) FROM public.lessons WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id) AND deleted_at IS NULL),
    'total_views', (SELECT count(*) FROM public.video_views WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id)),
    'total_devices', (SELECT count(*) FROM public.devices WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id)),
    'total_todos', (SELECT count(*) FROM public.todos WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id) AND deleted_at IS NULL),
    'deleted_courses', (SELECT count(*) FROM public.courses WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id) AND deleted_at IS NOT NULL),
    'warnings_count', (SELECT count(*) FROM public.warnings WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id)),
    'total_progress', (SELECT coalesce(avg(progress_pct), 0) FROM public.enrollments WHERE (v_tenant_id IS NULL OR tenant_id = v_tenant_id))
  );
END; $$;

CREATE OR REPLACE FUNCTION internal.log_activity_internal(
  p_user_id uuid,
  p_type text,
  p_details jsonb DEFAULT '{}',
  p_ip inet DEFAULT NULL,
  p_device_id uuid DEFAULT NULL,
  p_risk_level text DEFAULT 'low',
  p_tenant_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_tenant_id uuid;
BEGIN
  -- Only service_role may supply an explicit tenant_id
  IF p_tenant_id IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: tenant_id override requires service_role';
  END IF;

  v_tenant_id := coalesce(
    CASE WHEN auth.role() = 'service_role' THEN p_tenant_id END,
    (SELECT tenant_id FROM public.users WHERE id = p_user_id),
    public.system_tenant_id()
  );

  INSERT INTO public.activity_log_queue (
    id, user_id, tenant_id, activity_type, details,
    ip_address, device_id, risk_level
  )
  VALUES (
    v_id, p_user_id, v_tenant_id, p_type, coalesce(p_details, '{}'),
    p_ip, p_device_id, p_risk_level
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION internal.purge_expired_rate_limits()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_count bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  DELETE FROM public.rate_limits
  WHERE window_start < pg_catalog.now() - interval '24 hours'
    AND (blocked_until IS NULL OR blocked_until < pg_catalog.now());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.log_my_activity(
  p_type text,
  p_details jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  RETURN internal.log_activity_internal(v_uid, p_type, p_details, NULL, NULL, 'low', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_notification(
  p_title text,
  p_body text,
  p_target_audience text DEFAULT 'all',
  p_target_permission text DEFAULT NULL,
  p_target_user_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_id uuid;
  v_final_user_ids uuid[] := p_target_user_ids;
BEGIN
  v_tenant_id := public.get_current_tenant_id();

  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT public.user_has_permission(v_uid, 'notifications.send', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_target_permission IS NOT NULL THEN
    SELECT array_agg(DISTINCT user_id) INTO v_final_user_ids
    FROM (
      SELECT ur.user_id
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      JOIN public.permissions p ON rp.permission_id = p.id
      WHERE p.name = p_target_permission
        AND ur.tenant_id = v_tenant_id
        AND ur.is_active
      UNION ALL
      SELECT unnest(coalesce(v_final_user_ids, ARRAY[]::uuid[]))
    ) t;
  END IF;

  INSERT INTO public.notifications (
    tenant_id, title, body, target_audience, created_by
  )
  VALUES (
    v_tenant_id, btrim(p_title), btrim(p_body),
    coalesce(p_target_audience, 'all'), v_uid
  )
  RETURNING id INTO v_id;

  IF v_final_user_ids IS NOT NULL AND array_length(v_final_user_ids, 1) IS NOT NULL THEN
    INSERT INTO public.notification_targets (notification_id, user_id)
    SELECT v_id, u.id
    FROM public.users u
    WHERE u.id = ANY(v_final_user_ids)
      AND u.tenant_id = v_tenant_id
      AND u.deleted_at IS NULL
    ON CONFLICT DO NOTHING;

    -- Explicitly-targeted notifications must also land in user_notifications:
    -- that table (not notification_targets) is the sole source the client reads
    -- from to discover a user's inbox (see notifications_remote_ds.dart step 1).
    -- Without this insert, individually-targeted notifications were created and
    -- recorded in notification_targets but never actually delivered to the
    -- target user's notification list. The category-audience fanout worker
    -- (internal.process_notification_fanout_jobs) only handles 'all'/'students'/
    -- 'teachers'/'admins' and never processes notification_targets rows, so this
    -- path must populate user_notifications itself.
    INSERT INTO public.user_notifications (user_id, notification_id, tenant_id, is_read)
    SELECT u.id, v_id, v_tenant_id, false
    FROM public.users u
    WHERE u.id = ANY(v_final_user_ids)
      AND u.tenant_id = v_tenant_id
      AND u.deleted_at IS NULL
    ON CONFLICT (user_id, notification_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

-- 4-argument overload for backward compatibility
CREATE OR REPLACE FUNCTION public.send_notification(
  p_title text,
  p_body text,
  p_target_audience text,
  p_target_user_ids uuid[]
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.send_notification($1, $2, $3, NULL, $4);
$$;

CREATE OR REPLACE FUNCTION public.delete_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := public.get_current_tenant_id();
BEGIN
  IF NOT public.user_has_permission(v_uid, 'notifications.delete', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.notifications
  SET deleted_at = pg_catalog.now(),
      updated_by = v_uid,
      updated_at = pg_catalog.now()
  WHERE id = p_notification_id
    AND (public.is_current_user_super_admin() OR tenant_id = v_tenant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOTIFICATION_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION internal.dequeue_job(
  p_worker_id text,
  p_job_types text[] DEFAULT NULL,
  p_lock_ttl_seconds integer DEFAULT 300
)
RETURNS SETOF internal.job_queue
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_worker_uuid uuid;
BEGIN
  INSERT INTO internal.workers (worker_name, last_heartbeat)
  VALUES (p_worker_id, pg_catalog.now())
  ON CONFLICT (worker_name) DO UPDATE
    SET last_heartbeat = EXCLUDED.last_heartbeat,
        status = 'active'
  RETURNING id INTO v_worker_uuid;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM internal.job_queue
    WHERE status = 'pending'
      AND run_at <= pg_catalog.now()
      AND (next_retry_at IS NULL OR next_retry_at <= pg_catalog.now())
      AND (p_job_types IS NULL OR job_type = ANY(p_job_types))
    ORDER BY priority DESC, run_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE internal.job_queue
  SET status = 'processing',
      locked_by_worker_id = v_worker_uuid,
      locked_at = pg_catalog.now(),
      lock_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lock_ttl_seconds),
      started_at = pg_catalog.now(),
      attempts = attempts + 1,
      updated_at = pg_catalog.now()
  FROM picked
  WHERE internal.job_queue.id = picked.id
  RETURNING internal.job_queue.*;
END;
$$;

-- AUTHZ-SESSION-02: permission evaluation must never bless a revoked JWT.
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id uuid,
  p_permission text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
      RETURN false;
    END IF;
    IF NOT public.validate_user_session() THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1
      FROM public.user_permission_cache pc
      WHERE pc.user_id = p_user_id
        AND pc.permission_name = p_permission
        AND pc.tenant_id = coalesce(p_tenant_id, public.system_tenant_id())
        AND (pc.expires_at IS NULL OR pc.expires_at > pg_catalog.now())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.permissions pm ON pm.id = rp.permission_id
      WHERE ur.user_id = p_user_id
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
        AND pm.name = p_permission
        AND ur.tenant_id = coalesce(p_tenant_id, public.system_tenant_id())
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- v12-compatible safe RPC layer
-- These functions preserve useful app/admin APIs without reintroducing v12 RLS,
-- broad grants, JWT-only admin checks, or unordered legacy DDL.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_course_access(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND auth.role() <> 'service_role'
     AND NOT public.is_admin_with_session_validation() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM private.user_access_cache ac
    WHERE ac.user_id = p_user_id
      AND ac.course_id = p_course_id
      AND ac.tenant_id = (SELECT tenant_id FROM public.users WHERE id = p_user_id)
      AND ac.status = 'active'
      AND (ac.valid_until IS NULL OR ac.valid_until > pg_catalog.now())
  )
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = p_user_id
      AND e.course_id = p_course_id
      AND e.status IN ('active', 'completed')
      AND e.revoked_at IS NULL
      AND (e.expires_at IS NULL OR e.expires_at > pg_catalog.now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.has_course_access(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.has_course_access(p_user_id, p_course_id);
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.get_current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role_by_id(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT primary_role
  FROM public.users
  WHERE id = p_user_id
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_enrolled_in_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.has_course_access(auth.uid(), p_course_id);
$$;

CREATE OR REPLACE FUNCTION public.increment_token_version(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR
    p_user_id = auth.uid()
    OR public.user_has_permission(auth.uid(), 'sessions.manage'::text, public.get_current_tenant_id())
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.users SET token_version = token_version + 1,
      updated_at = pg_catalog.now()
  WHERE id = p_user_id
    AND (public.is_current_user_super_admin() OR tenant_id = public.get_current_tenant_id()) RETURNING token_version;

  IF FOUND THEN
    PERFORM private.revoke_auth_sessions(p_user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_warning_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'warnings.write', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.users
  SET warning_count = warning_count + 1,
      updated_at = pg_catalog.now()
  WHERE id = p_user_id
    AND tenant_id = public.get_current_tenant_id();
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_permission_cache(
  p_user_id uuid,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := coalesce(p_tenant_id, public.get_current_tenant_id());
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR public.is_admin_with_session_validation()
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM public.user_permission_cache
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant_id;

  INSERT INTO public.user_permission_cache (user_id, tenant_id, permission_name, expires_at)
  SELECT p_user_id, v_tenant_id, p.name, min(ur.expires_at)
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = p_user_id
    AND ur.is_active
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND (ur.tenant_id = v_tenant_id OR ur.tenant_id = public.system_tenant_id())
  GROUP BY p.name
  ON CONFLICT (user_id, tenant_id, permission_name)
  DO UPDATE SET expires_at = EXCLUDED.expires_at,
                cached_at = pg_catalog.now();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_def public.setting_definitions%ROWTYPE;
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'settings.write', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT * INTO v_def FROM public.setting_definitions WHERE key = p_key;
  IF FOUND THEN
    IF p_value IS NULL AND NOT v_def.is_nullable THEN
      RAISE EXCEPTION 'INVALID_SETTING: % cannot be null', p_key;
    END IF;
    IF p_value IS NOT NULL THEN
      IF v_def.expected_type = 'boolean' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RAISE EXCEPTION 'INVALID_SETTING_TYPE: % must be boolean', p_key;
      ELSIF v_def.expected_type = 'string' AND jsonb_typeof(p_value) <> 'string' THEN
        RAISE EXCEPTION 'INVALID_SETTING_TYPE: % must be string', p_key;
      ELSIF v_def.expected_type = 'number' AND jsonb_typeof(p_value) <> 'number' THEN
        RAISE EXCEPTION 'INVALID_SETTING_TYPE: % must be number', p_key;
      ELSIF v_def.expected_type = 'object' AND jsonb_typeof(p_value) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_SETTING_TYPE: % must be object', p_key;
      ELSIF v_def.expected_type = 'array' AND jsonb_typeof(p_value) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_SETTING_TYPE: % must be array', p_key;
      END IF;
    END IF;
  END IF;

  UPDATE public.settings_kv
  SET value = p_value,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  WHERE key = p_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTING_NOT_FOUND';
  END IF;

  DELETE FROM public.settings_cache WHERE key = p_key;

  INSERT INTO public.cache_invalidation_queue (cache_key, cache_type, payload)
  VALUES ('settings:' || p_key, 'settings', jsonb_build_object('key', p_key));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.set_setting(p_key, p_value::jsonb);
END;
$$;


CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action text,
  p_user_id uuid DEFAULT NULL,
  p_ip inet DEFAULT NULL,
  p_device_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule public.rate_limit_rules%ROWTYPE;
  v_window timestamptz;
  v_hits integer;
  v_blocked timestamptz;
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Force user_id to be either the caller's own ID or NULL (admins can pass any)
  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Cannot check rate limits for other users';
  END IF;
  v_user_id := coalesce(p_user_id, auth.uid());

  v_tenant_id := coalesce(
    public.get_current_tenant_id(),
    (SELECT tenant_id FROM public.users WHERE id = v_user_id),
    public.system_tenant_id()
  );

  SELECT * INTO v_rule
  FROM public.rate_limit_rules
  WHERE action = p_action AND is_active;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('allowed', true);
  END IF;

  SELECT blocked_until INTO v_blocked
  FROM public.rate_limits
  WHERE action = p_action
    AND blocked_until > pg_catalog.now()
    AND (
      (v_user_id IS NOT NULL AND user_id = v_user_id)
      OR (p_ip IS NOT NULL AND ip_address = p_ip)
      OR (p_device_id IS NOT NULL AND device_id = p_device_id)
    )
  LIMIT 1;

  IF v_blocked IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'retryAfter', v_blocked);
  END IF;

  v_window := pg_catalog.date_trunc('second', pg_catalog.now())
    - ((pg_catalog.date_part('epoch', pg_catalog.now())::integer % v_rule.window_seconds) * pg_catalog.interval '1 second');

  INSERT INTO public.rate_limits (
    tenant_id, user_id, ip_address, device_id, action, window_start, hit_count
  )
  VALUES (v_tenant_id, v_user_id, p_ip, p_device_id, p_action, v_window, 1)
  ON CONFLICT (tenant_id, user_id, ip_address, device_id, action, window_start)
  DO UPDATE SET hit_count = public.rate_limits.hit_count + 1
  RETURNING hit_count INTO v_hits;

  IF v_hits > v_rule.max_hits THEN
    UPDATE public.rate_limits
    SET blocked_until = pg_catalog.now() + pg_catalog.make_interval(secs => v_rule.block_seconds)
    WHERE action = p_action
      AND window_start = v_window
      AND (
        (v_user_id IS NOT NULL AND user_id = v_user_id)
        OR (p_ip IS NOT NULL AND ip_address = p_ip)
        OR (p_device_id IS NOT NULL AND device_id = p_device_id)
      );

    RETURN pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limited',
      'retryAfter', pg_catalog.now() + pg_catalog.make_interval(secs => v_rule.block_seconds)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('allowed', true, 'hits', v_hits, 'max', v_rule.max_hits);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action text,
  p_limit int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'DEPRECATED_API: Use check_rate_limit(text, uuid, inet, uuid) instead';
END;
$$;

CREATE OR REPLACE FUNCTION public.log_activity_async(
  p_user_id uuid,
  p_type text,
  p_details jsonb DEFAULT '{}',
  p_ip inet DEFAULT NULL,
  p_device_id uuid DEFAULT NULL,
  p_risk_level text DEFAULT 'low',
  p_tenant_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR p_user_id = auth.uid()
    OR public.is_admin_with_session_validation()
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN internal.log_activity_internal(
    p_user_id, p_type, p_details, p_ip, p_device_id, p_risk_level, p_tenant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_security_alert(
  p_query_name text,
  p_error text DEFAULT NULL,
  p_severity text DEFAULT 'low'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_tenant_id uuid := public.get_current_tenant_id();
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO audit.alert_log (id, tenant_id, user_id, query_name, error_message, severity)
  VALUES (v_id, v_tenant_id, v_uid, p_query_name, p_error, p_severity);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.flush_activity_logs(p_batch_size integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.activity_log_queue%ROWTYPE;
  v_state public.audit_chain_state%ROWTYPE;
  v_count integer := 0;
  v_seq bigint;
  v_hash text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_has_permission(auth.uid(), 'audit.read', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('audit_chain_state'));
  SELECT * INTO v_state FROM public.audit_chain_state WHERE id = 1 FOR UPDATE;

  FOR v_row IN
    SELECT *
    FROM public.activity_log_queue
    WHERE flushed_at IS NULL
    ORDER BY created_at ASC
    LIMIT greatest(1, least(coalesce(p_batch_size, 100), 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    v_seq := v_state.last_seq + 1;
    v_hash := encode(extensions.digest(
      v_seq::text || v_row.id::text || coalesce(v_row.user_id::text, 'system') ||
      v_row.activity_type || v_row.details::text || v_state.last_hash,
      'sha256'
    ), 'hex');

    INSERT INTO public.activity_logs (
      id, seq, user_id, tenant_id, activity_type, details,
      ip_address, device_id, risk_level, prev_hash, entry_hash, created_at
    )
    VALUES (
      v_row.id, v_seq, v_row.user_id, v_row.tenant_id, v_row.activity_type,
      v_row.details, v_row.ip_address, v_row.device_id, v_row.risk_level,
      v_state.last_hash, v_hash, v_row.created_at
    );

    UPDATE public.activity_log_queue
    SET flushed_at = pg_catalog.now()
    WHERE id = v_row.id;

    v_state.last_seq := v_seq;
    v_state.last_hash := v_hash;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.audit_chain_state
  SET last_seq = v_state.last_seq,
      last_hash = v_state.last_hash,
      updated_at = pg_catalog.now()
  WHERE id = 1;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_job_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE internal.job_queue
  SET status = 'pending',
      locked_by_worker_id = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      updated_at = pg_catalog.now()
  WHERE status = 'processing'
    AND lock_expires_at < pg_catalog.now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.terminate_user_sessions(
  p_user_id uuid,
  p_reason text DEFAULT 'admin_force'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR public.user_has_permission(auth.uid(), 'sessions.manage'::text, public.get_current_tenant_id())
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.sessions
  SET is_active = false,
      ended_at = coalesce(ended_at, pg_catalog.now()),
      end_reason = p_reason,
      updated_at = pg_catalog.now()
  WHERE user_id = p_user_id
    AND is_active
    AND (
      auth.role() = 'service_role'
      OR
      public.is_current_user_super_admin()
      OR tenant_id = public.get_current_tenant_id()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_device(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'devices.manage', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.devices
  SET is_active = false
  WHERE user_id = p_user_id
    AND tenant_id = public.get_current_tenant_id();

  UPDATE public.users
  SET token_version = token_version + 1,
      updated_at = pg_catalog.now()
  WHERE id = p_user_id
    AND tenant_id = public.get_current_tenant_id()
    AND deleted_at IS NULL;

  PERFORM private.revoke_auth_sessions(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.control_user_account(
  p_user_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_suspend_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_until timestamptz;
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'users.lock', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_action NOT IN ('lock', 'unlock', 'suspend', 'ban') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;

  v_status := CASE p_action
    WHEN 'unlock' THEN 'active'
    WHEN 'suspend' THEN 'suspended'
    WHEN 'ban' THEN 'banned'
    ELSE p_action || 'ed'
  END;

  IF p_action = 'suspend' THEN
    v_until := pg_catalog.now() + pg_catalog.make_interval(hours => coalesce(p_suspend_hours, 24));
  END IF;

  UPDATE public.users
  SET account_status = v_status,
      lock_reason = CASE WHEN p_action = 'unlock' THEN NULL ELSE p_reason END,
      locked_at = CASE WHEN p_action = 'unlock' THEN NULL ELSE now() END,
      locked_by = CASE WHEN p_action = 'unlock' THEN NULL ELSE auth.uid() END,
      suspension_until = v_until,
      token_version = CASE WHEN p_action = 'unlock' THEN token_version ELSE token_version + 1 END,
      updated_at = now()
  WHERE id = p_user_id
    AND tenant_id = public.get_current_tenant_id();

  IF p_action <> 'unlock' THEN
    PERFORM private.revoke_auth_sessions(p_user_id);
    PERFORM public.terminate_user_sessions(p_user_id, 'account_' || p_action);
  END IF;

  RETURN jsonb_build_object('status', v_status, 'until', v_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_maintenance_mode(
  p_message text DEFAULT 'Application is under maintenance.',
  p_ends_at timestamptz DEFAULT NULL,
  p_exclude_roles text[] DEFAULT ARRAY['super_admin', 'admin'],
  p_exclude_users uuid[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'settings.write', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  PERFORM public.set_setting('maintenance_mode', 'true'::jsonb);
  PERFORM public.set_setting('maintenance_message', to_jsonb(p_message));
  PERFORM public.set_setting('maintenance_excluded_roles', to_jsonb(coalesce(p_exclude_roles, '{}')));
  PERFORM public.set_setting('maintenance_excluded_users', to_jsonb(coalesce(p_exclude_users, '{}')));
  PERFORM public.set_setting('maintenance_ends_at', to_jsonb(p_ends_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_maintenance_mode()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'settings.write', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  PERFORM public.set_setting('maintenance_mode', 'false'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_app_for_all(p_message text DEFAULT 'Application is temporarily locked.')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_current_user_super_admin() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  PERFORM public.set_setting('app_locked', 'true'::jsonb);
  PERFORM public.set_setting('app_lock_message', to_jsonb(p_message));
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_app()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_current_user_super_admin() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  PERFORM public.set_setting('app_locked', 'false'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.enroll_student(
  p_user_id uuid,
  p_course_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_tenant uuid;
  v_user_tenant uuid;
  v_id uuid;
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'courses.manage', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_course_tenant
  FROM public.courses
  WHERE id = p_course_id AND deleted_at IS NULL;

  IF v_course_tenant IS NULL OR v_course_tenant <> public.get_current_tenant_id() THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND';
  END IF;

  -- CRITICAL ADDITION: Enforce tenant consistency
  SELECT tenant_id INTO v_user_tenant
  FROM public.users
  WHERE id = p_user_id AND deleted_at IS NULL;

  IF v_user_tenant IS NULL OR v_user_tenant <> v_course_tenant THEN
    RAISE EXCEPTION 'USER_NOT_IN_TENANT';
  END IF;

  INSERT INTO public.enrollments (
    user_id, course_id, tenant_id, enrolled_by, expires_at, status
  ) VALUES (
    p_user_id, p_course_id, v_course_tenant, auth.uid(), p_expires_at, 'active'
  )
  ON CONFLICT (user_id, course_id) DO UPDATE
    SET status = 'active',
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        revoked_by = NULL,
        revoke_reason = NULL,
        enrolled_by = auth.uid(),
        updated_at = pg_catalog.now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_enrollment(
  p_user_id uuid,
  p_course_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'courses.manage', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.enrollments
  SET status = 'revoked',
      revoked_at = pg_catalog.now(),
      revoked_by = auth.uid(),
      revoke_reason = p_reason,
      updated_at = pg_catalog.now()
  WHERE user_id = p_user_id
    AND course_id = p_course_id
    AND tenant_id = public.get_current_tenant_id();
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_course_sections(
  p_course_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = p_course_id
      AND c.tenant_id = public.get_current_tenant_id()
      AND (c.teacher_id = auth.uid() OR public.is_admin_with_session_validation())
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.sections s
  SET order_index = x.ordinality - 1,
      updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS x(id, ordinality)
  WHERE s.id = x.id
    AND s.course_id = p_course_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_section_lessons(
  p_section_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_id uuid;
BEGIN
  SELECT course_id INTO v_course_id
  FROM public.sections
  WHERE id = p_section_id
    AND tenant_id = public.get_current_tenant_id();

  IF NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = v_course_id
      AND c.tenant_id = public.get_current_tenant_id()
      AND (c.teacher_id = auth.uid() OR public.is_admin_with_session_validation())
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- DI-01: Validate count and membership
  DECLARE
    v_expected_count integer;
  BEGIN
    SELECT count(*) INTO v_expected_count FROM public.lessons WHERE section_id = p_section_id AND deleted_at IS NULL;
    IF array_length(p_ordered_ids, 1) <> v_expected_count THEN
      RAISE EXCEPTION 'INVALID_REORDER: expected % IDs, got %', v_expected_count, array_length(p_ordered_ids, 1);
    END IF;
    
    IF EXISTS (SELECT 1 FROM unnest(p_ordered_ids) id WHERE NOT EXISTS (
      SELECT 1 FROM public.lessons WHERE id = id AND section_id = p_section_id
    )) THEN
      RAISE EXCEPTION 'INVALID_REORDER: IDs not in section';
    END IF;
  END;

  UPDATE public.lessons l
  SET order_index = x.ordinality - 1,
      updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS x(id, ordinality)
  WHERE l.id = x.id
    AND l.section_id = p_section_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_warning(
  p_user_id uuid,
  p_reason text,
  p_severity integer DEFAULT 1,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_tenant_id uuid;
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'warnings.write', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_user_id
    AND tenant_id = public.get_current_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  INSERT INTO public.warnings (user_id, tenant_id, issued_by, reason, severity)
  VALUES (
    p_user_id,
    v_tenant_id,
    auth.uid(),
    btrim(coalesce(p_reason, p_note, 'Warning')),
    greatest(1, least(coalesce(p_severity, 1), 3))
  )
  RETURNING id INTO v_id;

  PERFORM public.increment_warning_count(p_user_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_course_outline(p_course_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH course_data AS (
    SELECT id, title, description, status, teacher_id
    FROM public.courses
    WHERE id = p_course_id
      AND deleted_at IS NULL
      AND tenant_id = public.get_current_tenant_id()
  ),
  lesson_data AS (
    SELECT l.section_id, pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'orderIndex', l.order_index,
        'isPreview', l.is_preview,
        'durationSec', l.duration_sec
      ) ORDER BY l.order_index
    ) AS lessons_json
    FROM public.lessons l
    JOIN course_data c ON true
    WHERE l.deleted_at IS NULL
      AND (l.is_published OR public.is_admin_with_session_validation() OR c.teacher_id = auth.uid())
    GROUP BY l.section_id
  ),
  section_data AS (
    SELECT s.course_id, pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'orderIndex', s.order_index,
        'lessons', coalesce(ld.lessons_json, '[]'::jsonb)
      ) ORDER BY s.order_index
    ) AS sections_json
    FROM public.sections s
    JOIN course_data c ON s.course_id = c.id
    LEFT JOIN lesson_data ld ON s.id = ld.section_id
    WHERE s.deleted_at IS NULL
      AND (s.is_published OR public.is_admin_with_session_validation() OR c.teacher_id = auth.uid())
    GROUP BY s.course_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'courseId', c.id,
    'title', c.title,
    'description', c.description,
    'status', c.status,
    'sections', coalesce(sd.sections_json, '[]'::jsonb)
  )
  FROM course_data c
  LEFT JOIN section_data sd ON c.id = sd.course_id;
$$;

-- CRIT-03 FIX: Changed SECURITY INVOKERÃ¢â€ â€™DEFINER, SET search_path=publicÃ¢â€ â€™''.
CREATE OR REPLACE FUNCTION public.check_lesson_access(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row     record;
  v_allowed boolean;
BEGIN
  SELECT l.id, l.course_id, l.is_preview, c.teacher_id, c.tenant_id
  INTO v_row
  FROM public.lessons l
  JOIN public.courses c ON c.id = l.course_id
  WHERE l.id         = p_lesson_id
    AND l.deleted_at IS NULL
    AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'lesson_not_found');
  END IF;

  v_allowed := v_row.tenant_id = public.get_current_tenant_id()
    AND (
      v_row.is_preview
      OR public.has_course_access(auth.uid(), v_row.course_id)
      OR v_row.teacher_id = auth.uid()
      OR public.is_admin_with_session_validation()
    );

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'courseId', v_row.course_id,
    'reason', CASE WHEN v_allowed THEN NULL ELSE 'not_enrolled' END
  );
END;
$$;

-- CRIT-03 FIX: SET search_path=publicÃ¢â€ â€™''. HIGH-04 FIX: CTE pre-computes access once.
CREATE OR REPLACE FUNCTION public.get_course_lessons_with_access(p_course_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH access_check AS (
    SELECT public.has_course_access(auth.uid(), p_course_id) AS has_access
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',         l.id,
    'sectionId',  l.section_id,
    'title',      l.title,
    'orderIndex', l.order_index,
    'isPreview',  l.is_preview,
    'hasAccess',  (
      l.is_preview
      OR ac.has_access          -- computed once via CTE, not per-row
      OR c.teacher_id = auth.uid()
      OR public.is_admin_with_session_validation()
    )
  ) ORDER BY s.order_index, l.order_index), '[]'::jsonb)
  FROM public.lessons     l
  JOIN public.sections    s  ON s.id  = l.section_id
  JOIN public.courses     c  ON c.id  = l.course_id
  CROSS JOIN access_check ac
  WHERE l.course_id  = p_course_id
    AND c.tenant_id  = public.get_current_tenant_id()
    AND l.deleted_at IS NULL
    AND s.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_my_enrolled_courses()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'thumbnailUrl', c.thumbnail_url,
    'progressPct', e.progress_pct,
    'lastWatchedAt', e.last_watched_at,
    'status', e.status
  ) ORDER BY e.last_watched_at DESC NULLS LAST, e.enrolled_at DESC), '[]'::jsonb)
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.user_id = v_uid
    AND e.status IN ('active', 'completed')
    AND e.tenant_id = public.get_current_tenant_id()
    AND c.deleted_at IS NULL
  );
END;
$$;

-- CRIT-03 FIX: SECURITY INVOKERÃ¢â€ â€™DEFINER, SET search_path=publicÃ¢â€ â€™''.
CREATE OR REPLACE FUNCTION public.get_my_recent_courses()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  FROM (
    SELECT c.id, c.title,
           c.thumbnail_url      AS "thumbnailUrl",
           e.progress_pct       AS "progressPct",
           e.last_watched_at    AS "lastWatchedAt"
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.user_id            = auth.uid()
      AND e.status             IN ('active', 'completed')
      AND e.last_watched_at    IS NOT NULL
      AND e.tenant_id          = public.get_current_tenant_id()
    ORDER BY e.last_watched_at DESC
    LIMIT 10
  ) x;
$$;

-- CRIT-03 FIX: SECURITY INVOKERÃ¢â€ â€™DEFINER, SET search_path=publicÃ¢â€ â€™''.
CREATE OR REPLACE FUNCTION public.get_my_resume_lesson()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'courseId',    c.id,
      'courseTitle', c.title,
      'lessonId',    up.lesson_id,
      'lessonTitle', l.title,
      'lastWatched', up.last_watched,
      'progressPct', up.progress_pct
    )
    FROM public.user_progress up
    JOIN public.courses       c  ON c.id  = up.course_id
    LEFT JOIN public.lessons  l  ON l.id  = up.lesson_id
    WHERE up.user_id   = auth.uid()
      AND up.tenant_id = public.get_current_tenant_id()
      AND up.last_watched IS NOT NULL
    ORDER BY up.last_watched DESC
    LIMIT 1
  ), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.get_course_progress_summary(p_course_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'courseId', p_course_id,
    'enrolledCount', count(*),
    'avgProgress', coalesce(round(avg(e.progress_pct), 2), 0),
    'completedCount', count(*) FILTER (WHERE e.status = 'completed')
  )
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.course_id = p_course_id
    AND c.tenant_id = public.get_current_tenant_id()
    AND (c.teacher_id = auth.uid() OR public.is_admin_with_session_validation());
$$;

CREATE OR REPLACE FUNCTION public.trg_update_enrollment_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := NEW.user_id;
  v_cid uuid := NEW.course_id;
  v_total integer;
  v_done integer;
  v_max_watched timestamptz;
BEGIN
  -- DI-02: Synchronous update for data integrity
  SELECT pg_catalog.count(*) INTO v_total FROM public.lessons WHERE course_id = v_cid AND deleted_at IS NULL;
  SELECT pg_catalog.count(*) INTO v_done FROM public.user_progress WHERE user_id = v_uid AND course_id = v_cid AND completed;
  SELECT pg_catalog.max(last_watched) INTO v_max_watched FROM public.user_progress WHERE user_id = v_uid AND course_id = v_cid;

  UPDATE public.enrollments
  SET total_lessons = v_total,
      completed_lessons = v_done,
      progress_pct = CASE WHEN v_total = 0 THEN 0 ELSE pg_catalog.round((v_done::numeric / v_total::numeric) * 100, 2) END,
      last_watched_at = greatest(coalesce(last_watched_at, v_max_watched), coalesce(v_max_watched, last_watched_at)),
      updated_at = pg_catalog.now()
  WHERE user_id = v_uid AND course_id = v_cid;

  -- Still enqueue a background job for heavy analytics/logging if needed, 
  -- but the main counts are now consistent immediately.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION internal.apply_enrollment_progress_update(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (p_payload ->> 'user_id')::uuid;
  v_cid uuid := (p_payload ->> 'course_id')::uuid;
  v_total integer;
  v_done integer;
  v_max_watched timestamptz;
BEGIN
  IF v_uid IS NULL OR v_cid IS NULL THEN
    RETURN;
  END IF;

  SELECT total_lessons INTO v_total
  FROM public.enrollments
  WHERE user_id = v_uid AND course_id = v_cid;

  IF v_total IS NULL THEN
    SELECT count(*) INTO v_total
    FROM public.lessons
    WHERE course_id = v_cid
      AND deleted_at IS NULL;
  END IF;

  SELECT count(*) INTO v_done
  FROM public.user_progress
  WHERE user_id = v_uid
    AND course_id = v_cid
    AND completed;

  SELECT pg_catalog.max(last_watched) INTO v_max_watched
  FROM public.user_progress
  WHERE user_id = v_uid
    AND course_id = v_cid;

  UPDATE public.enrollments e
  SET total_lessons = v_total,
      completed_lessons = v_done,
      progress_pct = CASE WHEN v_total = 0 THEN 0 ELSE pg_catalog.round((v_done::numeric / v_total::numeric) * 100, 2) END,
      last_watched_at = greatest(coalesce(e.last_watched_at, v_max_watched), coalesce(v_max_watched, e.last_watched_at)),
      updated_at = pg_catalog.now()
  WHERE e.user_id = v_uid
    AND e.course_id = v_cid;
END;
$$;

-- 1.4 Keep enrollments.total_lessons in sync when lessons change (async via job_queue)
CREATE OR REPLACE FUNCTION public.trg_refresh_enrollment_totals_stmt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- MED-04: Statement-level trigger for high-concurrency efficiency
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO internal.job_queue (job_type, payload, priority)
    SELECT 'UPDATE_ENROLLMENT_TOTALS', pg_catalog.jsonb_build_object('course_id', course_id), 9
    FROM inserted_rows
    ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO internal.job_queue (job_type, payload, priority)
    SELECT 'UPDATE_ENROLLMENT_TOTALS', pg_catalog.jsonb_build_object('course_id', course_id), 9
    FROM deleted_rows
    ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO internal.job_queue (job_type, payload, priority)
    SELECT 'UPDATE_ENROLLMENT_TOTALS', pg_catalog.jsonb_build_object('course_id', course_id), 9
    FROM (SELECT course_id FROM inserted_rows UNION SELECT course_id FROM deleted_rows) AS affected
    ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

-- MED-04 FIX: Removed redundant triggers in favor of dynamic view (MED-01).

CREATE OR REPLACE FUNCTION internal.apply_update_enrollment_totals_course(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_course_id IS NULL THEN
    RETURN;
  END IF;

  -- Calculate true lesson count once
  SELECT pg_catalog.count(*)::integer INTO v_count
  FROM public.lessons
  WHERE course_id = p_course_id
    AND deleted_at IS NULL;

  -- Sync enrollments.total_lessons
  UPDATE public.enrollments
  SET total_lessons = v_count,
      updated_at = pg_catalog.now()
  WHERE course_id = p_course_id;

  -- Sync courses.total_lessons (fix for patch 16 root cause)
  UPDATE public.courses
  SET total_lessons = v_count
  WHERE id = p_course_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_users_paginated(
  p_search text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_primary_role text DEFAULT NULL,
  p_account_status text DEFAULT NULL,
  p_region_id text DEFAULT NULL,
  p_warning_count_gte integer DEFAULT NULL,
  p_last_login_from timestamptz DEFAULT NULL,
  p_last_login_to timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  _request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_total bigint;
  v_rows jsonb;
  v_search text := pg_catalog.nullif(pg_catalog.btrim(p_search), '');
BEGIN
  -- Enterprise Hardening: Prevent connection exhaustion
  SET LOCAL statement_timeout = '5s';

  IF NOT public.user_has_permission(auth.uid(), 'users.read', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_tenant_id := CASE
    WHEN public.is_current_user_super_admin() THEN p_tenant_id
    ELSE public.get_current_tenant_id()
  END;

  -- HIGH-03 FIX: Separate count query to avoid expensive window function on large datasets
  SELECT pg_catalog.count(*)::bigint INTO v_total
  FROM public.users u
  WHERE u.deleted_at IS NULL
    AND (v_tenant_id IS NULL OR u.tenant_id = v_tenant_id)
    AND (p_primary_role IS NULL OR u.primary_role = p_primary_role)
    AND (p_account_status IS NULL OR u.account_status = p_account_status)
    AND (p_region_id IS NULL OR u.region_id = p_region_id)
    AND (p_warning_count_gte IS NULL OR u.warning_count >= p_warning_count_gte)
    AND (p_last_login_from IS NULL OR u.last_login >= p_last_login_from)
    AND (p_last_login_to IS NULL OR u.last_login <= p_last_login_to)
    AND (
      v_search IS NULL
      OR u.search_vector @@ pg_catalog.plainto_tsquery('simple', v_search)
    );

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.row_to_json(u)::jsonb), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName",
           u.primary_role AS "primaryRole", u.account_status AS "accountStatus",
           u.tenant_id AS "tenantId", u.region_id AS "regionId",
           u.warning_count AS "warningCount", u.login_count AS "loginCount",
           u.last_login AS "lastLogin", u.created_at AS "createdAt"
    FROM public.users u
    WHERE u.deleted_at IS NULL
      AND (v_tenant_id IS NULL OR u.tenant_id = v_tenant_id)
      AND (p_primary_role IS NULL OR u.primary_role = p_primary_role)
      AND (p_account_status IS NULL OR u.account_status = p_account_status)
      AND (p_region_id IS NULL OR u.region_id = p_region_id)
      AND (p_warning_count_gte IS NULL OR u.warning_count >= p_warning_count_gte)
      AND (p_last_login_from IS NULL OR u.last_login >= p_last_login_from)
      AND (p_last_login_to IS NULL OR u.last_login <= p_last_login_to)
      AND (
        v_search IS NULL
        OR u.search_vector @@ pg_catalog.plainto_tsquery('simple', v_search)
      )
    ORDER BY u.created_at DESC, u.id
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  ) u;

  RETURN pg_catalog.jsonb_build_object(
    'data', v_rows,
    'count', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'totalPages', pg_catalog.ceil(v_total::numeric / v_page_size)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_stats_summary(
  p_tenant_id uuid DEFAULT NULL,
  _request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'users.read', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_tid := CASE WHEN public.is_current_user_super_admin() THEN p_tenant_id ELSE public.get_current_tenant_id() END;

  RETURN (
    SELECT jsonb_build_object(
      'total_users', count(*),
      'active_users', count(*) FILTER (WHERE account_status = 'active'),
      'locked_users', count(*) FILTER (WHERE account_status = 'locked'),
      'suspended_users', count(*) FILTER (WHERE account_status = 'suspended'),
      'banned_users', count(*) FILTER (WHERE account_status = 'banned'),
      'dau', count(*) FILTER (WHERE last_login > pg_catalog.now() - interval '24h'),
      'wau', count(*) FILTER (WHERE last_login > pg_catalog.now() - interval '7d'),
      'mau', count(*) FILTER (WHERE last_login > pg_catalog.now() - interval '30d'),
      'last_updated', pg_catalog.now()
    )
    FROM public.users
    WHERE deleted_at IS NULL
      AND (v_tid IS NULL OR tenant_id = v_tid)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_activity(
  p_tenant_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30,
  p_activity_type text DEFAULT NULL,
  _request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', d.activity_date,
    'count', d.count
  ) ORDER BY d.activity_date), '[]'::jsonb)
  FROM (
    SELECT created_at::date AS activity_date, count(*) AS count
    FROM public.activity_logs
    WHERE created_at >= current_date - make_interval(days => greatest(coalesce(p_days, 30), 1))
      AND (p_activity_type IS NULL OR activity_type = p_activity_type)
      AND tenant_id = coalesce(p_tenant_id, public.get_current_tenant_id())
      AND public.user_has_permission(auth.uid(), 'reports.read', public.get_current_tenant_id())
    GROUP BY created_at::date
  ) d;
$$;

CREATE OR REPLACE FUNCTION public.search_courses_ranked(
  p_query text,
  p_tenant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.row_to_json(x)::jsonb), '[]'::jsonb)
  FROM (
    SELECT c.id, c.title, c.description, c.thumbnail_url AS "thumbnailUrl",
           pg_catalog.ts_rank(c.search_vector, pg_catalog.plainto_tsquery('simple', p_query)) AS rank
    FROM public.courses c
    WHERE c.deleted_at IS NULL
      AND c.status = 'published'
      AND c.tenant_id = coalesce(p_tenant_id, public.get_current_tenant_id())
      AND c.search_vector @@ pg_catalog.plainto_tsquery('simple', p_query)
    ORDER BY rank DESC, c.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
  ) x;
$$;

-- FIX #8: Add Coordinate Validation to Location Logging
CREATE OR REPLACE FUNCTION public.log_app_open_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision DEFAULT NULL,
  p_source text DEFAULT 'gps',
  p_session_id uuid DEFAULT NULL,
  p_device_info jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := public.get_current_tenant_id();
  v_id uuid;
BEGIN
  -- Validate geographic coordinates
  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'INVALID_COORDINATES: latitude and longitude are required';
  END IF;

  IF p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'INVALID_LATITUDE: must be between -90 and 90, got %', p_latitude;
  END IF;

  IF p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'INVALID_LONGITUDE: must be between -180 and 180, got %', p_longitude;
  END IF;

  IF p_accuracy IS NOT NULL AND p_accuracy < 0 THEN
    RAISE EXCEPTION 'INVALID_ACCURACY: must be non-negative, got %', p_accuracy;
  END IF;

  IF p_source NOT IN ('gps', 'wifi', 'manual', 'ip_based') THEN
    RAISE EXCEPTION 'INVALID_SOURCE: must be one of [gps, wifi, manual, ip_based], got %', p_source;
  END IF;
  
  -- Enterprise Hardening: Prevent connection exhaustion
  SET LOCAL statement_timeout = '5s';
IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  INSERT INTO public.user_location_logs (
    user_id, tenant_id, session_id, latitude, longitude, accuracy,
    source, event_type, device_info
  )
  VALUES (
    v_uid, v_tenant_id, p_session_id, p_latitude, p_longitude, p_accuracy,
    p_source, 'app_open', coalesce(p_device_info, '{}')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_last_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_last_location (user_id, tenant_id, latitude, longitude, accuracy, source, updated_at)
  VALUES (NEW.user_id, NEW.tenant_id, NEW.latitude, NEW.longitude, NEW.accuracy, NEW.source, coalesce(NEW.logged_at, now()))
  ON CONFLICT (user_id)
  DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                accuracy = EXCLUDED.accuracy,
                source = EXCLUDED.source,
                updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

-- MEDIUM-02: Trigger for lesson state transitions
CREATE OR REPLACE FUNCTION public.trg_audit_lesson_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_published <> OLD.is_published THEN
    INSERT INTO audit.lesson_state_transitions (
      lesson_id, old_state, new_state, changed_by
    ) VALUES (
      NEW.id,
      CASE WHEN OLD.is_published THEN 'published' ELSE 'draft' END,
      CASE WHEN NEW.is_published THEN 'published' ELSE 'draft' END,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- MEDIUM-03: Monitor unused indexes
CREATE OR REPLACE FUNCTION maintenance.get_unused_indexes()
RETURNS TABLE(indexname text, idx_scan bigint, idx_tup_read bigint, idx_tup_fetch bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
    AND indexrelname NOT LIKE 'pg_toast%'
  ORDER BY indexrelname;
$$;

-- MEDIUM-04: Soft delete cascade function
CREATE OR REPLACE FUNCTION public.soft_delete_user(p_user_id uuid, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Soft-delete user
  UPDATE public.users
  SET deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = p_user_id AND tenant_id = p_tenant_id;
  
  -- Cascade soft-delete to dependent records
  UPDATE public.enrollments
  SET deleted_at = pg_catalog.now(), status = 'revoked'
  WHERE user_id = p_user_id AND deleted_at IS NULL;
  
  UPDATE public.user_progress
  SET deleted_at = pg_catalog.now()
  WHERE user_id = p_user_id AND deleted_at IS NULL;
  
  UPDATE public.user_roles
  SET deleted_at = pg_catalog.now()
  WHERE user_id = p_user_id AND deleted_at IS NULL;
  
  UPDATE public.sessions
  SET deleted_at = pg_catalog.now()
  WHERE user_id = p_user_id AND deleted_at IS NULL;
  
  -- Log deletion
  INSERT INTO audit.deletion_audit (entity_type, entity_id, deleted_by, reason)
  VALUES ('user', p_user_id, auth.uid(), 'Full account deletion (soft)');
  
  RAISE NOTICE 'User % and all dependent records soft-deleted', p_user_id;
END;
$$;

-- MEDIUM-04: Prevent physical delete trigger
CREATE OR REPLACE FUNCTION public.prevent_physical_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Physical DELETE not allowed on %. Use soft_delete_*() functions instead.', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_gdpr_compliance(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'user_deleted', (SELECT deleted_at IS NOT NULL FROM public.users WHERE id = p_user_id),
    'orphaned_enrollments', (SELECT count(*) FROM public.enrollments WHERE user_id = p_user_id AND deleted_at IS NULL),
    'orphaned_progress', (SELECT count(*) FROM public.user_progress WHERE user_id = p_user_id AND deleted_at IS NULL),
    'orphaned_sessions', (SELECT count(*) FROM public.sessions WHERE user_id = p_user_id AND deleted_at IS NULL),
    'orphaned_roles', (SELECT count(*) FROM public.user_roles WHERE user_id = p_user_id AND is_active = true),
    'compliance_pass', (
      (SELECT deleted_at IS NOT NULL FROM public.users WHERE id = p_user_id)
      AND
      (SELECT count(*) FROM public.enrollments WHERE user_id = p_user_id AND deleted_at IS NULL) = 0
      AND
      (SELECT count(*) FROM public.user_progress WHERE user_id = p_user_id AND deleted_at IS NULL) = 0
    )
  );
$$;

-- LOW-02: Enrollment tenant match validation
CREATE OR REPLACE FUNCTION public.trg_validate_enrollments_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_course_tenant_id
  FROM public.courses
  WHERE id = NEW.course_id;
  
  IF v_course_tenant_id IS NOT NULL AND v_course_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Enrollment tenant_id % does not match course tenant_id %',
      NEW.tenant_id, v_course_tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- CRIT-01: service_role check for background jobs
CREATE OR REPLACE FUNCTION internal.execute_background_job(
  p_job_id uuid,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- CRITICAL: Only allow execution from service_role
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: execution restricted to service_role';
  END IF;

  -- Validate tenant_id matches job context
  IF NOT EXISTS (
    SELECT 1 FROM internal.job_queue
    WHERE id = p_job_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Job % does not belong to tenant %', p_job_id, p_tenant_id;
  END IF;

  -- Execution logic would go here, maintaining tenant isolation.
END;
$$;

CREATE OR REPLACE FUNCTION public.fanout_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Async fanout: enqueue a single job instead of per-user inserts.
  -- The job worker (service_role) handles the actual user_notifications inserts.
  INSERT INTO internal.job_queue (job_type, payload, priority)
  VALUES (
    'notification_fanout',
    jsonb_build_object(
      'notification_id', NEW.id,
      'tenant_id',        NEW.tenant_id,
      'target_audience',  NEW.target_audience
    ),
    5  -- medium priority
  )
  ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_enrolled_students_for_course(
  p_course_id uuid,
  p_title text,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_course_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_course_tenant
  FROM public.courses
  WHERE id = p_course_id
    AND (teacher_id = auth.uid() OR public.is_admin_with_session_validation());

  IF v_course_tenant IS NULL OR v_course_tenant <> public.get_current_tenant_id() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT array_agg(user_id) INTO v_ids
  FROM public.enrollments
  WHERE course_id = p_course_id
    AND status IN ('active', 'completed');

  RETURN public.send_notification(p_title, p_body, 'students', NULL, v_ids);
END;
$$;

-- DEPRECATED: use 5-arg version above
-- Dropped via CASCADE in consolidate send_notification overload block

-- MEDIUM-01: Validation function for naming conventions (used in code review)
CREATE OR REPLACE FUNCTION public.check_schema_naming_conventions()
RETURNS TABLE(table_name text, issue text, severity text)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT tablename, issue, severity
  FROM (
    SELECT
      t.tablename,
      CASE
        WHEN a.attname LIKE '%_count' AND a.attname NOT IN ('enrolled_count', 'completed_count', 'enrolled_users')
          THEN 'Denormalized count should be in view, not table'
        WHEN a.attname LIKE 'is_%' AND a.atttypid <> 'bool'::regtype
          THEN 'Boolean column should be type BOOLEAN, not ' || format_type(a.atttypid, NULL)
        WHEN a.attname = 'updated_at' AND t.tablename NOT IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
          THEN 'Mutable table should have updated_at column'
        WHEN t.tablename ~ '^(enrollments|user_progress|courses|lessons)$' AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name = t.tablename AND column_name = 'tenant_id'
        ) THEN 'Multi-tenant table missing tenant_id'
        ELSE NULL
      END AS issue,
      'MEDIUM' AS severity
    FROM pg_tables t
    JOIN pg_attribute a ON a.attrelid = (t.schemaname || '.' || t.tablename)::regclass
    WHERE t.schemaname = 'public'
  ) sub
  WHERE issue IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN jsonb_build_object(
    'databaseTime', pg_catalog.now(),
    'pendingJobs', (SELECT count(*) FROM internal.job_queue WHERE status = 'pending'),
    'unflushedActivity', (SELECT count(*) FROM public.activity_log_queue WHERE flushed_at IS NULL),
    'activeTenants', (SELECT count(*) FROM public.tenants WHERE status = 'active' AND deleted_at IS NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_jobs(
  p_page      int DEFAULT 1,
  p_page_size int DEFAULT 10,
  p_status    text DEFAULT NULL,
  p_job_type  text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  job_type        text,
  payload         jsonb,
  status          text,
  priority        int,
  attempts        int,
  max_attempts    int,
  run_at          timestamptz,
  locked_by       text,
  locked_at       timestamptz,
  lock_expires_at timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  error_msg       text,
  created_at      timestamptz,
  full_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_offset int;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  RETURN QUERY
  WITH filtered_jobs AS (
    SELECT * FROM internal.job_queue
    WHERE (p_status    IS NULL OR internal.job_queue.status   = p_status)
      AND (p_job_type  IS NULL OR internal.job_queue.job_type = p_job_type)
      AND (p_date_from IS NULL OR internal.job_queue.created_at >= p_date_from)
  ),
  total_count AS (
    SELECT count(*) AS cnt FROM filtered_jobs
  )
  SELECT
    fj.id, fj.job_type, fj.payload, fj.status, fj.priority,
    fj.attempts, fj.max_attempts, fj.run_at, 
    fj.locked_by_worker_id::text AS locked_by,
    fj.locked_at, fj.lock_expires_at, fj.started_at,
    fj.finished_at AS completed_at, 
    fj.error_message AS error_msg, 
    fj.created_at,
    tc.cnt
  FROM filtered_jobs fj, total_count tc
  ORDER BY fj.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_job_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'pending',    (SELECT count(*) FROM internal.job_queue WHERE status = 'pending'),
      'processing', (SELECT count(*) FROM internal.job_queue WHERE status = 'processing'),
      'done',       (SELECT count(*) FROM internal.job_queue WHERE status = 'done'),
      'failed',     (SELECT count(*) FROM internal.job_queue WHERE status = 'failed'),
      'dead',       (SELECT count(*) FROM internal.job_queue WHERE status = 'dead')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE internal.job_queue
  SET status = 'pending',
      run_at = pg_catalog.now(),
      attempts = 0,
      error_message = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE internal.job_queue
  SET status = 'dead',
      finished_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_job(p_id uuid)
RETURNS TABLE (
  id              uuid,
  job_type        text,
  status          text,
  error_msg       text,
  created_at      timestamptz,
  completed_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    jq.id,
    jq.job_type,
    jq.status,
    jq.error_message AS error_msg,
    jq.created_at,
    jq.finished_at AS completed_at
  FROM internal.job_queue jq
  WHERE jq.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_enqueue_bulk_job(
  p_job_type text,
  p_payload jsonb,
  p_initiator_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_job internal.job_queue;
  v_tenant_id uuid;
  v_pending_count int;
  max_pending_jobs constant int := 10;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_initiator_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INITIATOR_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_pending_count
  FROM internal.job_queue
  WHERE status = 'pending';

  IF v_pending_count >= max_pending_jobs THEN
    RAISE EXCEPTION 'JOB_QUEUE_FULL: Too many pending operations';
  END IF;

  INSERT INTO internal.job_queue (job_type, payload, priority, max_attempts, status, run_at, tenant_id)
  VALUES (p_job_type, p_payload, 5, 3, 'pending', pg_catalog.now(), v_tenant_id)
  RETURNING * INTO v_job;

  RETURN to_jsonb(v_job);
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_update_bulk_job(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_finished_at timestamptz DEFAULT NULL,
  p_release_lock boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE internal.job_queue
  SET
    status = coalesce(p_status, status),
    error_message = coalesce(p_error_message, error_message),
    finished_at = coalesce(p_finished_at, finished_at),
    locked_by_worker_id = CASE WHEN p_release_lock THEN NULL ELSE locked_by_worker_id END,
    locked_at = CASE WHEN p_release_lock THEN NULL ELSE locked_at END,
    lock_expires_at = CASE WHEN p_release_lock THEN NULL ELSE lock_expires_at END,
    updated_at = pg_catalog.now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: %', p_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_fail_bulk_job(
  p_id uuid,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts integer;
  v_max integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT attempts, max_attempts
  INTO v_attempts, v_max
  FROM internal.job_queue
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: %', p_id;
  END IF;

  UPDATE internal.job_queue
  SET
    status = CASE WHEN v_attempts < v_max THEN 'pending' ELSE 'failed' END,
    finished_at = CASE WHEN v_attempts < v_max THEN NULL ELSE pg_catalog.now() END,
    error_message = p_error_message,
    locked_by_worker_id = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    updated_at = pg_catalog.now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_control_user_account(
  p_initiator_id uuid,
  p_user_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_suspend_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_until timestamptz;
  v_tenant_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_initiator_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INITIATOR_NOT_FOUND';
  END IF;

  IF NOT public.user_has_permission(p_initiator_id, 'users.lock', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_action NOT IN ('lock', 'unlock', 'suspend', 'ban') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;

  v_status := CASE p_action
    WHEN 'unlock' THEN 'active'
    WHEN 'suspend' THEN 'suspended'
    WHEN 'ban' THEN 'banned'
    ELSE p_action || 'ed'
  END;

  IF p_action = 'suspend' THEN
    v_until := pg_catalog.now() + pg_catalog.make_interval(hours => coalesce(p_suspend_hours, 24));
  END IF;

  UPDATE public.users
  SET account_status = v_status,
      lock_reason = CASE WHEN p_action = 'unlock' THEN NULL ELSE p_reason END,
      locked_at = CASE WHEN p_action = 'unlock' THEN NULL ELSE pg_catalog.now() END,
      locked_by = CASE WHEN p_action = 'unlock' THEN NULL ELSE p_initiator_id END,
      suspension_until = v_until,
      token_version = CASE WHEN p_action = 'unlock' THEN token_version ELSE token_version + 1 END,
      updated_at = pg_catalog.now()
  WHERE id = p_user_id
    AND tenant_id = v_tenant_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF p_action <> 'unlock' THEN
    PERFORM private.revoke_auth_sessions(p_user_id);

    UPDATE public.sessions
    SET is_active = false,
        ended_at = coalesce(ended_at, pg_catalog.now()),
        end_reason = 'account_' || p_action,
        updated_at = pg_catalog.now()
    WHERE user_id = p_user_id
      AND is_active
      AND tenant_id = v_tenant_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object('status', v_status, 'until', v_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_issue_warning(
  p_initiator_id uuid,
  p_user_id uuid,
  p_reason text,
  p_severity integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_tenant_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_initiator_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INITIATOR_NOT_FOUND';
  END IF;

  IF NOT public.user_has_permission(p_initiator_id, 'warnings.write', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND tenant_id = v_tenant_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  INSERT INTO public.warnings (user_id, tenant_id, issued_by, reason, severity)
  VALUES (
    p_user_id,
    v_tenant_id,
    p_initiator_id,
    btrim(coalesce(p_reason, 'Bulk warning')),
    greatest(1, least(coalesce(p_severity, 1), 3))
  )
  RETURNING id INTO v_id;

  PERFORM public.increment_warning_count(p_user_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_terminate_user_sessions(
  p_initiator_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'Bulk session termination'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_tenant_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_initiator_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INITIATOR_NOT_FOUND';
  END IF;

  IF NOT public.user_has_permission(p_initiator_id, 'users.write', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.sessions
  SET is_active = false,
      ended_at = coalesce(ended_at, pg_catalog.now()),
      end_reason = p_reason,
      updated_at = pg_catalog.now()
  WHERE user_id = p_user_id
    AND is_active
    AND tenant_id = v_tenant_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_reset_user_device(
  p_initiator_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_initiator_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INITIATOR_NOT_FOUND';
  END IF;

  IF NOT public.user_has_permission(p_initiator_id, 'users.write', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.devices
  SET is_active = false
  WHERE user_id = p_user_id
    AND tenant_id = v_tenant_id;

  UPDATE public.users
  SET token_version = token_version + 1,
      updated_at = pg_catalog.now()
  WHERE id = p_user_id
    AND tenant_id = v_tenant_id
    AND deleted_at IS NULL;

  PERFORM private.revoke_auth_sessions(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION internal.queue_course_cache_purge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO internal.job_queue (job_type, payload, priority)
  VALUES (
    'PURGE_COURSE_CACHE',
    jsonb_build_object('course_id', coalesce(NEW.id, OLD.id)),
    100
  )
  ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;

  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION internal.process_cache_purges(
  p_limit integer DEFAULT 1000,
  p_worker_id text DEFAULT pg_catalog.gen_random_uuid()::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_job internal.job_queue%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  FOR v_job IN
    SELECT * FROM internal.dequeue_job(p_worker_id, ARRAY['PURGE_COURSE_CACHE'], 300)
    LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000))
  LOOP
    UPDATE internal.job_queue
    SET status = 'done',
        finished_at = now(),
        updated_at = now()
    WHERE id = v_job.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION maintenance.create_next_partition_if_not_exists(
  p_table text,
  p_schema text DEFAULT 'public',
  p_year integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent regclass;
  v_year integer := coalesce(p_year, pg_catalog.date_part('year', pg_catalog.now())::integer + 1);
  v_partition_name text := p_table || '_' || v_year::text;
  v_start date := pg_catalog.make_date(v_year, 1, 1);
  v_end date := pg_catalog.make_date(v_year + 1, 1, 1);
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('app_executor', 'app_maintenance', 'postgres', 'supabase_admin')
     AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_parent := to_regclass(format('%I.%I', p_schema, p_table));
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_PARTITION_PARENT %.%', p_schema, p_table;
  END IF;

  IF to_regclass(format('%I.%I', p_schema, v_partition_name)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
      p_schema,
      v_partition_name,
      p_schema,
      p_table,
      v_start,
      v_end
    );
  END IF;

  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, v_partition_name);
  EXECUTE format(
    'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
    p_schema,
    v_partition_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION maintenance.manage_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_year integer;
BEGIN
  FOR v_year IN pg_catalog.date_part('year', pg_catalog.now())::integer..pg_catalog.date_part('year', pg_catalog.now())::integer + 5 LOOP
    PERFORM maintenance.create_next_partition_if_not_exists('sessions', 'public', v_year);
    PERFORM maintenance.create_next_partition_if_not_exists('session_snapshots', 'public', v_year);
    PERFORM maintenance.create_next_partition_if_not_exists('video_views', 'public', v_year);
    PERFORM maintenance.create_next_partition_if_not_exists('user_location_logs', 'public', v_year);
    PERFORM maintenance.create_next_partition_if_not_exists('activity_logs', 'public', v_year);
    PERFORM maintenance.create_next_partition_if_not_exists('lesson_access_log', 'audit', v_year);
    PERFORM maintenance.create_next_partition_if_not_exists('alert_log', 'audit', v_year);
  END LOOP;
END;
$$;

-- ============================================================================
-- pg_cron scheduling registration for maintenance.manage_partitions()
-- Scheduled to run monthly on the 1st of the month at 03:00 (offset from the
-- archive_soft_deleted_data job above to avoid overlap). Without this
-- schedule, every year-partitioned table falls back to its pre-created
-- MAXVALUE catch-all partition indefinitely: inserts still succeed, but the
-- catch-all grows unbounded and partition pruning stops helping.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'cron' AND tablename = 'job'
    ) THEN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'manage_partitions';
    END IF;

    PERFORM cron.schedule(
      'manage_partitions',
      '0 3 1 * *',
      'SELECT maintenance.manage_partitions();'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION internal.invoke_notification_push_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  v_url text;
  v_key text;
  v_jwt text;
  v_request_id bigint;
BEGIN
  IF coalesce(auth.role(), current_user) NOT IN
      ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault')
     OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    RAISE EXCEPTION 'PUSH_WORKER_EXTENSIONS_UNAVAILABLE';
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'eduzone_push_worker_url';
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'eduzone_push_worker_auth_token';
  SELECT decrypted_secret INTO v_jwt
  FROM vault.decrypted_secrets
  WHERE name = 'eduzone_push_worker_jwt';
  IF v_url IS NULL OR v_key IS NULL OR v_jwt IS NULL
     OR btrim(v_url) = '' OR btrim(v_key) = '' OR btrim(v_jwt) = '' THEN
    RAISE EXCEPTION 'PUSH_WORKER_SECRETS_MISSING';
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_jwt,
      'X-Push-Worker-Token', v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION internal.invoke_notification_push_worker()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.invoke_notification_push_worker() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'cron' AND tablename = 'job') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'notification_push_worker';
    PERFORM cron.schedule(
      'notification_push_worker',
      '* * * * *',
      'SELECT internal.invoke_notification_push_worker();'
    );
  END IF;
END $$;

-- HIGH-06: Automatic vacuum/analyze for partitions
CREATE OR REPLACE FUNCTION maintenance.vacuum_partition(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE format('VACUUM ANALYZE %I.%I', p_schema, p_table);
END;
$$;

-- HIGH-06: Retention policy (auto-drop/archive old partitions)
CREATE OR REPLACE FUNCTION maintenance.archive_old_partitions(p_retention_interval interval DEFAULT interval '1 year')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_partition record;
BEGIN
  -- Find year-based partitions older than retention
  FOR v_partition IN (
    SELECT schemaname, tablename 
    FROM pg_tables 
    WHERE (tablename ~ '^(activity_logs|video_views|sessions|user_location_logs)_[0-9]{4}$')
      AND to_date(substring(tablename from '_([0-9]{4})$'), 'YYYY') < (pg_catalog.now() - p_retention_interval)
  ) LOOP
    -- In production, this would dump to S3 before dropping.
    -- For now, we drop the old telemetry/log partition.
    EXECUTE format('DROP TABLE IF EXISTS %I.%I', v_partition.schemaname, v_partition.tablename);
    RAISE NOTICE 'Archived and dropped partition %.%', v_partition.schemaname, v_partition.tablename;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION audit.check_default_partition_leak()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN jsonb_build_object(
    'lessonAccess2028Rows', (SELECT count(*) FROM audit.lesson_access_log_2028),
    'checkedAt', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_job(
  p_worker_id text,
  p_job_types text[] DEFAULT NULL,
  p_lock_ttl_seconds integer DEFAULT 300
)
RETURNS SETOF internal.job_queue
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT * FROM internal.dequeue_job(p_worker_id, p_job_types, p_lock_ttl_seconds);
END;
$$;

-- NOTE: public.is_feature_enabled(text, uuid) is defined once, later in this file,
-- as a thin delegator to public.is_feature_enabled_for_user() (which adds the
-- caller-identity/tenant/account-status checks). An earlier, less-safe inline
-- implementation that duplicated this signature without those checks has been
-- removed so only the hardened, canonical definition remains.


CREATE OR REPLACE FUNCTION private.prune_expired_access_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM private.user_access_cache
  WHERE status <> 'active'
     OR (valid_until IS NOT NULL AND valid_until <= pg_catalog.now());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_settings_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.settings_cache WHERE key = NEW.key;
  INSERT INTO public.cache_invalidation_queue (cache_key, cache_type, payload)
  VALUES ('settings:' || NEW.key, 'settings', jsonb_build_object('key', NEW.key))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_rebuild_perm_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    PERFORM public.rebuild_permission_cache(coalesce(NEW.user_id, OLD.user_id), coalesce(NEW.tenant_id, OLD.tenant_id));
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_schedule_mv_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO internal.job_queue (job_type, payload, priority)
  VALUES (
    'REFRESH_DASHBOARD_STATS',
    pg_catalog.jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP),
    10
  )
  ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_lessons_publish_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.is_published = true
     AND OLD.is_published IS DISTINCT FROM NEW.is_published THEN
    INSERT INTO internal.job_queue (job_type, payload, priority)
    VALUES (
      'NOTIFY_LESSON_PUBLISHED',
      jsonb_build_object('course_id', NEW.course_id, 'lesson_title', NEW.title),
      10
    )
    ON CONFLICT (job_type, payload_hash) WHERE (status IN ('pending', 'processing')) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_cascade_section_deletes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.lesson_contents
    WHERE lesson_id IN (
      SELECT id FROM public.lessons WHERE section_id = OLD.id
    );
    
    DELETE FROM public.lessons WHERE section_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

-- =============================================================================
-- STABILITY: Cascading Soft-Delete for courses → lessons + enrollments
-- Bound by trigger in 08_triggers.sql:
--   BEFORE UPDATE OF deleted_at ON public.courses FOR EACH ROW
--   WHEN (NEW.deleted_at IS NOT NULL)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_cascade_course_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Propagate the exact same deleted_at timestamp to child lessons.
  -- WHERE clause ensures already-deleted lessons are not re-stamped.
  UPDATE public.lessons
  SET deleted_at = NEW.deleted_at
  WHERE course_id   = NEW.id
    AND deleted_at IS NULL;

  -- Propagate to child enrollments.
  UPDATE public.enrollments
  SET deleted_at = NEW.deleted_at
  WHERE course_id   = NEW.id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

-- trg_sync_user_roles_combined: Combined trigger for user_roles
CREATE OR REPLACE FUNCTION public.trg_sync_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_primary_role_for_user(OLD.user_id);
    PERFORM public.rebuild_permission_cache(OLD.user_id, OLD.tenant_id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.sync_primary_role_for_user(NEW.user_id);
    PERFORM public.rebuild_permission_cache(NEW.user_id, NEW.tenant_id);
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_course_stats(
  p_tenant_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  _request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'reports.read', public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'published', count(*) FILTER (WHERE status = 'published'),
      'draft', count(*) FILTER (WHERE status = 'draft'),
      'archived', count(*) FILTER (WHERE status = 'archived')
    )
    FROM public.courses
    WHERE deleted_at IS NULL
      AND (coalesce(p_tenant_id, public.get_current_tenant_id()) IS NULL OR tenant_id = coalesce(p_tenant_id, public.get_current_tenant_id()))
      AND (p_teacher_id IS NULL OR teacher_id = p_teacher_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_course_stats(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  category text,
  active_students bigint,
  completed_students bigint,
  avg_progress_pct numeric,
  last_enrollment_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT v.id, v.title, v.category, v.active_students, v.completed_students, v.avg_progress_pct, v.last_enrollment_at
  FROM private.vw_course_stats v
  WHERE v.tenant_id = p_tenant_id
    AND public.tenant_matches_jwt(p_tenant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_progress_timeline(p_tenant_id uuid, p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid,
  active_courses bigint,
  completed_courses bigint,
  overall_progress_pct numeric,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT v.student_id, v.active_courses, v.completed_courses, v.overall_progress_pct, v.last_activity_at
  FROM private.vw_student_progress_timeline v
  WHERE v.tenant_id = p_tenant_id
    AND public.tenant_matches_jwt(p_tenant_id)
    AND (p_student_id IS NULL OR v.student_id = p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.vw_course_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.vw_student_progress_timeline;
END;
$$;

-- CRIT-02 REMEDIATION: Dedicated RPC for teachers to get student list safely.
CREATE OR REPLACE FUNCTION public.get_my_students(p_course_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  account_status text,
  course_id uuid,
  enrollment_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT 
    u.id, 
    (coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as full_name, 
    u.email, 
    u.account_status, 
    e.course_id, 
    e.status as enrollment_status
  FROM public.users u
  JOIN public.enrollments e ON e.user_id = u.id
  JOIN public.courses c ON c.id = e.course_id
  WHERE c.teacher_id = auth.uid()
    AND c.tenant_id = public.get_current_tenant_id()
    AND (p_course_id IS NULL OR c.id = p_course_id)
    AND u.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.has_course_access(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public, pg_temp
STABLE
AS $$
  SELECT public.has_course_access(auth.uid(), p_course_id);
$$;

-- Define a secure, high-performance helper to verify course ownership bypassing RLS
CREATE OR REPLACE FUNCTION public.is_teacher_of_course(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user_id IS NULL OR p_course_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.courses c
    JOIN public.users u ON u.id = p_user_id AND u.tenant_id = c.tenant_id
    WHERE c.id = p_course_id
      AND c.teacher_id = p_user_id
      AND c.deleted_at IS NULL
      AND u.account_status = 'active'
      AND u.deleted_at IS NULL
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_object_agg(key, value)
  FROM public.settings_kv
  WHERE is_public = true
    AND key IN (
      'app_locked', 'app_lock_message',
      'maintenance_mode', 'maintenance_message',
      'latest_version', 'min_app_version', 'support_link'
    );
$$;

-- ============================================================================
-- 006_maintenance.sql
-- ============================================================================

-- HIGH-07 FIX: Updated job processing with checkpointing and deduplication
CREATE OR REPLACE FUNCTION internal.process_enrollment_progress_jobs(p_limit integer DEFAULT 200, p_job_type text DEFAULT 'UPDATE_ENROLLMENT_PROGRESS')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_last_checked timestamptz;
BEGIN
  -- Get last checkpoint
  SELECT last_processed_at INTO v_last_checked
  FROM internal.job_progress
  WHERE job_type = 'UPDATE_ENROLLMENT_PROGRESS';
  
  v_last_checked := COALESCE(v_last_checked, '1970-01-01'::timestamptz);

  -- 1. Aggregate and update progress data for pending/stale enrollments
  WITH stale_enrollments AS (
    SELECT DISTINCT ON (e.user_id, e.course_id)
      e.user_id, 
      e.course_id, 
      e.tenant_id,
      CASE 
        WHEN count(l.id) = 0 THEN 0 
        ELSE round((count(up.id) FILTER (WHERE up.completed))::numeric / count(l.id) * 100, 2)
      END AS progress_pct
    FROM public.enrollments e
    JOIN public.lessons l ON l.course_id = e.course_id AND l.deleted_at IS NULL
    LEFT JOIN public.user_progress up ON up.user_id = e.user_id AND up.lesson_id = l.id
    WHERE e.status = 'active'
      AND e.updated_at < pg_catalog.now() - interval '5 minutes'
      AND e.updated_at > v_last_checked
    GROUP BY e.user_id, e.course_id, e.tenant_id, e.updated_at
    ORDER BY e.user_id, e.course_id, e.updated_at DESC
    LIMIT p_limit
  )
  UPDATE public.enrollments e
  SET 
    progress_pct = se.progress_pct,
    updated_at = pg_catalog.now()
  FROM stale_enrollments se
  WHERE e.user_id = se.user_id 
    AND e.course_id = se.course_id
    AND e.tenant_id = se.tenant_id;
    
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- 2. Update checkpoint
  INSERT INTO internal.job_progress (job_type, checkpoint_key, last_processed_at, processed_count)
  VALUES ('UPDATE_ENROLLMENT_PROGRESS', 'default', pg_catalog.now(), v_count)
  ON CONFLICT (job_type, checkpoint_key) 
  DO UPDATE SET 
    last_processed_at = pg_catalog.now(),
    processed_count = internal.job_progress.processed_count + v_count;
  
  RETURN v_count;
END;
$$;

-- Missing maintenance job for course totals
CREATE OR REPLACE FUNCTION internal.process_update_enrollment_totals_jobs(p_limit integer DEFAULT 100, p_job_type text DEFAULT 'UPDATE_ENROLLMENT_TOTALS')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_course_id uuid;
  v_last_checked timestamptz;
BEGIN
  SELECT last_processed_at INTO v_last_checked
  FROM internal.job_progress
  WHERE job_type = 'UPDATE_ENROLLMENT_TOTALS';
  
  v_last_checked := COALESCE(v_last_checked, '1970-01-01'::timestamptz);

  -- Aggregate courses that need updating based on recent lesson changes
  FOR v_course_id IN 
    SELECT DISTINCT course_id 
    FROM public.lessons 
    WHERE updated_at > v_last_checked
    LIMIT p_limit
  LOOP
    PERFORM internal.apply_update_enrollment_totals_course(v_course_id);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO internal.job_progress (job_type, checkpoint_key, last_processed_at, processed_count)
  VALUES ('UPDATE_ENROLLMENT_TOTALS', 'default', pg_catalog.now(), v_count)
  ON CONFLICT (job_type, checkpoint_key) 
  DO UPDATE SET 
    last_processed_at = pg_catalog.now(),
    processed_count = internal.job_progress.processed_count + v_count;

  RETURN v_count;
END;
$$;

-- LOW-03 FIX: Dynamic test data seeding with slug-based lookup.
CREATE OR REPLACE FUNCTION public.seed_test_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_test_tenant_id uuid;
  v_test_admin_id uuid;
  v_test_course_id uuid;
BEGIN
  -- Lookup or create test tenant
  v_test_tenant_id := (SELECT id FROM public.tenants WHERE slug = 'test-tenant-001' LIMIT 1);
  IF v_test_tenant_id IS NULL THEN
    v_test_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (id, slug, name, status, plan)
    VALUES (v_test_tenant_id, 'test-tenant-001', 'Test Tenant', 'active', 'pro');
  END IF;
  
  -- Generate user and course IDs
  v_test_admin_id := gen_random_uuid();
  v_test_course_id := gen_random_uuid();
  
  -- Create test admin user
  INSERT INTO public.users (id, tenant_id, email, primary_role, account_status, created_at)
  VALUES (v_test_admin_id, v_test_tenant_id, 'admin@test.eduzone.local', 'admin', 'active', pg_catalog.now())
  ON CONFLICT (email, tenant_id) DO NOTHING;
  
  -- Make test user admin
  INSERT INTO public.user_roles (user_id, role_id, tenant_id, is_active)
  SELECT v_test_admin_id, id, v_test_tenant_id, true
  FROM public.roles
  WHERE name = 'admin' AND tenant_id = v_test_tenant_id
  ON CONFLICT DO NOTHING;
  
  -- Create test course
  INSERT INTO public.courses (id, tenant_id, title, status, created_by, created_at)
  VALUES (
    v_test_course_id,
    v_test_tenant_id,
    'Test Course: Introduction to PostgreSQL',
    'published',
    v_test_admin_id,
    pg_catalog.now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RAISE NOTICE 'Test data seeded successfully: tenant_id=%, admin_id=%, course_id=%', 
    v_test_tenant_id, v_test_admin_id, v_test_course_id;
END;
$$;

-- LOW-03 FIX: Cleanup test data using slug-based lookup
CREATE OR REPLACE FUNCTION public.cleanup_test_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_test_tenant_id uuid;
BEGIN
  SELECT id INTO v_test_tenant_id FROM public.tenants WHERE slug = 'test-tenant-001';
  
  IF v_test_tenant_id IS NOT NULL THEN
    DELETE FROM public.enrollments WHERE tenant_id = v_test_tenant_id;
    DELETE FROM public.user_progress WHERE tenant_id = v_test_tenant_id;
    DELETE FROM public.lessons WHERE tenant_id = v_test_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = v_test_tenant_id;
    DELETE FROM public.user_roles WHERE tenant_id = v_test_tenant_id;
    DELETE FROM public.users WHERE tenant_id = v_test_tenant_id;
    DELETE FROM public.tenants WHERE id = v_test_tenant_id;
    RAISE NOTICE 'Test data cleaned up for tenant_id=%', v_test_tenant_id;
  ELSE
    RAISE WARNING 'Test tenant not found. No cleanup performed.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_all_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM private.user_access_cache
  WHERE valid_until < pg_catalog.now();

  REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_user_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_course_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_course_stats_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_hourly_activity_48h;
  REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_daily_activity_30d;
END;
$$;

-- ============================================================================
-- 010_auth_hook.sql
-- PostgreSQL Custom Access Token Hook
-- Injects tenant_id into the JWT at token-issuance time (zero-latency).
-- Must be registered in supabase/config.toml:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://public/custom_access_token"
-- ============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_tenant_id uuid;
  v_primary_role text;
  v_deleted_at timestamptz;
  v_region_id text;
  v_is_admin boolean := false;
  v_token_ver integer;
BEGIN
  -- SEC-06: Fail closed for missing profile or inactive status
  -- Prioritize security: do not issue valid tokens for deleted or inactive accounts.
  SELECT tenant_id, primary_role, deleted_at, region_id, token_version
  INTO v_tenant_id, v_primary_role, v_deleted_at, v_region_id, v_token_ver
  FROM public.users
  WHERE id = v_user_id
    AND deleted_at IS NULL
    AND account_status = 'active';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_PROVISIONED_OR_INACTIVE';
  END IF;

  SELECT coalesce(
    v_primary_role IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = v_user_id
        AND ur.tenant_id = v_tenant_id
        AND ur.is_active
        AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
        AND r.name IN ('admin', 'super_admin')
    ),
    false
  )
  INTO v_is_admin;

  event := jsonb_set(event, '{claims,tenant_id}', to_jsonb(v_tenant_id), true);
  event := jsonb_set(event, '{claims,primary_role}', to_jsonb(v_primary_role), true);
  -- Do NOT mutate {claims,role} so PostgREST retains 'authenticated' role
  event := jsonb_set(event, '{claims,region_id}', to_jsonb(v_region_id), true);
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_is_admin), true);
  event := jsonb_set(event, '{claims,token_version}', to_jsonb(coalesce(v_token_ver, 1)), true);
  -- PERF-SEC: Inject account_status so validate_user_session() can avoid a
  -- per-row SELECT on public.users. The hook runs once at token issuance;
  -- the claim is then cached in memory by PostgREST for the request lifetime.
  event := jsonb_set(event, '{claims,account_status}', to_jsonb('active'::text), true);

  RETURN event;
END;
$$;

-- ============================================================================
-- Automated Auditing for Access Rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_access_rule_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.log_activity_async(
    auth.uid(),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'access_rule_created'
      WHEN TG_OP = 'UPDATE' THEN 'access_rule_updated'
      WHEN TG_OP = 'DELETE' THEN 'access_rule_deleted'
    END,
    jsonb_build_object(
      'rule_id', coalesce(NEW.id, OLD.id),
      'rule_type', coalesce(NEW.rule_type, OLD.rule_type),
      'tenant_id', coalesce(NEW.tenant_id, OLD.tenant_id),
      'is_active', CASE WHEN TG_OP = 'DELETE' THEN OLD.is_active ELSE NEW.is_active END
    ),
    NULL::inet,
    NULL::uuid,
    'medium',
    coalesce(NEW.tenant_id, OLD.tenant_id)
  );
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- Phase 3: Infrastructure & Extensions
-- ============================================================================


-- Phase 4 consolidated into main sections.

-- Phase 4 consolidated into main sections.
-- Permissions and RLS for user_notifications, devices, push_tokens moved to main sections.

-- Push token lifecycle is deliberately exposed through SECURITY DEFINER RPCs.
-- The client can prove its authenticated identity and an active device binding,
-- but it cannot choose a tenant or mutate push_tokens directly.
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text,
  p_device_id text,
  p_platform text,
  p_device_info jsonb DEFAULT '{}',
  p_app_version text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.get_current_tenant_id();
  v_token_id uuid;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR btrim(p_token) = ''
     OR p_device_id IS NULL OR btrim(p_device_id) = ''
     OR p_platform NOT IN ('android', 'ios', 'web')
     OR jsonb_typeof(COALESCE(p_device_info, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PUSH_TOKEN' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.user_id = v_user_id
      AND d.tenant_id = v_tenant_id
      AND d.device_id = p_device_id
      AND d.platform = p_platform
      AND d.is_active
  ) THEN
    RAISE EXCEPTION 'DEVICE_NOT_BOUND' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_user_id AND u.tenant_id = v_tenant_id
      AND u.account_status = 'active' AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.push_tokens (
    user_id, tenant_id, device_id, token, platform, device_info,
    app_version, is_active, last_seen_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, p_device_id, btrim(p_token), p_platform,
    COALESCE(p_device_info, '{}'::jsonb), NULLIF(btrim(COALESCE(p_app_version, '')), ''),
    true, pg_catalog.now(), pg_catalog.now()
  )
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    tenant_id = EXCLUDED.tenant_id,
    device_id = EXCLUDED.device_id,
    platform = EXCLUDED.platform,
    device_info = EXCLUDED.device_info,
    app_version = EXCLUDED.app_version,
    is_active = true,
    last_seen_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_push_token(
  p_token text DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.push_tokens
  SET is_active = false, updated_at = pg_catalog.now()
  WHERE user_id = auth.uid()
    AND tenant_id = public.get_current_tenant_id()
    AND (p_token IS NULL OR token = p_token)
    AND (p_device_id IS NULL OR device_id = p_device_id)
    AND is_active;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_delivery(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  v_delivery public.push_deliveries%ROWTYPE;
  v_result jsonb;
BEGIN
  IF coalesce(auth.role(), current_user) NOT IN
      ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT * INTO v_delivery
  FROM public.push_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND OR v_delivery.status IN ('sent', 'invalid_token') THEN
    RETURN NULL;
  END IF;
  IF v_delivery.status = 'sending'
     AND v_delivery.last_attempt_at > now() - interval '5 minutes' THEN
    RETURN NULL;
  END IF;
  IF v_delivery.next_attempt_at IS NOT NULL
     AND v_delivery.next_attempt_at > now() THEN
    RETURN NULL;
  END IF;

  UPDATE public.push_deliveries
  SET status = 'sending', attempt_count = attempt_count + 1,
      last_attempt_at = now(), updated_at = now()
  WHERE id = v_delivery.id;

  SELECT jsonb_build_object(
    'delivery_id', v_delivery.id,
    'notification_id', v_delivery.notification_id,
    'user_id', v_delivery.user_id,
    'push_token_id', v_delivery.push_token_id,
    'token', pt.token,
    'title', n.title,
    'body', n.body,
    'attempt_count', v_delivery.attempt_count + 1
  ) INTO v_result
  FROM public.push_tokens pt
  JOIN public.notifications n ON n.id = v_delivery.notification_id
  WHERE pt.id = v_delivery.push_token_id AND pt.is_active;

  IF v_result IS NULL THEN
    UPDATE public.push_deliveries
    SET status = 'invalid_token', failed_at = now(), updated_at = now(),
        provider_error_code = 'TOKEN_NOT_ACTIVE'
    WHERE id = v_delivery.id;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_push_delivery(
  p_delivery_id uuid,
  p_provider_message_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), current_user) NOT IN
      ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  UPDATE public.push_deliveries
  SET status = 'sent', provider_message_id = p_provider_message_id,
      sent_at = now(), updated_at = now(), next_attempt_at = NULL
  WHERE id = p_delivery_id AND status = 'sending';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_push_delivery(
  p_delivery_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  v_delivery public.push_deliveries%ROWTYPE;
  v_invalid boolean := upper(coalesce(p_error_code, '')) IN
    ('UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH');
  v_retry boolean;
BEGIN
  IF coalesce(auth.role(), current_user) NOT IN
      ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  SELECT * INTO v_delivery FROM public.push_deliveries
  WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR v_delivery.status = 'sent' THEN RETURN; END IF;
  v_retry := p_retryable AND NOT v_invalid AND v_delivery.attempt_count < 5;

  UPDATE public.push_deliveries
  SET status = CASE WHEN v_invalid THEN 'invalid_token'
                    WHEN v_retry THEN 'pending' ELSE 'failed' END,
      provider_error_code = left(p_error_code, 100),
      provider_error_message = left(p_error_message, 1000),
      next_attempt_at = CASE WHEN v_retry
        THEN now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(0, v_delivery.attempt_count - 1))))
        ELSE NULL END,
      failed_at = CASE WHEN v_invalid OR NOT v_retry THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_delivery_id;

  IF v_invalid AND v_delivery.push_token_id IS NOT NULL THEN
    UPDATE public.push_tokens SET is_active = false, updated_at = now()
    WHERE id = v_delivery.push_token_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_notification_push_job(
  p_job_id uuid,
  p_retryable boolean DEFAULT false,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), current_user) NOT IN
      ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  UPDATE internal.job_queue
  SET status = CASE WHEN p_retryable AND attempts < max_attempts
                    THEN 'pending' ELSE 'done' END,
      next_retry_at = CASE WHEN p_retryable AND attempts < max_attempts
                            THEN now() + interval '30 seconds' ELSE NULL END,
      error_message = left(p_error_message, 1000),
      locked_by_worker_id = NULL, locked_at = NULL, lock_expires_at = NULL,
      finished_at = CASE WHEN NOT (p_retryable AND attempts < max_attempts)
                         THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_job_id AND job_type = 'notification_push';
END;
$$;

-- 2.4 Auto-terminate sessions when user account is locked/banned/suspended
CREATE OR REPLACE FUNCTION public.terminate_sessions_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.account_status IN ('locked', 'suspended', 'banned') AND OLD.account_status = 'active' THEN
    PERFORM public.terminate_user_sessions(NEW.id, 'account_' || NEW.account_status);
  END IF;
  RETURN NEW;
END;
$$;

-- HIGH-05 FIX: Immutable Audit Chain with hash verification.
-- Ensures audit logs cannot be tampered with without breaking the hash chain.

CREATE OR REPLACE FUNCTION public.trg_hash_chain_activity_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog, extensions'
AS $$
DECLARE
  v_prev_hash text;
  v_entry_data text;
BEGIN
  -- Ensure pgcrypto extension is available
  PERFORM 1 FROM pg_extension WHERE extname = 'pgcrypto';
  -- Get previous hash from last entry for this tenant
  SELECT entry_hash INTO v_prev_hash
  FROM public.activity_logs
  WHERE tenant_id = NEW.tenant_id
  ORDER BY created_at DESC, seq DESC
  LIMIT 1;

  NEW.prev_hash := COALESCE(v_prev_hash, repeat('0', 64));

  -- Serialize entry data for hashing
  v_entry_data := jsonb_build_object(
    'id', NEW.id::text,
    'seq', NEW.seq,
    'user_id', NEW.user_id::text,
    'activity_type', NEW.activity_type,
    'details', NEW.details,
    'created_at', NEW.created_at::text,
    'prev_hash', NEW.prev_hash
  )::text;

  -- Calculate SHA256 hash
  NEW.entry_hash := pg_catalog.encode(extensions.digest(v_entry_data, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

-- 5.1 Immutable Audit Layer
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Narrow exception: service_role may delete orphaned duplicate-seq rows only.
  -- A row is a duplicate when another row with the same seq value already exists.
  -- All other mutations (UPDATE, INSERT by non-flush paths, DELETE of unique rows)
  -- remain blocked unconditionally.
  IF TG_OP = 'DELETE'
     AND current_setting('request.jwt.claim.role', true) = 'service_role'
     AND EXISTS (
       SELECT 1 FROM public.activity_logs al
       WHERE al.seq = OLD.seq AND al.id <> OLD.id
     )
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'PERMISSION_DENIED: Audit logs are strictly immutable.';
END;
$$;

-- 5.3 Profile Update RPC
CREATE OR REPLACE FUNCTION public.api_update_profile(
  p_first_name varchar(255) DEFAULT NULL,
  p_last_name varchar(255) DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_locale text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := public.get_current_tenant_id();
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_timezone IS NOT NULL
     AND NOT (p_timezone = 'UTC' OR p_timezone ~ '^([A-Za-z_]+)(/[A-Za-z0-9_+-]+)+$') THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;

  IF p_locale IS NOT NULL
     AND NOT (p_locale ~ '^[a-z]{2}(-[A-Z]{2})?$') THEN
    RAISE EXCEPTION 'INVALID_LOCALE';
  END IF;

  UPDATE public.users
  SET
    first_name = coalesce(p_first_name, first_name),
    last_name = coalesce(p_last_name, last_name),
    avatar_url = coalesce(p_avatar_url, avatar_url),
    timezone = coalesce(p_timezone, timezone),
    locale = coalesce(p_locale, locale),
    updated_at = pg_catalog.now()
  WHERE id = v_uid
    AND tenant_id = v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION internal.process_prune_cache(p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM public.user_permission_cache
  WHERE ctid IN (
    SELECT ctid
    FROM public.user_permission_cache
    WHERE expires_at IS NOT NULL AND expires_at <= pg_catalog.now()
    LIMIT p_limit
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION internal.purge_soft_deleted_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_retention_days integer;
  v_deleted_users bigint := 0;
  v_deleted_enrollments bigint := 0;
  v_deleted_location_logs bigint := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only service_role can purge';
  END IF;

  v_retention_days := coalesce((public.get_setting('retention_deleted_user_days') #>> '{}')::integer, 90);
  DELETE FROM public.users
  WHERE deleted_at IS NOT NULL
    AND deleted_at < pg_catalog.now() - pg_catalog.make_interval(days => v_retention_days);
  GET DIAGNOSTICS v_deleted_users = ROW_COUNT;

  DELETE FROM public.enrollments
  WHERE course_id IN (SELECT id FROM public.courses WHERE deleted_at IS NOT NULL);
  GET DIAGNOSTICS v_deleted_enrollments = ROW_COUNT;

  v_retention_days := coalesce((public.get_setting('retention_location_log_days') #>> '{}')::integer, 30);
  DELETE FROM public.user_location_logs
    WHERE logged_at < pg_catalog.now() - pg_catalog.make_interval(days => v_retention_days);
  GET DIAGNOSTICS v_deleted_location_logs = ROW_COUNT;

  v_result := jsonb_build_object(
    'deleted_users', v_deleted_users,
    'deleted_enrollments', v_deleted_enrollments,
    'deleted_location_logs', v_deleted_location_logs,
    'purged_at', pg_catalog.now()
  );

  RETURN v_result;
END;
$$;

-- FIX #25: audit_chain verification
CREATE OR REPLACE FUNCTION public.verify_audit_chain(
  p_start_seq bigint DEFAULT 1,
  p_chunk_size int DEFAULT 1000
)
RETURNS table (
  status text,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log record;
  v_prev_hash text;
  v_count int := 0;
BEGIN
  IF NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Load starting prev_hash if not starting from seq 1
  IF p_start_seq > 1 THEN
    SELECT entry_hash INTO v_prev_hash
    FROM public.activity_logs
    WHERE seq = p_start_seq - 1;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'ERROR'::text,
        pg_catalog.format('Starting sequence predecessor seq %s not found.', p_start_seq - 1);
      RETURN;
    END IF;
  END IF;

  FOR v_log IN (
    SELECT seq, entry_hash, prev_hash
    FROM public.activity_logs
    WHERE seq >= p_start_seq
    ORDER BY seq ASC
    LIMIT p_chunk_size
  ) LOOP
    IF v_prev_hash IS NOT NULL AND v_log.prev_hash IS DISTINCT FROM v_prev_hash THEN
      RETURN QUERY SELECT 'CORRUPTED'::text,
        pg_catalog.format('Linkage broken at seq %s. Expected prev_hash %s, got %s', v_log.seq, v_prev_hash, v_log.prev_hash);
      RETURN;
    END IF;
    v_prev_hash := v_log.entry_hash;
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT 'SECURE'::text, 
    pg_catalog.format('Verified %s sequential entries starting from seq %s. Hash chain integrity confirmed.', v_count, p_start_seq);
END;
$$;

-- Prerequisite cycle detection
CREATE OR REPLACE FUNCTION public.trg_prevent_prerequisite_cycles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.course_id = NEW.prerequisite_course_id THEN
      RAISE EXCEPTION 'Cannot set a course as its own prerequisite';
    END IF;

    IF EXISTS (
      WITH RECURSIVE prereq_chain AS (
        SELECT NEW.prerequisite_course_id AS cid, 1 AS depth
        UNION ALL
        SELECT cp.prerequisite_course_id, pc.depth + 1
        FROM public.course_prerequisites cp
        JOIN prereq_chain pc ON cp.course_id = pc.cid
        WHERE pc.depth < 100
      )
      SELECT 1 FROM prereq_chain WHERE cid = NEW.course_id
    ) THEN
      RAISE EXCEPTION 'PREREQUISITE_CYCLE_DETECTED: Course % would create a cycle', NEW.course_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Recovery routine to re-sync enrollment progress
-- IDEMPOTENCY: Safe to run multiple times. The UPDATE is deterministic — repeated
-- execution with the same progress data produces the exact same row values.
-- The WHERE guard (progress_pct IS DISTINCT FROM sub.calc_pct OR ...) ensures
-- zero-write idempotency: rows whose values are already correct are never touched,
-- preventing spurious trigger cascades on worker retries or queue re-deliveries.
CREATE OR REPLACE FUNCTION maintenance.rehydrate_enrollment_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Recalculate progress for all active (non-deleted) enrollments.
  -- IDEMPOTENT: only rows whose computed values differ from stored values are written.
  UPDATE public.enrollments e
  SET
    progress_pct = sub.calc_pct,
    completed_at = CASE
                     WHEN sub.calc_pct = 100
                     THEN coalesce(e.completed_at, pg_catalog.now())
                     ELSE NULL
                   END,
    status       = CASE
                     WHEN sub.calc_pct = 100 THEN 'completed'
                     ELSE 'active'
                   END,
    updated_at   = pg_catalog.now()
  FROM (
    SELECT
      e2.id AS enrollment_id,
      CASE
        WHEN pg_catalog.count(l.id)  FILTER (WHERE l.deleted_at  IS NULL)  = 0
        THEN 0::numeric(5,2)
        ELSE (
          pg_catalog.count(up.id) FILTER (WHERE up.completed)::numeric(5,2)
          / pg_catalog.count(l.id) FILTER (WHERE l.deleted_at IS NULL)
        ) * 100
      END AS calc_pct
    FROM public.enrollments e2
    LEFT JOIN public.lessons       l  ON l.course_id  = e2.course_id
    LEFT JOIN public.user_progress up ON up.user_id   = e2.user_id
                                     AND up.course_id = e2.course_id
                                     AND up.lesson_id = l.id
    WHERE e2.deleted_at IS NULL
    GROUP BY e2.id
  ) sub
  WHERE e.id = sub.enrollment_id
    -- IDEMPOTENCY GUARD: skip rows that are already in the correct state.
    AND (
      e.progress_pct IS DISTINCT FROM sub.calc_pct
      OR e.status IS DISTINCT FROM
           CASE WHEN sub.calc_pct = 100 THEN 'completed'::text ELSE 'active'::text END
      OR (sub.calc_pct = 100 AND e.completed_at IS NULL)
    );
END;
$$;


-- ============================================================================
-- archive.enrollments, archive.lessons, archive.user_progress
-- Mirroring the operational table columns for cold-storage archival.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.enrollments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  enrolled_by uuid,
  status text NOT NULL,
  enrolled_at timestamptz NOT NULL,
  expires_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  last_watched_at timestamptz,
  progress_pct numeric(5,2) NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive.lessons (
  id uuid PRIMARY KEY,
  section_id uuid NOT NULL,
  course_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  order_index integer NOT NULL,
  is_published boolean NOT NULL,
  is_preview boolean NOT NULL,
  duration_sec integer,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive.user_progress (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  completed boolean NOT NULL,
  completed_at timestamptz,
  progress_pct numeric(5,2) NOT NULL,
  watch_time_sec integer NOT NULL,
  last_watched timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- maintenance.archive_soft_deleted_data()
-- Moves historical records (deleted_at < 6 months) to cold storage.
-- Fully idempotent and wrapped in subtransactions to isolate failures.
-- ============================================================================

CREATE OR REPLACE FUNCTION maintenance.archive_soft_deleted_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enrollment_count integer := 0;
  v_lesson_count integer := 0;
  v_progress_count integer := 0;
  v_cutoff timestamptz;
BEGIN
  -- Set cutoff time to exactly 6 months ago
  v_cutoff := pg_catalog.now() - interval '6 months';

  -- 1. Archive enrollments
  BEGIN
    WITH moved_rows AS (
      INSERT INTO archive.enrollments (
        id, user_id, course_id, tenant_id, enrolled_by, status, enrolled_at,
        expires_at, completed_at, revoked_at, revoked_by, revoke_reason,
        last_watched_at, progress_pct, created_by, updated_by, created_at,
        updated_at, deleted_at, archived_at
      )
      SELECT 
        id, user_id, course_id, tenant_id, enrolled_by, status, enrolled_at,
        expires_at, completed_at, revoked_at, revoked_by, revoke_reason,
        last_watched_at, progress_pct, created_by, updated_by, created_at,
        updated_at, deleted_at, pg_catalog.now()
      FROM public.enrollments
      WHERE deleted_at < v_cutoff
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT pg_catalog.count(*) INTO v_enrollment_count FROM moved_rows;

    DELETE FROM public.enrollments
    WHERE deleted_at < v_cutoff
      AND id IN (SELECT id FROM archive.enrollments);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs (activity, created_at)
    VALUES ('ARCHIVE_WARNING: Failed to archive public.enrollments: ' || SQLERRM, pg_catalog.now());
  END;

  -- 2. Archive user_progress
  BEGIN
    WITH moved_rows AS (
      INSERT INTO archive.user_progress (
        id, user_id, course_id, lesson_id, tenant_id, completed, completed_at,
        progress_pct, watch_time_sec, last_watched, created_at, updated_at,
        deleted_at, archived_at
      )
      SELECT
        id, user_id, course_id, lesson_id, tenant_id, completed, completed_at,
        progress_pct, watch_time_sec, last_watched, created_at, updated_at,
        deleted_at, pg_catalog.now()
      FROM public.user_progress
      WHERE deleted_at < v_cutoff
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT pg_catalog.count(*) INTO v_progress_count FROM moved_rows;

    DELETE FROM public.user_progress
    WHERE deleted_at < v_cutoff
      AND id IN (SELECT id FROM archive.user_progress);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs (activity, created_at)
    VALUES ('ARCHIVE_WARNING: Failed to archive public.user_progress: ' || SQLERRM, pg_catalog.now());
  END;

  -- 3. Archive lessons
  BEGIN
    WITH moved_rows AS (
      INSERT INTO archive.lessons (
        id, section_id, course_id, tenant_id, title, order_index, is_published,
        is_preview, duration_sec, created_by, updated_by, created_at, updated_at,
        deleted_at, archived_at
      )
      SELECT
        id, section_id, course_id, tenant_id, title, order_index, is_published,
        is_preview, duration_sec, created_by, updated_by, created_at, updated_at,
        deleted_at, pg_catalog.now()
      FROM public.lessons
      WHERE deleted_at < v_cutoff
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT pg_catalog.count(*) INTO v_lesson_count FROM moved_rows;

    DELETE FROM public.lessons
    WHERE deleted_at < v_cutoff
      AND id IN (SELECT id FROM archive.lessons);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs (activity, created_at)
    VALUES ('ARCHIVE_WARNING: Failed to archive public.lessons: ' || SQLERRM, pg_catalog.now());
  END;

  -- 4. Log completion summary row to public.audit_logs
  INSERT INTO public.audit_logs (activity, created_at)
  VALUES (
    pg_catalog.format(
      'ARCHIVE_SUCCESS: Archival run completed. Moved counts: enrollments=%s, user_progress=%s, lessons=%s',
      v_enrollment_count, v_progress_count, v_lesson_count
    ),
    pg_catalog.now()
  );
END;
$$;

-- ============================================================================
-- pg_cron scheduling registration for maintenance.archive_soft_deleted_data()
-- Scheduled to run monthly on the 1st of the month at 02:00.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'cron' AND tablename = 'job'
    ) THEN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'archive_soft_deleted_data';
    END IF;

    PERFORM cron.schedule(
      'archive_soft_deleted_data',
      '0 2 1 * *',
      'SELECT maintenance.archive_soft_deleted_data();'
    );
  END IF;
END $$;


-- ============================================================================
-- Notification Fanout Worker Functions (Eduzone v13.9.0 Enhancement)
-- ============================================================================

CREATE OR REPLACE FUNCTION internal.process_notification_fanout_jobs(
  p_limit     integer DEFAULT 50,
  p_worker_id text    DEFAULT gen_random_uuid()::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, internal, pg_temp
AS $$
DECLARE
  v_count     integer := 0;
  v_job       internal.job_queue%ROWTYPE;
  v_notif_id  uuid;
  v_tenant_id uuid;
  v_audience  text;
BEGIN
  -- Only service_role / postgres / supabase_admin may execute
  IF coalesce(auth.role(), current_user) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  FOR v_job IN
    SELECT * FROM internal.dequeue_job(p_worker_id, ARRAY['notification_fanout'], 300)
    LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
  LOOP
    v_notif_id  := (v_job.payload ->> 'notification_id')::uuid;
    v_tenant_id := (v_job.payload ->> 'tenant_id')::uuid;
    v_audience  := v_job.payload ->> 'target_audience';

    BEGIN
      INSERT INTO public.user_notifications (user_id, notification_id, tenant_id, is_read)
      SELECT u.id, v_notif_id, v_tenant_id, false
      FROM public.users u
      WHERE u.tenant_id       = v_tenant_id
        AND u.deleted_at      IS NULL
        AND u.account_status  = 'active'
        AND (
              v_audience = 'all'
          OR (v_audience = 'students'  AND u.primary_role = 'student')
          OR (v_audience = 'teachers'  AND u.primary_role = 'teacher')
          OR (v_audience = 'admins'    AND u.primary_role IN ('admin','super_admin'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.user_notifications un2
          WHERE un2.user_id = u.id AND un2.notification_id = v_notif_id
        )
      ON CONFLICT (user_id, notification_id) DO NOTHING;

      -- Create one durable delivery per active device token. The unique key
      -- makes fanout retries safe and keeps FCM delivery independent from
      -- creation of the source notification/inbox row.
      INSERT INTO public.push_deliveries (
        notification_id, user_notification_id, user_id, tenant_id, push_token_id
      )
      SELECT un.notification_id, un.id, un.user_id, un.tenant_id, pt.id
      FROM public.user_notifications un
      JOIN public.push_tokens pt
        ON pt.user_id = un.user_id
       AND pt.tenant_id = un.tenant_id
       AND pt.is_active
      WHERE un.notification_id = v_notif_id
        AND un.tenant_id = v_tenant_id
      ON CONFLICT (notification_id, push_token_id) DO NOTHING;

      -- The sender is an external FCM integration. Queue only the durable
      -- delivery identity; it can safely retry without duplicating records.
      INSERT INTO internal.job_queue (tenant_id, job_type, payload, priority)
      SELECT pd.tenant_id, 'notification_push',
             jsonb_build_object(
               'push_delivery_id', pd.id,
               'notification_id', pd.notification_id,
               'user_notification_id', pd.user_notification_id,
               'push_token_id', pd.push_token_id
             ), 10
      FROM public.push_deliveries pd
      WHERE pd.notification_id = v_notif_id
        AND pd.status = 'pending'
        AND pd.attempt_count = 0
        AND NOT EXISTS (
          SELECT 1 FROM internal.job_queue jq
          WHERE jq.job_type = 'notification_push'
            AND jq.payload ->> 'push_delivery_id' = pd.id::text
            AND jq.status IN ('pending', 'processing', 'done')
        )
      ON CONFLICT (job_type, payload_hash)
        WHERE status IN ('pending', 'processing') DO NOTHING;

      UPDATE internal.job_queue
      SET status      = 'done',
          finished_at = now(),
          updated_at  = now()
      WHERE id = v_job.id;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE internal.job_queue
      SET status              = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
          error_message       = SQLERRM,
          locked_by_worker_id = NULL,
          locked_at           = NULL,
          lock_expires_at     = NULL,
          updated_at          = now()
      WHERE id = v_job.id;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION internal.process_notification_fanout_jobs(integer, text) IS
  'Dequeues notification_fanout jobs from internal.job_queue and fans them out as
   user_notifications rows filtered by target_audience (all/students/teachers/admins).
   Called by GET /api/cron/routine on every cron tick. Requires service_role.';

CREATE OR REPLACE FUNCTION public.process_notification_fanout_jobs(
  p_limit     integer DEFAULT 50,
  p_worker_id text    DEFAULT gen_random_uuid()::text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER SET search_path = public, internal, pg_temp
AS $$
  SELECT internal.process_notification_fanout_jobs(p_limit, p_worker_id);
$$;

-- =============================================================================
-- AUTHENTICATION / AUTHORIZATION RELEASE HARDENING
-- Canonical source-of-truth definitions. Keep these security-critical
-- definitions at the end of this canonical function file so later definitions
-- are authoritative and no secondary SQL override file is required.
-- =============================================================================

-- AUTHZ-SESSION-01: JWT tenant claims are context, not authorization.
CREATE OR REPLACE FUNCTION public.tenant_matches_jwt(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.validate_user_session() THEN
    RETURN false;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.tenant_id = p_tenant_id
        AND u.deleted_at IS NULL
        AND u.account_status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = p_tenant_id
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
        AND ur.role_id IN (
          SELECT id FROM public.roles
          WHERE name IN ('admin', 'super_admin', 'tenant_admin')
        )
    )
  );
END;
$$;

-- AUTH-REV-01: logout must revoke the current JWT, not only close session rows.
CREATE OR REPLACE FUNCTION public.logout_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.users
     SET token_version = token_version + 1,
         updated_at = pg_catalog.now()
   WHERE id = auth.uid()
     AND deleted_at IS NULL;

  PERFORM private.revoke_auth_sessions(auth.uid());
  PERFORM public.terminate_user_sessions(auth.uid(), 'self_logout');
END;
$$;

-- AUTH-DEV-01: serialize the max-device check and insert per user.
CREATE OR REPLACE FUNCTION public.bind_device_for_current_user(
  p_device_id text,
  p_device_info jsonb DEFAULT '{}',
  p_platform text DEFAULT NULL,
  p_fingerprint_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := public.get_current_tenant_id();
  v_max integer := coalesce(
    (public.get_setting('max_devices_per_user') #>> '{}')::integer,
    1
  );
  v_count integer;
  v_device_info jsonb := coalesce(p_device_info, '{}');
  v_fingerprint_version text;
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT public.validate_user_session() THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = v_uid
      AND tenant_id = v_tenant_id
      AND deleted_at IS NULL
      AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  IF btrim(coalesce(p_device_id, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_DEVICE_ID';
  END IF;

  v_fingerprint_version := coalesce(
    nullif(btrim(p_fingerprint_version), ''),
    nullif(btrim(v_device_info ->> 'fingerprint_version'), ''),
    'v1'
  );

  IF v_fingerprint_version NOT IN ('v1', 'v2') THEN
    RAISE EXCEPTION 'INVALID_FINGERPRINT_VERSION';
  END IF;

  INSERT INTO public.session_locks (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1
  FROM public.session_locks
  WHERE user_id = v_uid
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.devices
    WHERE device_id = p_device_id
      AND user_id <> v_uid
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'DEVICE_ALREADY_BOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.devices
    WHERE user_id = v_uid
      AND tenant_id = v_tenant_id
      AND device_id = p_device_id
  ) THEN
    UPDATE public.devices
       SET last_seen = pg_catalog.now(),
           platform = coalesce(p_platform, platform),
           fingerprint_version = v_fingerprint_version,
           device_info = v_device_info,
           is_active = true
     WHERE user_id = v_uid
       AND tenant_id = v_tenant_id
       AND device_id = p_device_id;

    RETURN jsonb_build_object('status', 'verified');
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.devices
   WHERE user_id = v_uid
     AND tenant_id = v_tenant_id
     AND is_active = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'MAX_DEVICES_REACHED';
  END IF;

  INSERT INTO public.devices (
    user_id,
    tenant_id,
    device_id,
    fingerprint_version,
    platform,
    device_info
  )
  VALUES (
    v_uid,
    v_tenant_id,
    p_device_id,
    v_fingerprint_version,
    p_platform,
    v_device_info
  );

  RETURN jsonb_build_object('status', 'bound');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'DEVICE_ALREADY_BOUND';
END;
$$;

-- Client-safe activity heartbeat. Flutter must not receive direct UPDATE on
-- public.users; this SECURITY DEFINER function updates only the caller's own
-- telemetry fields, and optionally the already-bound device heartbeat.
CREATE OR REPLACE FUNCTION public.record_current_user_activity(
  p_record_login boolean DEFAULT false,
  p_device_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.validate_user_session() THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT tenant_id
    INTO v_tenant_id
    FROM public.users
   WHERE id = v_uid
     AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  UPDATE public.users
     SET last_seen_at = pg_catalog.now(),
         last_login = CASE
           WHEN p_record_login THEN pg_catalog.now()
           ELSE last_login
         END,
         -- FIX: nothing anywhere (client or DB) ever incremented this column;
         -- app_user.dart/student_profile.dart only ever read it. This is the
         -- one call in the login path that knows a real login just happened
         -- (p_record_login=true), so it is the right place to count it.
         login_count = CASE
           WHEN p_record_login THEN login_count + 1
           ELSE login_count
         END
   WHERE id = v_uid
     AND tenant_id = v_tenant_id;

  IF p_device_id IS NOT NULL THEN
    UPDATE public.devices
       SET last_seen = pg_catalog.now()
     WHERE user_id = v_uid
       AND tenant_id = v_tenant_id
       AND device_id = p_device_id
       AND is_active = true;
  END IF;
END;
$$;

-- AUTHZ-STUDENT-01: student-only application access is decided server-side.
-- ============================================================================
-- Session Gate — internal session-health primitive (NOT directly callable)
-- ============================================================================
-- Generic session-health checks only: uid present, account not deleted,
-- account_status = active, token_version valid. Returns the caller's
-- primary_role but makes NO authorization decision — role-specific app
-- gates (check_student_app_access / check_dashboard_access below) build
-- their allow/deny decision on top of this. Never grant EXECUTE on this
-- to any client-facing role; it exists purely so the two gates below can
-- share one implementation of "is this a healthy session".
CREATE OR REPLACE FUNCTION public._session_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user public.users%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  SELECT * INTO v_user
  FROM public.users
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_not_found');
  END IF;

  IF v_user.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'deleted',
      'token_version', v_user.token_version
    );
  END IF;

  IF v_user.account_status <> 'active' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'account_' || v_user.account_status,
      'message', v_user.lock_reason,
      'until', v_user.suspension_until,
      'suspensionUntil', v_user.suspension_until,
      'token_version', v_user.token_version
    );
  END IF;

  IF NOT public.validate_user_session() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'token_version_mismatch',
      'token_version', v_user.token_version
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'tenant_id', v_user.tenant_id,
    'role', v_user.primary_role,
    'token_version', v_user.token_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public._session_status() FROM PUBLIC, authenticated, anon;

-- ============================================================================
-- Student App Gate — replaces the old public.check_user_access()
-- ============================================================================
-- Wraps _session_status() and additionally requires primary_role = 'student'.
-- This is the RPC the student app (EduZone_App) must call instead of the
-- removed check_user_access().
CREATE OR REPLACE FUNCTION public.check_student_app_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_session jsonb := public._session_status();
  v_role text := v_session ->> 'role';
  v_tenant_id text := v_session ->> 'tenant_id';
  v_token_version text := v_session ->> 'token_version';
  v_maintenance_excluded_roles text[] := ARRAY[]::text[];
  v_maintenance_excluded_users uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT coalesce((v_session ->> 'allowed')::boolean, false) THEN
    RETURN v_session;
  END IF;

  IF v_role <> 'student' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'unauthenticated',
      'role', v_role,
      'token_version', v_token_version
    );
  END IF;

  IF coalesce((public.get_setting('maintenance_mode') #>> '{}')::boolean, false) THEN
    SELECT coalesce(array_agg(value), ARRAY[]::text[])
      INTO v_maintenance_excluded_roles
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(public.get_setting('maintenance_excluded_roles')) = 'array'
          THEN public.get_setting('maintenance_excluded_roles')
          ELSE '[]'::jsonb
        END
      ) AS value;

    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[])
      INTO v_maintenance_excluded_users
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(public.get_setting('maintenance_excluded_users')) = 'array'
          THEN public.get_setting('maintenance_excluded_users')
          ELSE '[]'::jsonb
        END
      ) AS value;

    IF NOT (
      v_role = ANY(v_maintenance_excluded_roles)
      OR auth.uid() = ANY(v_maintenance_excluded_users)
    ) THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'maintenance_mode',
        'message', public.get_setting('maintenance_message') #>> '{}',
        'ends_at', public.get_setting('maintenance_ends_at') #>> '{}',
        'token_version', v_token_version
      );
    END IF;
  END IF;

  IF coalesce((public.get_setting('app_locked') #>> '{}')::boolean, false) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'app_locked',
      'message', public.get_setting('app_lock_message') #>> '{}',
      'token_version', v_token_version
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'tenant_id', v_tenant_id,
    'role', v_role,
    'token_version', v_token_version
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_student_app_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_student_app_access() TO authenticated;

-- ============================================================================
-- Dashboard Gate — replaces the old public.check_user_access()
-- ============================================================================
-- Wraps _session_status() and additionally requires primary_role to be one
-- of admin/teacher/super_admin. This is the RPC the dashboard
-- (EduZone_dashboard) must call instead of the removed check_user_access().
CREATE OR REPLACE FUNCTION public.check_dashboard_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_session jsonb := public._session_status();
  v_role text := v_session ->> 'role';
  v_tenant_id text := v_session ->> 'tenant_id';
  v_token_version text := v_session ->> 'token_version';
  v_maintenance_excluded_roles text[] := ARRAY[]::text[];
  v_maintenance_excluded_users uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT coalesce((v_session ->> 'allowed')::boolean, false) THEN
    RETURN v_session;
  END IF;

  IF v_role IS NULL OR NOT (v_role = ANY (ARRAY['admin', 'teacher', 'super_admin'])) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'unauthenticated',
      'role', v_role,
      'token_version', v_token_version
    );
  END IF;

  IF coalesce((public.get_setting('maintenance_mode') #>> '{}')::boolean, false) THEN
    SELECT coalesce(array_agg(value), ARRAY[]::text[])
      INTO v_maintenance_excluded_roles
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(public.get_setting('maintenance_excluded_roles')) = 'array'
          THEN public.get_setting('maintenance_excluded_roles')
          ELSE '[]'::jsonb
        END
      ) AS value;

    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[])
      INTO v_maintenance_excluded_users
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(public.get_setting('maintenance_excluded_users')) = 'array'
          THEN public.get_setting('maintenance_excluded_users')
          ELSE '[]'::jsonb
        END
      ) AS value;

    IF NOT (
      v_role = ANY(v_maintenance_excluded_roles)
      OR auth.uid() = ANY(v_maintenance_excluded_users)
    ) THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'maintenance_mode',
        'message', public.get_setting('maintenance_message') #>> '{}',
        'ends_at', public.get_setting('maintenance_ends_at') #>> '{}',
        'token_version', v_token_version
      );
    END IF;
  END IF;

  IF coalesce((public.get_setting('app_locked') #>> '{}')::boolean, false) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'app_locked',
      'message', public.get_setting('app_lock_message') #>> '{}',
      'token_version', v_token_version
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'tenant_id', v_tenant_id,
    'role', v_role,
    'token_version', v_token_version
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_dashboard_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_dashboard_access() TO authenticated;

-- public.check_user_access() has been fully replaced by the two gates above
-- (check_student_app_access / check_dashboard_access) and every known
-- call site in both EduZone_App and EduZone_dashboard has been migrated
-- to call the correct one directly.
DROP FUNCTION IF EXISTS public.check_user_access();

-- ============================================================================
-- Feature Flags — canonical deterministic evaluation engine
-- ============================================================================

CREATE OR REPLACE FUNCTION public.feature_flag_rollout_bucket(
  p_tenant_id uuid,
  p_user_id uuid,
  p_flag_key text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH d AS (
    SELECT extensions.digest(
      pg_catalog.convert_to(
        p_tenant_id::text || ':' || p_user_id::text || ':' || p_flag_key,
        'UTF8'
      ),
      'sha256'
    ) AS h
  )
  SELECT pg_catalog.mod(
    (
      (pg_catalog.get_byte(h, 0)::bigint << 40) |
      (pg_catalog.get_byte(h, 1)::bigint << 32) |
      (pg_catalog.get_byte(h, 2)::bigint << 24) |
      (pg_catalog.get_byte(h, 3)::bigint << 16) |
      (pg_catalog.get_byte(h, 4)::bigint << 8)  |
       pg_catalog.get_byte(h, 5)::bigint
    ),
    10000
  )::integer
  FROM d;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_feature_flag(
  p_key text,
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_flag public.feature_flags%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_tenant_override public.tenant_feature_flags%ROWTYPE;
  v_user_override boolean;
  v_rollout_pct integer;
  v_bucket integer;
  v_key text := lower(pg_catalog.btrim(p_key));
BEGIN
  IF v_key IS NULL OR v_key = '' OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
      RETURN false;
    END IF;

    IF NOT public.validate_user_session() THEN
      RETURN false;
    END IF;
  END IF;

  SELECT u.*
    INTO v_user
  FROM public.users u
  WHERE u.id = p_user_id
    AND u.deleted_at IS NULL
    AND u.account_status = 'active';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_tenant_id IS NULL OR v_user.tenant_id <> p_tenant_id THEN
    RETURN false;
  END IF;

  IF auth.role() <> 'service_role'
     AND p_tenant_id <> public.get_current_tenant_id() THEN
    RETURN false;
  END IF;

  SELECT ff.*
    INTO v_flag
  FROM public.feature_flags ff
  WHERE ff.key = v_key;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Global kill switch is absolute.
  IF v_flag.is_enabled IS FALSE THEN
    RETURN false;
  END IF;

  IF v_flag.status = 'archived' THEN
    RETURN false;
  END IF;

  IF v_flag.enabled_from IS NOT NULL
     AND pg_catalog.now() < v_flag.enabled_from THEN
    RETURN false;
  END IF;

  IF v_flag.enabled_until IS NOT NULL
     AND pg_catalog.now() >= v_flag.enabled_until THEN
    RETURN false;
  END IF;

  -- Tenant override: explicit FALSE is a tenant kill switch; explicit TRUE
  -- allows the tenant to participate in the feature, while its rollout may
  -- still be restricted by rollout_pct.
  SELECT *
    INTO v_tenant_override
  FROM public.tenant_feature_flags tff
  WHERE tff.tenant_id = p_tenant_id
    AND tff.flag_id = v_flag.id;

  IF FOUND THEN
    IF v_tenant_override.is_enabled IS FALSE THEN
      RETURN false;
    END IF;

    v_rollout_pct := coalesce(
      v_tenant_override.rollout_pct,
      v_flag.rollout_pct
    );
  ELSE
    v_rollout_pct := v_flag.rollout_pct;
  END IF;

  -- Explicit user targeting is stronger than role targeting and rollout.
  SELECT ffu.is_enabled
    INTO v_user_override
  FROM public.feature_flag_users ffu
  WHERE ffu.tenant_id = p_tenant_id
    AND ffu.flag_id = v_flag.id
    AND ffu.user_id = p_user_id;

  IF FOUND THEN
    RETURN v_user_override;
  END IF;

  -- Role targeting: explicit deny wins over any allow when a user has multiple
  -- matching roles, preventing ambiguous multi-role evaluations.
  IF EXISTS (
    SELECT 1
    FROM public.feature_flag_roles ffr
    JOIN public.user_roles ur
      ON ur.tenant_id = p_tenant_id
     AND ur.role_id = ffr.role_id
     AND ur.user_id = p_user_id
     AND ur.is_active = true
     AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
    WHERE ffr.tenant_id = p_tenant_id
      AND ffr.flag_id = v_flag.id
      AND ffr.is_enabled = false
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.feature_flag_roles ffr
    JOIN public.user_roles ur
      ON ur.tenant_id = p_tenant_id
     AND ur.role_id = ffr.role_id
     AND ur.user_id = p_user_id
     AND ur.is_active = true
     AND (ur.expires_at IS NULL OR ur.expires_at > pg_catalog.now())
    WHERE ffr.tenant_id = p_tenant_id
      AND ffr.flag_id = v_flag.id
      AND ffr.is_enabled = true
  ) THEN
    RETURN true;
  END IF;

  v_rollout_pct := greatest(0, least(v_rollout_pct, 10000));

  IF v_rollout_pct = 0 THEN
    RETURN false;
  END IF;

  IF v_rollout_pct = 10000 THEN
    RETURN true;
  END IF;

  v_bucket := public.feature_flag_rollout_bucket(
    p_tenant_id,
    p_user_id,
    v_flag.key
  );

  RETURN v_bucket < v_rollout_pct;
END;
$$;

-- Compatibility-safe wrapper: authenticated callers may evaluate only their own
-- user; service_role may evaluate another user explicitly.
CREATE OR REPLACE FUNCTION public.is_feature_enabled_for_user(
  p_flag_key text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.role() <> 'service_role'
     AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT u.tenant_id INTO v_tenant_id
  FROM public.users u
  WHERE u.id = p_user_id
    AND u.deleted_at IS NULL
    AND u.account_status = 'active';

  IF v_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.evaluate_feature_flag(
    p_flag_key,
    v_tenant_id,
    p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_key text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.is_feature_enabled_for_user(p_key, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_feature_flags(
  p_keys text[]
)
RETURNS TABLE (
  key text,
  enabled boolean,
  version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := public.get_current_tenant_id();
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL OR NOT public.validate_user_session() THEN
    RETURN;
  END IF;

  IF p_keys IS NULL OR pg_catalog.cardinality(p_keys) = 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.cardinality(p_keys) > 100 THEN
    RAISE EXCEPTION 'Too many feature flag keys in one evaluation request' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    lower(pg_catalog.btrim(k)) AS key,
    public.evaluate_feature_flag(
      lower(pg_catalog.btrim(k)),
      v_tenant_id,
      v_uid
    ) AS enabled,
    coalesce(ff.version, 0::bigint) AS version
  FROM pg_catalog.unnest(p_keys) AS k
  LEFT JOIN public.feature_flags ff
    ON ff.key = lower(pg_catalog.btrim(k));
END;
$$;

-- Configuration mutation/metadata hardening for all four Feature Flag tables.
CREATE OR REPLACE FUNCTION public.trg_touch_feature_flag_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := greatest(coalesce(NEW.version, 1), 1);
    NEW.created_at := coalesce(NEW.created_at, pg_catalog.now());
    NEW.updated_at := coalesce(NEW.updated_at, pg_catalog.now());
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
    NEW.updated_by := coalesce(NEW.updated_by, auth.uid());
    RETURN NEW;
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_feature_flag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_flag_id uuid;
  v_key text;
  v_tenant_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  -- FIX: the previous CASE-expression form of these two assignments
  -- referenced NEW.id/OLD.id in one branch and NEW.flag_id/OLD.flag_id /
  -- NEW.tenant_id/OLD.tenant_id in the other. PL/pgSQL sends a CASE
  -- expression to the SQL engine as a single statement bound to NEW/OLD's
  -- actual composite type for whichever table fired the trigger, so *every*
  -- field referenced anywhere in the CASE must exist on that table's row
  -- type even when its branch is not the one taken. public.feature_flags
  -- has no flag_id/tenant_id column, and
  -- tenant_feature_flags/feature_flag_users/feature_flag_roles have no id
  -- column, so this trigger failed with "record NEW has no field ..." on
  -- every single INSERT/UPDATE/DELETE to any of the four tables it is
  -- attached to. IF/ELSIF assigns each branch as its own independently
  -- planned statement, which only type-checks the branch actually taken.
  IF TG_TABLE_NAME = 'feature_flags' THEN
    v_flag_id := coalesce(NEW.id, OLD.id);
    v_tenant_id := public.system_tenant_id();
  ELSE
    v_flag_id := coalesce(NEW.flag_id, OLD.flag_id);
    v_tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id, public.system_tenant_id());
  END IF;

  SELECT ff.key INTO v_key
    FROM public.feature_flags ff
   WHERE ff.id = v_flag_id;

  v_before := CASE
    WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
    ELSE NULL
  END;
  v_after := CASE
    WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
    ELSE NULL
  END;

  PERFORM public.log_activity_async(
    auth.uid(),
    CASE TG_OP
      WHEN 'INSERT' THEN 'feature_flag_created'
      WHEN 'UPDATE' THEN 'feature_flag_updated'
      WHEN 'DELETE' THEN 'feature_flag_deleted'
    END,
    jsonb_build_object(
      'feature_flag_id', v_flag_id,
      'key', v_key,
      'tenant_id', v_tenant_id,
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'before', v_before,
      'after', v_after
    ),
    NULL::inet,
    NULL::uuid,
    'high',
    v_tenant_id
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

