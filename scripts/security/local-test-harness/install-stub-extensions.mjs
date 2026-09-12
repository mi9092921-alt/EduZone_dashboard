// Installs three SQL-only, no-op stub extensions into the embedded
// Postgres 17 native distribution that `embedded-postgres` unpacks under
// node_modules/@embedded-postgres/<platform>/native/. None of the three
// are bundled with a vanilla Postgres:
//
//   - pg_cron        (background job scheduler)
//   - pg_net         (async outbound HTTP)
//   - supabase_vault (Supabase's secrets-at-rest extension)
//
// supabase/schema/*.sql only ever calls into them behind either
// `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = '...')` guards
// (pg_cron, pg_net -- see 07_functions.sql) or `CREATE EXTENSION IF NOT
// EXISTS` (supabase_vault -- see 11_seed_reference.sql), so a minimal
// SQL-only stand-in that lets `CREATE EXTENSION` succeed is enough to
// apply the real, canonical schema files unmodified against this harness.
// No C module, no background worker, no real scheduling or networking.
//
// Must run once after `npm install` in this directory and before
// start-db.mjs (or ensure-db.sh) is used to apply supabase/schema/*.sql.
// Idempotent: safe to run every time.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const platformDir =
  process.platform === 'darwin'
    ? '@embedded-postgres/darwin-arm64'
    : process.platform === 'win32'
      ? '@embedded-postgres/windows-x64'
      : '@embedded-postgres/linux-x64';

const extensionDir = join(
  __dirname,
  'node_modules',
  platformDir,
  'native',
  'share',
  ...(process.platform === 'win32' ? ['extension'] : ['postgresql', 'extension']),
);

if (!existsSync(extensionDir)) {
  console.error(
    `[install-stub-extensions] ${extensionDir} does not exist -- run "npm install" in ` +
      'scripts/security/local-test-harness first.',
  );
  process.exit(1);
}

const files = {
  'pg_cron.control': `comment = 'Test-harness stub of pg_cron (SQL-only; no real background scheduling)'
default_version = '1.0'
relocatable = true
`,
  'pg_cron--1.0.sql': `CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid    bigserial PRIMARY KEY,
  schedule text NOT NULL,
  command  text NOT NULL,
  jobname  text UNIQUE,
  active   boolean DEFAULT true
);

CREATE OR REPLACE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_jobid bigint;
BEGIN
  INSERT INTO cron.job (schedule, command, jobname)
  VALUES (p_schedule, p_command, p_jobname)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_jobid;
  RETURN v_jobid;
END;
$$;

CREATE OR REPLACE FUNCTION cron.schedule(p_schedule text, p_command text)
RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (schedule, command) VALUES (p_schedule, p_command) RETURNING jobid;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid bigint)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM cron.job WHERE jobid = p_jobid;
  RETURN true;
END;
$$;
`,
  'pg_net.control': `comment = 'Test-harness stub of pg_net (SQL-only; no real outbound HTTP)'
default_version = '1.0'
relocatable = true
`,
  'pg_net--1.0.sql': `CREATE SCHEMA IF NOT EXISTS net;

-- Real pg_net returns a request_id (bigint) immediately and performs the
-- HTTP call asynchronously via a background worker. The harness has no
-- such worker (and must never make real outbound network calls from a
-- test run), so this stub just records the call and returns a fake id.
CREATE TABLE IF NOT EXISTS net._stub_requests (
  id bigserial PRIMARY KEY,
  url text,
  body jsonb,
  headers jsonb,
  called_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds int DEFAULT 5000
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO net._stub_requests (url, body, headers) VALUES (url, body, headers) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
`,
  'supabase_vault.control': `comment = 'Test-harness stub of Supabase Vault (real objects provisioned by 00_stub_auth.sql; this only satisfies CREATE EXTENSION)'
default_version = '1.0'
relocatable = true
`,
  'supabase_vault--1.0.sql': `-- Minimal stub of Supabase Vault, sized to exactly what
-- private.get_kms_key() (supabase/schema/07_functions.sql) and
-- supabase/schema/11_seed_reference.sql use: vault.decrypted_secrets
-- (keyed by name) and vault.create_secret(secret, name, description).
-- Real functionality only -- this is a disposable local test database,
-- never a real project.
CREATE TABLE IF NOT EXISTS vault._secrets (
  name              text PRIMARY KEY,
  decrypted_secret  text NOT NULL,
  description       text
);

CREATE VIEW vault.decrypted_secrets AS
  SELECT name, decrypted_secret FROM vault._secrets;

CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret text,
  new_name text DEFAULT NULL,
  new_description text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO vault._secrets (name, decrypted_secret, description)
  VALUES (new_name, new_secret, new_description)
  ON CONFLICT (name) DO UPDATE
    SET decrypted_secret = EXCLUDED.decrypted_secret,
        description = EXCLUDED.description;
  RETURN gen_random_uuid();
END;
$$;
`,
};

mkdirSync(extensionDir, { recursive: true });
for (const [name, contents] of Object.entries(files)) {
  writeFileSync(join(extensionDir, name), contents);
}

console.log(`[install-stub-extensions] wrote ${Object.keys(files).length} files to ${extensionDir}`);
