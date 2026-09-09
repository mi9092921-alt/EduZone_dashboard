// Deploys public.get_tenants_usage() to the live Supabase database
// and grants EXECUTE to authenticated + service_role.
// Run with: node supabase/apply_get_tenants_usage.js
const { Client } = require('pg');

const DB_URL =
  'postgresql://postgres.evmrahlzcgqgjhwvxzih:qAm5Xf0mEHMlmXkE@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

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
