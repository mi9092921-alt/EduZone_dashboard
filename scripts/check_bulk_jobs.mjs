import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  const jobs = await client.query(`
    SELECT id, job_type, status, attempts, max_attempts, error_message, payload, created_at, finished_at 
    FROM internal.job_queue 
    WHERE job_type LIKE 'bulk_%'
    ORDER BY created_at DESC
    LIMIT 20;
  `);

  console.log('Bulk Jobs in Queue:');
  console.log(JSON.stringify(jobs.rows, null, 2));

  await client.end();
}
run().catch(console.error);
