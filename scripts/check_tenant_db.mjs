import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  // Query table columns
  const colsRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenants';
  `);
  console.log('Columns in public.tenants:');
  console.table(colsRes.rows);

  // Query a sample tenant
  const tenantRes = await client.query(`
    SELECT * FROM public.tenants LIMIT 1;
  `);
  console.log('Sample tenant:');
  console.log(JSON.stringify(tenantRes.rows[0], null, 2));

  await client.end();
}

run().catch(console.error);
