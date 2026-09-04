-- Fuller stub of Supabase's auth/GoTrue schema, sized to exactly the
-- auth.* surface referenced anywhere in supabase/schema/*.sql
-- (confirmed via: grep -ohE "auth\.[a-zA-Z_]+" supabase/schema/*.sql | sort -u
--  -> auth.hook, auth.identities, auth.jwt, auth.role, auth.sessions,
--     auth.uid, auth.users).
-- Column shapes for auth.users / auth.identities are taken directly from
-- the INSERT statements already in supabase/schema/11_seed_reference.sql
-- so the real seed file can load against this stub unmodified.
-- This file lives only under scripts/security/local-test-harness/ and is
-- never applied to a real Supabase project.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id             uuid,
  email                   text,
  encrypted_password      text,
  email_confirmed_at      timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  role                    text DEFAULT 'authenticated',
  aud                     text DEFAULT 'authenticated',
  raw_app_meta_data       jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data      jsonb DEFAULT '{}'::jsonb,
  is_super_admin          boolean DEFAULT false,
  confirmation_token      text DEFAULT '',
  recovery_token          text DEFAULT '',
  email_change_token_new  text DEFAULT '',
  email_change            text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  identity_data    jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  provider_id      text,
  last_sign_in_at  timestamptz,
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  not_after   timestamptz
);

-- GUCs set per-connection by the test runner to impersonate a given
-- signed-in user, mirroring what PostgREST sets from a verified JWT:
--   request.jwt.claim.sub   -> auth.uid()
--   request.jwt.claim.role  -> auth.role()
--   request.jwt.claims      -> auth.jwt()  (full claims object)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

-- Minimal stub of Supabase Storage's schema (storage.buckets /
-- storage.objects), sized to exactly what 10_permissions.sql /
-- VALIDATION.sql reference. RLS is enabled on storage.objects by
-- default in every real Supabase project, so it is enabled here too.
-- Minimal stub of Supabase Vault (schema `vault`), sized to exactly
-- what private.get_kms_key() reads (vault.decrypted_secrets, keyed by
-- `name`). The key below is a random TEST-ONLY value generated fresh
-- for this disposable harness — it is never used anywhere outside
-- this local database and must never be treated as a real secret.
CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS vault._secrets (
  name              text PRIMARY KEY,
  decrypted_secret  text NOT NULL
);

CREATE VIEW vault.decrypted_secrets AS
  SELECT name, decrypted_secret FROM vault._secrets;

CREATE OR REPLACE FUNCTION vault.create_secret(p_secret text, p_name text)
RETURNS uuid
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO vault._secrets (name, decrypted_secret)
  VALUES (p_name, p_secret)
  ON CONFLICT (name) DO UPDATE SET decrypted_secret = EXCLUDED.decrypted_secret;
  RETURN gen_random_uuid();
END;
$$;

SELECT vault.create_secret(md5(random()::text || clock_timestamp()::text) || md5(random()::text), 'eduzone_kms_key');

CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  public      boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id   text REFERENCES storage.buckets(id),
  name        text,
  owner       uuid,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  metadata    jsonb
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA auth TO authenticated, anon, authenticator;
GRANT SELECT ON auth.users, auth.sessions, auth.identities TO authenticated, anon;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    CREATE ROLE dashboard_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN SUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_privileged_role') THEN
    CREATE ROLE supabase_privileged_role NOLOGIN;
  END IF;
  GRANT authenticated, anon, service_role TO authenticator;
END
$$;
