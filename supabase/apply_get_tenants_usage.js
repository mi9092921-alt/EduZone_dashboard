// Deploys public.get_tenants_usage() to the live Supabase database
// and grants EXECUTE to authenticated + service_role.
// Run with: node supabase/apply_get_tenants_usage.js
//
// Credentials are resolved from SUPABASE_DB_URL / DATABASE_URL env vars, or
// from the gitignored supabase/db_url.txt (same loader as deploy.js) — never
// hardcoded (SECURITY: a live connection string was once committed here).
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function resolveDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const urlFilePath = path.join(__dirname, 'db_url.txt');
  if (fs.existsSync(urlFilePath)) {
    let content = fs.readFileSync(urlFilePath, 'utf8');
    if (content.includes('\u0000')) {
      content = fs.readFileSync(urlFilePath, 'utf16le');
    }
    const lines = content.split('\n');
    for (const line of lines) {
      const cleanLine = line.replace(/\r/g, '').trim();
      if (cleanLine.startsWith('DATABASE_URL=')) {
        return cleanLine.substring('DATABASE_URL='.length).trim();
      }
    }
  }

  console.error(
    'Error: SUPABASE_DB_URL or DATABASE_URL must be set in environment, or supabase/db_url.txt must exist.',
  );
  process.exit(1);
}

const DB_URL = resolveDbUrl();

const CREATE_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION public.get_tenants_usage(p_tenant_ids uuid[])
RETURNS TABLE (tenant_id uuid, user_count bigint, course_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    (
      SELECT count(*)
      FROM public.users u
      WHERE u.tenant_id = t.id
        AND u.deleted_at IS NULL
    ),
    (
      SELECT count(*)
      FROM public.courses c
      WHERE c.tenant_id = t.id
        AND c.deleted_at IS NULL
    )
  FROM public.tenants t
  WHERE t.id = ANY(p_tenant_ids)
    AND t.deleted_at IS NULL;
END;
$$;
`;

const GRANT_SQL = `
REVOKE ALL ON FUNCTION public.get_tenants_usage(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenants_usage(uuid[]) TO authenticated, service_role;
`;

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to database.');

  try {
    await client.query(CREATE_FUNCTION_SQL);
    console.log('✓ Function public.get_tenants_usage created/replaced.');

    await client.query(GRANT_SQL);
    console.log('✓ GRANT EXECUTE applied to authenticated, service_role.');

    // Verify it's visible
    const { rows } = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_tenants_usage';
    `);
    if (rows.length > 0) {
      console.log('✓ Verification: function exists in pg_proc:', rows);
    } else {
      console.error('✗ Verification failed: function not found in pg_proc.');
    }
  } finally {
    await client.end();
    console.log('Done.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
