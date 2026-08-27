import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  // Query dead/failed jobs
  const deadRes = await client.query(`
    SELECT id, job_type, status, priority, attempts, max_attempts, run_at, error_message, payload 
    FROM internal.job_queue 
    WHERE status = 'dead' OR status = 'failed'
    ORDER BY run_at DESC
    LIMIT 20;
  `);
  console.log('Dead/Failed jobs detail:');
  console.log(JSON.stringify(deadRes.rows, null, 2));

  await client.end();
}

run().catch(console.error);
