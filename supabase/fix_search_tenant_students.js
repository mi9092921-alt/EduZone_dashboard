// One-off production fix for the POST /rpc/search_tenant_students failures:
//
//   HTTP 404 + SQLSTATE 42883 "function pg_catalog.greatest(integer, integer)
//   does not exist"
//
// Root cause: PostgreSQL 17 implements GREATEST/LEAST at parser level — there
// is no pg_catalog.greatest(VARIADIC "any") catalog entry anymore, so the
// schema-qualified call in the previously-deployed copy of the function fails
// with 42883, which PostgREST surfaces as HTTP 404. The canonical schema
// (schema/07_functions.sql — commit 63cfc05 "drop pg_catalog prefix on
// least/greatest in search_tenant_students") already switched the body to the
// unqualified form; the remote database was still running the old definition.
//
// This script deploys EXACTLY the canonical definition extracted from
// schema/07_functions.sql (never a hand-copied one), verifies the deployed
// body, and probes for any other function still carrying the same
// PostgreSQL 17-incompatible qualified call.
//
// Re-run at any time: node supabase/fix_search_tenant_students.js

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDatabaseUrl() {
  const filePath = path.join(__dirname, 'db_url.txt');
  if (!fs.existsSync(filePath)) throw new Error('supabase/db_url.txt is required');
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(filePath, 'utf16le');

  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from supabase/db_url.txt');
  let value = line.slice(line.indexOf('=') + 1).trim();
  while (value.startsWith('DATABASE_URL=')) value = value.slice('DATABASE_URL='.length).trim();
  return value;
}

/** Extracts the canonical search_tenant_students definition from 07_functions.sql. */
function extractCanonicalDefinition() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema', '07_functions.sql'), 'utf8');
  const startMarker = 'CREATE OR REPLACE FUNCTION public.search_tenant_students(';
  const start = sql.indexOf(startMarker);
  if (start === -1) {
    throw new Error('search_tenant_students definition not found in schema/07_functions.sql');
  }
  const end = sql.indexOf('$$;', start);
  if (end === -1) throw new Error('Unterminated function body in schema/07_functions.sql');
  return sql.slice(start, end + 3);
}

async function fetchStaleFunctions(client) {
  const { rows } = await client.query(
    `SELECT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.prosrc ILIKE '%pg_catalog.greatest%' OR p.prosrc ILIKE '%pg_catalog.least%')`,
  );
  return rows.map((r) => r.proname);
}

async function main() {
  const client = new Client({
    connectionString: readDatabaseUrl(),
    ssl: { rejectUnauthorized: process.env.SUPABASE_DB_SSL_STRICT === 'true' },
  });

  await client.connect();
  try {
    const staleBefore = await fetchStaleFunctions(client);
    console.log(
      staleBefore.length > 0
        ? `Functions still containing pg_catalog.greatest/least: ${staleBefore.join(', ')}`
        : 'No functions contain pg_catalog.greatest/least.',
    );

    await client.query(extractCanonicalDefinition());
    console.log('✓ search_tenant_students replaced with the canonical definition.');

    const { rows } = await client.query(
      `SELECT p.prosrc
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'search_tenant_students'`,
    );
    const body = rows[0]?.prosrc ?? '';
    if (/pg_catalog\.(greatest|least)/i.test(body)) {
      throw new Error('Deployed body still references pg_catalog.greatest/least.');
    }
    if (!/greatest\(coalesce\(p_limit, 20\), 1\)/i.test(body)) {
      throw new Error('Deployed body does not match the canonical definition.');
    }
    console.log('✓ Verified: deployed body uses the unqualified greatest() form.');

    const staleAfter = await fetchStaleFunctions(client);
    if (staleAfter.length > 0) {
      console.log(
        `⚠ Other functions still contain pg_catalog.greatest/least: ${staleAfter.join(', ')}`,
      );
    } else {
      console.log('✓ No remaining functions use pg_catalog.greatest/least.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
