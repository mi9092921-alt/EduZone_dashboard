#!/usr/bin/env node
/**
 * Apply + verify the access_rules table grants on the remote Supabase DB.
 *
 * WHY (2026-09-15): PostgREST returned 403 on GET /rest/v1/access_rules for
 * the dashboard browser client. The blanket REVOKE in 10_permissions.sql
 * ("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon,
 * authenticated") was never followed by per-table grants for access_rules /
 * user_access_rules, so PostgREST rejects with permission-denied BEFORE RLS
 * is evaluated (an RLS denial would be a 200 with an empty array, not a 403).
 * This fix mirrors the grants in supabase/schema/10_permissions.sql
 * ("ACCESS RULES GRANTS FIX"); RLS policies in 09_rls.sql remain the
 * authorization boundary.
 *
 * Usage:
 *   node scripts/apply_access_rules_grants.mjs
 * Env:
 *   DATABASE_URL — direct/session-pooler pg conn string for the project
 *                  (loaded from scripts/.env.deploy when not exported).
 *                  App project: ref evmrahlzcgqgjhwvxzih, region eu-central-1
 *                  → postgresql://postgres.<ref>:<pwd>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Convenience: load scripts/.env.deploy when DATABASE_URL is not exported.
if (!process.env.DATABASE_URL) {
  const envPath = join(__dirname, '.env.deploy');
  if (existsSync(envPath)) {
    let buf = readFileSync(envPath);
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes('\u0000')) text = buf.toString('utf16le');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (export it or add it to scripts/.env.deploy).');
  console.error('App project: postgres.evmrahlzcgqgjhwvxzih @ aws-0-eu-central-1.pooler.supabase.com');
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await c.connect();

const grantsQuery = `
  SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name IN ('access_rules', 'user_access_rules')
  ORDER BY table_name, grantee, privilege_type;`;

const dump = async (phase) => {
  const r = await c.query(grantsQuery);
  console.log(`--- ${phase} (${r.rows.length} rows, db=${c.database}) ---`);
  for (const row of r.rows) console.log(`${row.table_name} | ${row.grantee} | ${row.privilege_type}`);
};

await dump('BEFORE');
await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_rules      TO authenticated;`);
await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_access_rules TO authenticated;`);
await dump('AFTER');
await c.end();
console.log('ok');