#!/usr/bin/env node
/**
 * Atomic-per-file remote schema deploy over direct pg (bypasses the
 * statement splitter, whose quoted-string handling breaks on comments
 * containing apostrophes; the Management API path applies whole files in
 * a single implicit transaction and this mirrors that semantics).
 *
 * Env: DATABASE_URL (pg conn string), SUPABASE_DB_CA_CERT (PEM content).
 * Seed file is skipped (same F-01 rule as supabase-schema-deploy.mjs).
 */
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCHEMA_DIR = join(ROOT, 'supabase', 'schema');

const ORDER = [
  '01_extensions.sql',
  '02_types.sql',
  '03_tables.sql',
  '07_functions.sql',
  '04_constraints.sql',
  '05_indexes.sql',
  '06_views.sql',
  '07_functions.sql',
  '08_triggers.sql',
  '09_rls.sql',
  '10_permissions.sql',
  '11_seed_reference.sql',
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT } : {}),
  },
});
await client.connect();

let seen07 = false;
for (const file of ORDER) {
  if (file === '11_seed_reference.sql') {
    console.log(`⏭ SKIPPED ${file} (QA seed — F-01)`);
    continue;
  }
  if (file === '07_functions.sql') seen07 = true;
  const t0 = Date.now();
  const sql = fs.readFileSync(join(SCHEMA_DIR, file), 'utf8');
  try {
    await client.query(sql);
    console.log(`✓ ${file} (${Date.now() - t0}ms)`);
  } catch (err) {
    console.error(`✗ FAILED ${file}: ${err.message}`);
    process.exit(1);
  }
}
await client.end();
console.log('All schema files applied atomically.');
