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
--
-- Note: Supabase Vault (schema `vault`) is intentionally NOT stubbed
-- here. supabase/schema/11_seed_reference.sql itself runs
-- `CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault
-- CASCADE;` before it needs vault.create_secret() -- exactly like a real
-- Supabase-managed Postgres image. This harness ships a matching
-- `supabase_vault` stub extension (installed by
-- install-stub-extensions.mjs) so that statement succeeds unmodified,
-- rather than pre-creating a same-named schema/table by hand here, which
-- Postgres then refuses to let a same-named extension "adopt" (`schema
-- vault is not a member of extension "supabase_vault"`).
--
-- The `vault` *schema* itself, however, must already exist before that
-- CREATE EXTENSION ... WITH SCHEMA vault call: Postgres requires the
-- target schema of an unfixed-schema extension to pre-exist, and on a
-- real Supabase-managed Postgres image the `vault` schema is always
-- present regardless of whether the extension is enabled. This mirrors
-- that -- only the schema, none of its objects (those belong to the
-- extension script).
CREATE SCHEMA IF NOT EXISTS vault;

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

-- Roles must exist before they can be GRANTed to -- this has to run
-- after the DO block above, not before it.
GRANT USAGE ON SCHEMA auth TO authenticated, anon, authenticator;
GRANT SELECT ON auth.users, auth.sessions, auth.identities TO authenticated, anon;
