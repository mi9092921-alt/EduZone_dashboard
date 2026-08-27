import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  // Check if feature_flags or related tables have FORCE ROW LEVEL SECURITY (which blocks service_role)
  const r = await client.query(`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname IN ('feature_flags','feature_flag_roles','feature_flag_users','tenant_feature_flags')
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  console.log('RLS force status:', JSON.stringify(r.rows, null, 2));

  // Check if the admin user (or any user) exists in public.users
  const r2 = await client.query(`
    SELECT id, email, primary_role, tenant_id, account_status
    FROM public.users
    WHERE primary_role IN ('admin','super_admin')
    LIMIT 5
  `);
  console.log('Admin users in public.users:', JSON.stringify(r2.rows, null, 2));

  // Check if there are auth users without public.users entries
  const r3 = await client.query(`
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
    WHERE pu.id IS NULL
    LIMIT 10
  `);
  console.log('Auth users missing from public.users:', JSON.stringify(r3.rows, null, 2));

  await client.end();
}
run().catch(console.error);
