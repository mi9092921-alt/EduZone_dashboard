import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  // Process remaining pending notification_fanout jobs
  console.log('Processing pending notification_fanout jobs...');
  const r1 = await client.query(`SELECT internal.process_notification_fanout_jobs(500, 'repair-worker-3') AS processed`);
  console.log('notification_fanout processed:', r1.rows[0].processed);

  // Process remaining pending PURGE_COURSE_CACHE jobs
  console.log('Processing pending PURGE_COURSE_CACHE jobs...');
  const r2 = await client.query(`SELECT internal.process_cache_purges(5000, 'repair-worker-4') AS processed`);
  console.log('PURGE_COURSE_CACHE processed:', r2.rows[0].processed);

  // Final queue status
  console.log('\nFinal job queue status:');
  const r3 = await client.query(`
    SELECT status, job_type, count(*) 
    FROM internal.job_queue 
    GROUP BY status, job_type 
    ORDER BY status, job_type
  `);
  console.table(r3.rows);

  // User notifications summary
  const r4 = await client.query(`
    SELECT n.title, count(un.id) AS recipients, n.target_audience
    FROM public.notifications n
    LEFT JOIN public.user_notifications un ON un.notification_id = n.id
    GROUP BY n.id, n.title, n.target_audience
    ORDER BY n.title
  `);
  console.log('\nNotifications with recipient counts:');
  console.table(r4.rows);

  await client.end();
  console.log('\nDone!');
}
run().catch(console.error);
