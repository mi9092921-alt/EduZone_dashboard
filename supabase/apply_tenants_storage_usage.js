// One-off remediation: get_tenants_usage previously returned only
// user_count + course_count, so the Tenants page hardcoded
// current_storage_bytes = 0 ("0 B / 10 GB" for every tenant). This deploys
// the extended RPC (adds storage_bytes summed from storage.objects paths
// that embed the tenant id as a path segment) and re-applies the
// 10_permissions.sql grant pair. Reads supabase/db_url.txt.
// Never prints credentials. Safe to re-run (CREATE OR REPLACE FUNCTION).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDbUrl() {
  const urlFilePath = path.join(__dirname, 'db_url.txt');
  if (!fs.existsSync(urlFilePath)) {
    throw new Error('supabase/db_url.txt not found (DATABASE_URL=postgres://... inside it).');
  }
  let content = fs.readFileSync(urlFilePath, 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(urlFilePath, 'utf16le');
  for (const line of content.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean.startsWith('DATABASE_URL=')) return clean.substring('DATABASE_URL='.length).trim();
  }
  throw new Error('DATABASE_URL not found in db_url.txt');
}

const CREATE_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION public.get_tenants_usage(p_tenant_ids uuid[])
RETURNS TABLE (tenant_id uuid, user_count bigint, course_count bigint, storage_bytes bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
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
    ),
    -- Tenant storage attribution: every bucket path that embeds the tenant id
    -- as a path segment (exports/{tenant_id}/... today; Flutter-app buckets
    -- follow the same convention). User-scoped-only paths (avatars/{user_id})
    -- are not attributable per-tenant and are intentionally excluded. The
    -- regex guard tolerates NULL/malformed metadata.size instead of failing
    -- the whole RPC on one bad row.
    (
      SELECT coalesce(sum(
        CASE WHEN (o.metadata ->> 'size') ~ '^[0-9]+$'
             THEN (o.metadata ->> 'size')::bigint
             ELSE 0 END
      ), 0)::bigint
      FROM storage.objects o
      WHERE o.name = t.id::text
         OR o.name LIKE t.id::text || '/%'
         OR o.name LIKE '%/' || t.id::text || '/%'
    )
  FROM public.tenants t
  WHERE t.id = ANY(p_tenant_ids)
    AND t.deleted_at IS NULL;
END;
$fn$;
`;

const GRANTS_SQL = `
REVOKE ALL ON FUNCTION public.get_tenants_usage(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenants_usage(uuid[]) TO authenticated, service_role;
`;

async function main() {
  const client = new Client({ connectionString: readDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('Connected.');

    console.log('\n[1/3] Deploying extended get_tenants_usage (adds storage_bytes)...');
    // CREATE OR REPLACE cannot change a RETURNS TABLE signature — drop first.
    // Grants are re-applied in step 2 (a dropped function loses its ACLs).
    await client.query('DROP FUNCTION IF EXISTS public.get_tenants_usage(uuid[])');
    await client.query(CREATE_FUNCTION_SQL);
    console.log('OK');

    console.log('\n[2/3] Re-applying grant pair (REVOKE PUBLIC/anon + GRANT authenticated/service_role)...');
    await client.query(GRANTS_SQL);
    console.log('OK');

    console.log('\n[3/3] Verification — per-tenant usage (direct storage sum + RPC):');
    const direct = await client.query(`
      SELECT t.id, t.name,
        (SELECT count(*) FROM public.users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS users,
        (SELECT count(*) FROM public.courses c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL) AS courses,
        (SELECT coalesce(sum(
           CASE WHEN (o.metadata ->> 'size') ~ '^[0-9]+$'
                THEN (o.metadata ->> 'size')::bigint ELSE 0 END), 0)::bigint
         FROM storage.objects o
         WHERE o.name = t.id::text
            OR o.name LIKE t.id::text || '/%'
            OR o.name LIKE '%/' || t.id::text || '/%'
        ) AS storage_bytes
      FROM public.tenants t
      WHERE t.deleted_at IS NULL
      ORDER BY t.created_at DESC
      LIMIT 10
    `);
    for (const r of direct.rows) {
      console.log(
        `  ${String(r.name).slice(0, 32).padEnd(32)} users=${r.users} courses=${r.courses} storage=${r.storage_bytes} bytes`,
      );
    }

    // Guards permit the postgres/cron-role path (NULL auth.role()), so the RPC
    // itself should be callable from this connection; if the guard hardens
    // later, the direct sums above remain the source of truth.
    try {
      const ids = direct.rows.map((r) => r.id);
      const rpc = await client.query('SELECT * FROM public.get_tenants_usage($1::uuid[])', [ids]);
      console.log(`\nRPC get_tenants_usage → ${rpc.rows.length} rows; columns: ${rpc.fields.map((f) => f.name).join(', ')}`);
      const mismatch = rpc.rows.filter(
        (r, i) => Number(r.storage_bytes) !== Number(direct.rows[i].storage_bytes),
      );
      console.log(
        mismatch.length === 0
          ? '\nPASS: RPC returns storage_bytes matching the direct sums.'
          : `\nFAIL: ${mismatch.length} row(s) disagree with direct sums.`,
      );
    } catch (e) {
      console.log(`\nWARN: RPC self-call blocked by guard (${e.message.split('\n')[0]}); direct sums above stand.`);
    }

    const grants = await client.query(`
      SELECT grantee FROM information_schema.role_function_grants
      WHERE specific_name LIKE 'get_tenants_usage%' AND grantee IN ('authenticated', 'service_role', 'anon')
      ORDER BY grantee
    `);
    console.log(`Grantees: ${grants.rows.map((g) => g.grantee).join(', ')}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
