// Applies the REAL, canonical supabase/schema/*.sql files -- in exactly
// the order declared by supabase/config.toml's `schema_paths` -- against
// the running embedded Postgres harness (see start-db.mjs /
// ensure-db.sh). This is intentionally a *direct* apply (read each file,
// execute it), the same mechanism supabase/deploy.js already uses for
// every real environment -- no `supabase db diff`, no migration files
// are generated or read. supabase/schema/ is the canonical source in
// this repo; this script never modifies it.
//
// Order: 00_stub_auth.sql (harness-only: auth/storage schemas + roles) ->
// schema_paths (the real, canonical schema, unmodified) ->
// 01_test_session_helpers.sql (harness-only: test.login_as/test.logout).
//
// Usage: node apply-schema.mjs [--skip-validation]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const supabaseDir = join(repoRoot, 'supabase');

function readSchemaPaths() {
  const configText = readFileSync(join(supabaseDir, 'config.toml'), 'utf8');
  const match = configText.match(/schema_paths\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("Could not find `schema_paths = [...]` in supabase/config.toml");
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ''));
}

async function applyFile(client, label, absPath) {
  const sql = readFileSync(absPath, 'utf8');
  process.stdout.write(`[apply-schema] ${label} ... `);
  try {
    await client.query(sql);
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    throw new Error(`${label} (${absPath}) failed: ${err.message}`, { cause: err });
  }
}

async function main() {
  const skipValidation = process.argv.includes('--skip-validation');
  const client = new pg.Client({
    host: '127.0.0.1',
    port: 54329,
    user: 'postgres',
    password: 'postgres',
    database: 'eduzone_rls_test',
  });
  await client.connect();

  try {
    await applyFile(client, '00_stub_auth.sql', join(__dirname, '00_stub_auth.sql'));

    for (const relPath of readSchemaPaths()) {
      await applyFile(client, relPath, join(supabaseDir, relPath));
    }

    if (!skipValidation) {
      await applyFile(client, 'schema/VALIDATION.sql', join(supabaseDir, 'schema', 'VALIDATION.sql'));
    }

    await applyFile(
      client,
      '01_test_session_helpers.sql',
      join(__dirname, '01_test_session_helpers.sql'),
    );

    console.log('[apply-schema] canonical schema applied successfully');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[apply-schema] ERROR:', err.message);
  process.exitCode = 1;
});
