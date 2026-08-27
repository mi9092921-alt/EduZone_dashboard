#!/usr/bin/env node
/**
 * Static + optional live audit for supabase/schema.
 * Live mode: SUPABASE_ACCESS_TOKEN + project ref, or DATABASE_URL.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCHEMA = join(ROOT, 'supabase', 'schema');

const SEVERITY = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

/** @type {{ id: string, severity: string, category: string, message: string, remediation?: string }[]} */
const findings = [];

function add(severity, category, id, message, remediation) {
  findings.push({ severity, category, id, message, remediation });
}

function read(name) {
  return readFileSync(join(SCHEMA, name), 'utf8');
}

function staticAudit() {
  const tablesSql = read('03_tables.sql');
  const rlsSql = read('09_rls.sql');
  const idxSql = read('05_indexes.sql');
  const constrSql = read('04_constraints.sql');
  const fnSql = read('07_functions.sql');
  const viewsSql = read('06_views.sql');
  const permSql = read('10_permissions.sql');

  const tableRe = /CREATE TABLE (?:IF NOT EXISTS )?([a-z0-9_.]+)/gi;
  const tables = [...tablesSql.matchAll(tableRe)].map((m) => m[1]);
  const rlsEnabled = new Set(
    [...rlsSql.matchAll(/ALTER TABLE ([a-z0-9_.]+) ENABLE ROW LEVEL SECURITY/gi)].map((m) => m[1]),
  );
  const rlsForced = new Set(
    [...rlsSql.matchAll(/ALTER TABLE ([a-z0-9_.]+) FORCE ROW LEVEL SECURITY/gi)].map((m) => m[1]),
  );

  for (const t of tables) {
    const [schema, name] = t.includes('.') ? t.split('.') : ['public', t];
    if (schema !== 'public') continue;
    if (name.endsWith('_future')) continue;
    if (/_(20\d{2}|203\d)$/.test(name)) continue; // partition child
    if (!rlsEnabled.has(t) && !rlsEnabled.has(`public.${name}`)) {
      add(
        SEVERITY.high,
        'security',
        'rls_disabled_public',
        `public.${name} has no ENABLE ROW LEVEL SECURITY in 09_rls.sql`,
        'Add ENABLE/FORCE RLS and policies in 09_rls.sql',
      );
    }
  }

  for (const t of tables) {
    if (!t.startsWith('public.')) continue;
    if (rlsEnabled.has(t) && !rlsForced.has(t)) {
      add(
        SEVERITY.medium,
        'security',
        'rls_not_forced',
        `${t} enables RLS but not FORCE ROW LEVEL SECURITY (table owner bypass)`,
        'ALTER TABLE ... FORCE ROW LEVEL SECURITY',
      );
    }
  }

  const fnBlocks = fnSql.split(/(?=CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION)/i);
  for (const block of fnBlocks) {
    if (!/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i.test(block)) continue;
    const nameM = block.match(/FUNCTION\s+([a-z0-9_.]+)\s*\(/i);
    if (!nameM) continue;
    const fname = nameM[1];
    if (/SECURITY DEFINER/i.test(block) && !/search_path/i.test(block)) {
      add(
        SEVERITY.high,
        'security',
        'function_search_path_mutable',
        `${fname} is SECURITY DEFINER without SET search_path`,
        'Add SET search_path = ... to function definition in 07_functions.sql',
      );
    }
    if (/SECURITY DEFINER/i.test(block) && /SET\s+search_path\s*=\s*''/i.test(block)) {
      add(
        SEVERITY.medium,
        'security',
        'function_search_path_empty',
        `${fname} uses search_path = '' — verify extensions schema is qualified`,
      );
    }
  }

  const viewRe = /CREATE(?:\s+OR\s+REPLACE)?\s+(?:MATERIALIZED\s+)?VIEW\s+([a-z0-9_.]+)/gi;
  for (const m of viewsSql.matchAll(viewRe)) {
    const vname = m[1];
    const start = m.index ?? 0;
    const chunk = viewsSql.slice(start, start + 800);
    if (!/security_invoker\s*=\s*true/i.test(chunk) && vname.startsWith('public.')) {
      add(
        SEVERITY.high,
        'security',
        'security_definer_view',
        `${vname} missing WITH (security_invoker = true)`,
        'Add security_invoker to view in 06_views.sql',
      );
    }
  }

  const fkRe =
    /ALTER TABLE ONLY ([a-z0-9_.]+)\s+ADD CONSTRAINT [a-z0-9_]+ FOREIGN KEY \(([^)]+)\)/gi;
  for (const m of constrSql.matchAll(fkRe)) {
    const table = m[1];
    const cols = m[2].split(',').map((c) => c.trim().replace(/"/g, ''));
    for (const col of cols) {
      const patterns = [
        new RegExp(`CREATE INDEX[^;]*\\bON\\s+${table.replace('.', '\\.')}\\s*\\([^;]*\\b${col}\\b`, 'i'),
        new RegExp(`CREATE UNIQUE INDEX[^;]*\\bON\\s+${table.replace('.', '\\.')}\\s*\\([^;]*\\b${col}\\b`, 'i'),
      ];
      if (!patterns.some((p) => p.test(idxSql))) {
        add(
          SEVERITY.medium,
          'performance',
          'unindexed_foreign_keys',
          `FK column ${table}(${col}) may lack supporting index in 05_indexes.sql`,
          `CREATE INDEX ON ${table} (${col})`,
        );
      }
    }
  }

  const indexNames = [...idxSql.matchAll(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?([a-z0-9_]+)/gi)].map(
    (m) => m[1],
  );
  const dupNames = indexNames.filter((n, i) => indexNames.indexOf(n) !== i);
  for (const n of [...new Set(dupNames)]) {
    add(SEVERITY.high, 'performance', 'duplicate_index', `Duplicate index name: ${n}`, 'Remove duplicate in 05_indexes.sql');
  }

  if (/GRANT\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+anon/i.test(permSql)) {
    add(
      SEVERITY.critical,
      'security',
      'excessive_anon_grant',
      'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon',
      'Revoke broad anon grants in 10_permissions.sql',
    );
  }

  const initplan = [...rlsSql.matchAll(/auth\.(uid|jwt)\(\)/g)];
  const wrapped = [...rlsSql.matchAll(/\(select\s+auth\.(uid|jwt)\(\)\)/gi)];
  if (initplan.length > wrapped.length + 5) {
    add(
      SEVERITY.medium,
      'performance',
      'auth_rls_initplan',
      `RLS policies may call auth.uid()/jwt() without (select ...) wrapper (${initplan.length} raw vs ${wrapped.length} wrapped)`,
      'Use (select auth.uid()) in 09_rls.sql policies',
    );
  }
}

async function liveAuditPg() {
  const { default: pg } = await import('pg');
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: noRls } = await client.query(`
      SELECT n.nspname AS schema, c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p')
        AND n.nspname = 'public'
        AND NOT c.relrowsecurity
      ORDER BY 1,2`);
    for (const r of noRls) {
      add(
        SEVERITY.high,
        'security',
        'rls_disabled_live',
        `Live: ${r.schema}.${r.table} has RLS disabled`,
      );
    }

    const { rows: definerNoPath } = await client.query(`
      SELECT n.nspname || '.' || p.proname AS fn
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef
        AND n.nspname IN ('public','private','internal','audit','maintenance','extensions')
        AND NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=%'
        )`);
    for (const r of definerNoPath) {
      add(SEVERITY.high, 'security', 'function_search_path_live', `Live: ${r.fn} SECURITY DEFINER without search_path`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('=== Static schema audit ===\n');
  staticAudit();

  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (dbUrl) {
    console.log('=== Live catalog audit (pg) ===\n');
    await liveAuditPg();
  }

  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const sev of order) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    console.log(`\n## ${sev} (${group.length})`);
    for (const f of group) {
      console.log(`- [${f.category}] ${f.id}: ${f.message}`);
      if (f.remediation) console.log(`  → ${f.remediation}`);
    }
  }

  const critHigh = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  console.log(`\nTotal: ${findings.length} (${critHigh.length} critical/high)`);
  process.exit(critHigh.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
