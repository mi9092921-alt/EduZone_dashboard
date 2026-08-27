-- Archived: this draft was superseded by the canonical definitions in
-- supabase/schema/03_tables.sql, 05_indexes.sql, 07_functions.sql, and
-- 10_permissions.sql. It is retained for audit history and is not active.

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

CREATE INDEX IF NOT EXISTS idx_push_tokens_device_active
  ON public.push_tokens (user_id, device_id) WHERE is_active;

-- The original draft also contained the register_push_token and
-- deactivate_push_token definitions and their grants. The authoritative,
-- maintained copies are in supabase/schema/07_functions.sql and 10_permissions.sql.

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text, p_device_id text, p_platform text,
  p_device_info jsonb DEFAULT '{}', p_app_version text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
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
    WHERE d.user_id = v_user_id AND d.tenant_id = v_tenant_id
      AND d.device_id = p_device_id AND d.is_active
  ) THEN
    RAISE EXCEPTION 'DEVICE_NOT_BOUND' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.push_tokens (
    user_id, tenant_id, device_id, token, platform, device_info,
    app_version, is_active, last_seen_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, p_device_id, btrim(p_token), p_platform,
    COALESCE(p_device_info, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_app_version, '')), ''), true, now(), now()
  )
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id, tenant_id = EXCLUDED.tenant_id,
    device_id = EXCLUDED.device_id, platform = EXCLUDED.platform,
    device_info = EXCLUDED.device_info, app_version = EXCLUDED.app_version,
    is_active = true, last_seen_at = now(), updated_at = now()
  RETURNING id INTO v_token_id;
  RETURN v_token_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_push_token(
  p_token text DEFAULT NULL, p_device_id text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.push_tokens
  SET is_active = false, updated_at = now()
  WHERE user_id = auth.uid() AND tenant_id = public.get_current_tenant_id()
    AND (p_token IS NULL OR token = p_token)
    AND (p_device_id IS NULL OR device_id = p_device_id) AND is_active;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.push_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_push_token(text, text, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, jsonb, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.deactivate_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_push_token(text, text)
  TO authenticated, service_role;
