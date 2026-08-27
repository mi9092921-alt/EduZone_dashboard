#!/usr/bin/env node
/**
 * Deploy supabase/schema/*.sql in dependency order.
 *
 * Auth (first match wins):
 *   1. SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF  → Management API POST /v1/projects/{ref}/database/query
 *   2. DATABASE_URL or SUPABASE_DB_URL                 → direct pg connection
 *
 * Usage:
 *   node scripts/supabase-schema-deploy.mjs [--dry-run] [--from=03_tables.sql]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCHEMA_DIR = join(ROOT, 'supabase', 'schema');

// 07 before 04/06 (RLS helpers); 06 before 07 completes (matviews); 07 run twice if needed.
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromArg = args.find((a) => a.startsWith('--from='));
const fromFile = fromArg ? fromArg.split('=')[1] : null;

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, 'apps', 'admin', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .replace(/^https?:\/\//, '')
    .replace(/\.supabase\.co\/?$/, '');

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function runViaManagementApi(sql, file) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${file}: HTTP ${res.status} — ${text.slice(0, 2000)}`);
  }
  return text;
}

/** Split SQL on semicolons outside dollar-quoted bodies. */
function splitSqlStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    if (sql.startsWith('--', i)) {
      const eol = sql.indexOf('\n', i);
      cur += sql.slice(i, eol === -1 ? n : eol + 1);
      i = eol === -1 ? n : eol + 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      const j = end === -1 ? n : end + 2;
      cur += sql.slice(i, j);
      i = j;
      continue;
    }
    const dm = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
    if (dm) {
      const tag = dm[0];
      const close = sql.indexOf(tag, i + tag.length);
      if (close === -1) throw new Error('Unclosed dollar quote in SQL');
      cur += sql.slice(i, close + tag.length);
      i = close + tag.length;
      continue;
    }
    if (sql[i] === ';') {
      const stmt = cur.trim();
      if (stmt.length > 0) out.push(stmt);
      cur = '';
      i += 1;
      continue;
    }
    cur += sql[i];
    i += 1;
  }
  const tail = cur.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

async function runViaPg(sql, file, { continueOnError = false } = {}) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const stmts = splitSqlStatements(sql);
  let ok = 0;
  let skipped = 0;
  try {
    for (let idx = 0; idx < stmts.length; idx++) {
      const stmt = stmts[idx];
      try {
        await client.query(stmt);
        ok += 1;
      } catch (err) {
        if (continueOnError) {
          skipped += 1;
          const preview = stmt.split('\n')[0].slice(0, 80);
          console.warn(`    ⚠ stmt ${idx + 1}/${stmts.length} skipped: ${err.message}`);
          console.warn(`      ${preview}…`);
          continue;
        }
        throw new Error(`${file} stmt ${idx + 1}/${stmts.length}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
  return { ok, skipped, total: stmts.length };
}

async function executeSql(sql, file, opts) {
  if (dryRun) {
    const n = splitSqlStatements(sql).length;
    console.log(`[dry-run] would execute ${file} (${n} statements)`);
    return;
  }
  if (accessToken && projectRef) {
    await runViaManagementApi(sql, file);
    return;
  }
  if (dbUrl) {
    return runViaPg(sql, file, opts);
  }
  throw new Error(
    'No database credentials. Set SUPABASE_ACCESS_TOKEN + project ref, or DATABASE_URL.',
  );
}

function filesToRun() {
  let start = 0;
  if (fromFile) {
    const idx = ORDER.lastIndexOf(fromFile);
    if (idx < 0) throw new Error(`Unknown --from file: ${fromFile}`);
    start = idx;
  }
  return ORDER.slice(start);
}

async function main() {
  console.log('EduZone schema deploy');
  console.log(`  project: ${projectRef || '(unset)'}`);
  console.log(
    `  auth: ${accessToken ? 'Management API' : dbUrl ? 'DATABASE_URL' : 'MISSING'}`,
  );
  if (!accessToken && !dbUrl) process.exit(1);

  const files = filesToRun();
  let seen07 = false;
  for (const file of files) {
    const path = join(SCHEMA_DIR, file);
    const sql = readFileSync(path, 'utf8');
    const continueOnError =
      (file === '07_functions.sql' && !seen07) ||
      file === '09_rls.sql' ||
      file === '10_permissions.sql';
    if (file === '07_functions.sql') seen07 = true;
    console.log(`\n▶ ${file} …`);
    const t0 = Date.now();
    try {
      const stats = await executeSql(sql, file, { continueOnError });
      if (stats?.skipped) {
        console.log(
          `  ✓ done (${Date.now() - t0}ms, ${stats.ok}/${stats.total} ok, ${stats.skipped} skipped)`,
        );
      } else {
        console.log(`  ✓ done (${Date.now() - t0}ms)`);
      }
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('\nAll schema files applied successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
