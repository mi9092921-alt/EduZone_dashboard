import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  // Define fail-safe functions
  const sql = `
    -- 1. HARDENED get_auth_user_id WITH FAIL-SAFE
    CREATE OR REPLACE FUNCTION public.get_auth_user_id()
    RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_token_ver integer := (auth.jwt() ->> 'token_version')::integer;
    BEGIN
      IF v_uid IS NULL THEN RETURN NULL; END IF;
      
      -- Validate against users table
      IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = v_uid 
          AND (
            v_token_ver IS NULL 
            OR token_version = v_token_ver
          )
          AND account_status = 'active'
          AND deleted_at IS NULL
      ) THEN
        RETURN NULL;
      END IF;
      
      RETURN v_uid;
    END;
    $$;

    -- 2. HARDENED validate_user_session WITH FAIL-SAFE
    CREATE OR REPLACE FUNCTION public.validate_user_session()
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_jwt_claims jsonb := current_setting('request.jwt.claims', true)::jsonb;
      v_account_status text;
      v_token_ver integer;
    BEGIN
      IF v_uid IS NULL THEN RETURN false; END IF;

      -- Fast path: check claims injected by custom_access_token hook in JWT
      IF v_jwt_claims IS NOT NULL THEN
        v_account_status := v_jwt_claims ->> 'account_status';
        v_token_ver := (v_jwt_claims ->> 'token_version')::int;

        IF v_account_status = 'active' AND (
          v_token_ver IS NULL 
          OR v_token_ver IS NOT DISTINCT FROM coalesce(
            (v_jwt_claims -> 'app_metadata' ->> 'token_version')::int,
            0
          )
        ) THEN
          RETURN true;
        END IF;
      END IF;

      -- Fail-safe: Query users table directly if JWT hook claims are not populated/running
      RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = v_uid
          AND deleted_at IS NULL
          AND account_status = 'active'
      );
    END;
    $$;

    -- 3. HARDENED is_admin_with_session_validation WITH FAIL-SAFE
    CREATE OR REPLACE FUNCTION public.is_admin_with_session_validation()
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_jwt_claims jsonb := current_setting('request.jwt.claims', true)::jsonb;
      v_account_status text;
      v_primary_role text;
      v_is_admin boolean;
    BEGIN
      IF v_uid IS NULL THEN
        RETURN false;
      END IF;

      -- Try JWT custom claims first (fastest, zero DB query)
      IF v_jwt_claims IS NOT NULL THEN
        v_account_status := v_jwt_claims ->> 'account_status';
        v_primary_role := v_jwt_claims ->> 'primary_role';
        v_is_admin := coalesce((v_jwt_claims ->> 'is_admin')::boolean, false);

        IF v_account_status = 'active' AND v_primary_role IN ('admin', 'super_admin') AND v_is_admin THEN
          RETURN true;
        END IF;
      END IF;

      -- Fail-safe: Query users table directly if JWT hook claims are not populated/running
      RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = v_uid
          AND deleted_at IS NULL
          AND account_status = 'active'
          AND primary_role IN ('admin', 'super_admin')
      );
    END;
    $$;

    -- 4. HARDENED is_current_user_super_admin_lite WITH FAIL-SAFE
    CREATE OR REPLACE FUNCTION public.is_current_user_super_admin_lite()
    RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_role text := auth.jwt() ->> 'primary_role';
    BEGIN
      IF v_uid IS NULL THEN RETURN false; END IF;
      
      IF v_role IS NOT NULL THEN
        RETURN v_role = 'super_admin';
      END IF;
      
      RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = v_uid
          AND deleted_at IS NULL
          AND account_status = 'active'
          AND primary_role = 'super_admin'
      );
    END;
    $$;

    -- 5. HARDENED is_current_user_admin_lite WITH FAIL-SAFE
    CREATE OR REPLACE FUNCTION public.is_current_user_admin_lite()
    RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_role text := auth.jwt() ->> 'primary_role';
      v_is_admin boolean := coalesce((auth.jwt() ->> 'is_admin')::boolean, false);
    BEGIN
      IF v_uid IS NULL THEN RETURN false; END IF;
      
      IF v_role IS NOT NULL THEN
        RETURN v_is_admin OR v_role IN ('admin', 'super_admin');
      END IF;
      
      RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = v_uid
          AND deleted_at IS NULL
          AND account_status = 'active'
          AND primary_role IN ('admin', 'super_admin')
      );
    END;
    $$;
  `;

  console.log('Applying hardened fail-safe auth functions in SQL...');
  await client.query(sql);
  console.log('Hardened functions successfully applied!');

  console.log('Sending reload schema notification to Postgrest...');
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log('Schema reload triggered!');

  await client.end();
}

run().catch(console.error);
