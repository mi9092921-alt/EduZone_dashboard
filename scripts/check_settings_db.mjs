import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  // Query feature_flags columns
  const flagsCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'feature_flags';
  `);
  console.log('Columns in public.feature_flags:');
  console.table(flagsCols.rows);

  await client.end();
}

run().catch(console.error);
