#!/usr/bin/env node
/**
 * Direct-pg VALIDATION runner — same checks as run_validation_mgmt.mjs but
 * over the plain postgres connection (db_url.txt / DATABASE_URL), for when
 * the Management API token is unavailable.
 *
 * Read-only: VALIDATION.sql only creates a TEMP results table.
 *
 * Usage: node scripts/run_validation_direct.mjs [db_url.txt]
 */
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function resolveDbUrl(configFileName) {
  const urlFilePath = join(ROOT, 'supabase', configFileName);
  if (fs.existsSync(urlFilePath)) {
    let content = fs.readFileSync(urlFilePath, 'utf8');
    if (content.includes('\u0000')) content = fs.readFileSync(urlFilePath, 'utf16le');
    for (const line of content.split('\n')) {
      const cleanLine = line.replace(/\r/g, '').trim();
      if (cleanLine.startsWith('DATABASE_URL=')) {
        return cleanLine.substring('DATABASE_URL='.length).trim();
      }
    }
  }
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
}

function sanitizeUrl(url) {
  const m = url.match(/^(postgres(?:ql)?:\/\/[^:]+:)(.*)(@.+)$/);
  if (m && m[2].includes('#') && !m[2].includes('%23')) {
    return `${m[1]}${m[2].replace(/#/g, '%23')}${m[3]}`;
  }
  return url;
}

async function main() {
  const dbUrl = sanitizeUrl(resolveDbUrl(process.argv[2] || 'db_url.txt'));
  if (!dbUrl) {
    console.error('No DATABASE_URL: set supabase/db_url.txt (DATABASE_URL=...) or env.');
    process.exit(1);
  }

  const validationSql = fs.readFileSync(join(ROOT, 'supabase/schema/VALIDATION.sql'), 'utf8');

  const client = new Client({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized:
        process.env.SUPABASE_DB_SSL_STRICT === 'true'
          ? true
          : Boolean(process.env.SUPABASE_DB_CA_CERT),
      ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT } : {}),
    },
  });

  await client.connect();
  try {
    // One session, simple-query protocol: temp table survives for the SELECT.
    await client.query(validationSql);
    const { rows } = await client.query(
      'SELECT check_name, status, details FROM validation_results ORDER BY (status = \'FAIL\') DESC, check_name;',
    );

    const pass = rows.filter((r) => r.status === 'PASS');
    const fail = rows.filter((r) => r.status === 'FAIL');
    const other = rows.filter((r) => r.status !== 'PASS' && r.status !== 'FAIL');

    for (const r of fail) {
      console.log(`FAIL  ${r.check_name}${r.details ? ` — ${r.details}` : ''}`);
    }
    for (const r of other) {
      console.log(`${r.status}  ${r.check_name}${r.details ? ` — ${r.details}` : ''}`);
    }
    console.log(`\nVALIDATION: ${pass.length} PASS / ${fail.length} FAIL / ${other.length} other (${rows.length} checks)`);
    process.exitCode = fail.length > 0 ? 2 : 0;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Validation run failed:', err.message);
  process.exit(1);
});
