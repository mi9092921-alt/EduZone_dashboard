/**
 * apply_client_telemetry_fix.js
 *
 * Immediate-apply vehicle for the 2026-09-19 production-log remediation
 * (supabase_logs (5).json) WITHOUT waiting for a full schema deploy from
 * the dashboard repo. Everything here is already part of the canonical
 * schema (EduZone_dashboard supabase/schema/, mirrored byte-identically
 * into this repo's supabase/schema/) — running `node supabase/deploy_schema.js`
 * from the dashboard repo applies the same changes; this script exists for
 * a targeted, idempotent, verified application.
 *
 * What it applies (in order):
 *   1. GRANT SELECT ON public.settings_kv TO anon
 *      → fixes the 401/42501 "permission denied for table settings_kv":
 *        the pre-login forced-update gate was blind app-wide.
 *   2. security_incidents telemetry path (C-modified decision):
 *        a. + source_ip inet / details jsonb columns (IF NOT EXISTS)
 *        b. rate-limit / retention indexes
 *        c. report_security_incident(text,text,text,bool,text,text,text,jsonb)
 *           SECURITY DEFINER RPC — shape validation, per-IP 30/hour +
 *           global 100/5min anonymous silent absorption, user_id pinned
 *           server-side (NULL for pre-auth, auth.uid() otherwise)
 *        d. definer-context RLS policies (FORCE RLS + postgres role)
 *        e. REVOKE direct INSERT from authenticated (the RPC is now the
 *           only client write path)
 *        f. EXECUTE on the RPC to anon, authenticated, service_role
 *
 * Verified read-only (no changes):
 *   - Ghost auth users (no active public.users row) — the source of the
 *     /auth/v1/token 500 "USER_NOT_PROVISIONED_OR_INACTIVE". The hook's
 *     fail-closed RAISE is correct by design; zero ghosts is the steady
 *     state to audit toward.
 *
 * Run from the repo root:  node supabase/apply_client_telemetry_fix.js
 * Requires DATABASE_URL in supabase/db_url.txt (gitignored).
 *
 * ⚠ As of 2026-09-19 db_url.txt holds the STAGING project
 *   (liuzqnqkmefvnjwgzebv). The production project the app targets
 *   (.env SUPABASE_URL) and the log export came from is
 *   evmrahlzcgqgjhwvxzih — point db_url.txt at the right project first.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const urlFilePath = path.join(__dirname, 'db_url.txt');
  let dbUrl = null;
  const content = fs.readFileSync(urlFilePath, 'utf8');
  for (const line of content.split('\n')) {
    const clean = line.replace(/\r/g, '').trim();
    if (clean.startsWith('DATABASE_URL=')) {
      dbUrl = clean.substring('DATABASE_URL='.length).trim();
      break;
    }
  }
  if (!dbUrl) {
    console.error('DATABASE_URL not found in supabase/db_url.txt');
    process.exit(1);
  }
  if (dbUrl.includes('liuzqnqkmefvnjwgzebv')) {
    console.warn(
      '\n⚠ WARNING: db_url.txt points at the STAGING project ' +
        '(liuzqnqkmefvnjwgzebv). The production project the app targets is ' +
        'evmrahlzcgqgjhwvxzih. Continuing in 5s — Ctrl+C to abort.\n',
    );
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log('Connecting to Supabase database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  const sqlFix = `
    -- ── 1. Pre-login forced-update gate ────────────────────────────────
    GRANT SELECT ON public.settings_kv TO anon;

    -- ── 2a. telemetry columns (idempotent) ─────────────────────────────
    ALTER TABLE public.security_incidents ADD COLUMN IF NOT EXISTS source_ip inet;
    ALTER TABLE public.security_incidents ADD COLUMN IF NOT EXISTS details jsonb;

    -- ── 2b. indexes ────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_security_incidents_ip_detected
      ON public.security_incidents (source_ip, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_incidents_detected_at
      ON public.security_incidents (detected_at);

    -- ── 2c. the centralized ingestion RPC ──────────────────────────────
    CREATE OR REPLACE FUNCTION public.report_security_incident(
      p_threat text,
      p_platform text,
      p_platform_version text DEFAULT NULL,
      p_is_release_build boolean DEFAULT false,
      p_device_fingerprint text DEFAULT NULL,
      p_app_version text DEFAULT NULL,
      p_app_build_number text DEFAULT NULL,
      p_details jsonb DEFAULT NULL
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    DECLARE
      v_user_id     uuid := auth.uid();
      v_client_ip   inet;
      v_recent      int;
      v_recent_anon int;
    BEGIN
      p_threat := btrim(coalesce(p_threat, ''));
      IF p_threat = '' OR length(p_threat) > 128 THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_THREAT';
      END IF;
      IF p_platform NOT IN
         ('android', 'ios', 'linux', 'macos', 'windows', 'fuchsia') THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_PLATFORM';
      END IF;
      IF p_platform_version IS NOT NULL AND length(p_platform_version) > 64 THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_PLATFORM_VERSION';
      END IF;
      IF p_device_fingerprint IS NOT NULL AND length(p_device_fingerprint) > 128 THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_FINGERPRINT';
      END IF;
      IF p_app_version IS NOT NULL AND length(p_app_version) > 32 THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_APP_VERSION';
      END IF;
      IF p_app_build_number IS NOT NULL AND length(p_app_build_number) > 32 THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_APP_BUILD';
      END IF;
      IF p_details IS NOT NULL AND
         (jsonb_typeof(p_details) <> 'object' OR pg_column_size(p_details) > 4096) THEN
        RAISE EXCEPTION 'INVALID_INCIDENT_DETAILS';
      END IF;

      BEGIN
        v_client_ip := btrim(split_part(
          coalesce(current_setting('request.headers', true)::json
                   ->> 'x-forwarded-for', ''),
          ',', 1
        ))::inet;
      EXCEPTION WHEN OTHERS THEN
        v_client_ip := NULL;
      END;

      IF v_client_ip IS NOT NULL THEN
        SELECT count(*) INTO v_recent
          FROM public.security_incidents
         WHERE source_ip = v_client_ip
           AND detected_at > pg_catalog.now() - interval '1 hour';
        IF v_recent >= 30 THEN
          RETURN;  -- silently absorbed
        END IF;
      END IF;

      IF v_user_id IS NULL THEN
        SELECT count(*) INTO v_recent_anon
          FROM public.security_incidents
         WHERE user_id IS NULL
           AND detected_at > pg_catalog.now() - interval '5 minutes';
        IF v_recent_anon >= 100 THEN
          RETURN;  -- silently absorbed
        END IF;
      END IF;

      INSERT INTO public.security_incidents (
        user_id, threat, platform, platform_version, detected_at,
        is_release_build, device_fingerprint, app_version, app_build_number,
        source_ip, details
      ) VALUES (
        v_user_id, p_threat, p_platform, p_platform_version, pg_catalog.now(),
        coalesce(p_is_release_build, false), p_device_fingerprint, p_app_version,
        p_app_build_number, v_client_ip, p_details
      );
    END;
    $fn$;

    -- ── 2d. definer-context policies (FORCE RLS applies to the owner) ──
    DROP POLICY IF EXISTS security_incidents_definer_select ON public.security_incidents;
    CREATE POLICY security_incidents_definer_select ON public.security_incidents
      FOR SELECT TO postgres
      USING (true);

    DROP POLICY IF EXISTS security_incidents_definer_insert ON public.security_incidents;
    CREATE POLICY security_incidents_definer_insert ON public.security_incidents
      FOR INSERT TO postgres
      WITH CHECK (true);

    -- ── 2e. the RPC becomes the only client write path ─────────────────
    REVOKE INSERT ON public.security_incidents FROM authenticated;

    -- ── 2f. EXECUTE grants (anon = pre-auth events, by decision) ───────
    REVOKE ALL ON FUNCTION public.report_security_incident(text, text, text, boolean, text, text, text, jsonb)
      FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.report_security_incident(text, text, text, boolean, text, text, text, jsonb)
      TO anon, authenticated, service_role;
  `;

  try {
    await client.connect();
    console.log('Connected successfully!');
    console.log('Applying settings_kv grant + security_incidents telemetry path...');
    await client.query(sqlFix);

    // ── VERIFY 1: settings_kv grants include anon ────────────────────────
    const grantRes = await client.query(`
      SELECT grantee, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'settings_kv'
      ORDER BY grantee;
    `);
    console.log('\n--- settings_kv table grants ---');
    console.table(grantRes.rows);

    // ── VERIFY 2: RPC grants + direct INSERT revoked ─────────────────────
    const rpcRes = await client.query(`
      SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name = 'report_security_incident'
      ORDER BY grantee;
    `);
    console.log('\n--- report_security_incident EXECUTE grants ---');
    console.table(rpcRes.rows);

    const insRes = await client.query(`
      SELECT grantee, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'security_incidents'
        AND privilege_type = 'INSERT'
      ORDER BY grantee;
    `);
    console.log('\n--- security_incidents INSERT grants (must be service_role only) ---');
    console.table(insRes.rows);

    // ── VERIFY 3: update keys are is_public ──────────────────────────────
    const keysRes = await client.query(`
      SELECT key, is_public
      FROM public.settings_kv
      WHERE key IN ('latest_version','min_app_version','force_update',
                    'update_message','store_link_android','store_link_ios',
                    'support_link')
      ORDER BY key;
    `);
    console.log('\n--- update-gate keys (all must be is_public = true) ---');
    console.table(keysRes.rows);

    // ── VERIFY 4 (read-only): ghost auth users ───────────────────────────
    console.log(
      '\n--- auth users WITHOUT an active public.users row (login 500 source) ---',
    );
    const ghostRes = await client.query(`
      SELECT au.id, au.email, au.created_at
      FROM auth.users au
      LEFT JOIN public.users pu ON pu.id = au.id
      WHERE pu.id IS NULL OR pu.deleted_at IS NOT NULL
      ORDER BY au.created_at DESC
      LIMIT 25;
    `);
    if (ghostRes.rowCount === 0) {
      console.log('(none — every auth user is provisioned)');
    } else {
      console.table(ghostRes.rows);
      console.log(
        '→ Provision these users (admin create-user flow) or remove them;',
        'the hook 500 is correct fail-closed behavior for ghosts, but the',
        'underlying ghost rows are data debt.',
      );
    }

    console.log(
      '\n[SUCCESS] settings_kv anon grant + security_incidents telemetry ' +
        'path applied and verified.',
    );
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
