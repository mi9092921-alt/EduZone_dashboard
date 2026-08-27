import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  const columns = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'video_views';
  `);
  console.log('Columns of video_views:');
  console.log(columns.rows);

  const rows = await client.query(`
    SELECT * FROM public.video_views LIMIT 10;
  `);
  console.log('Sample rows of video_views:');
  console.log(JSON.stringify(rows.rows, null, 2));

  await client.end();
}
run().catch(console.error);
