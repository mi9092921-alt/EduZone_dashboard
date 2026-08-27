import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  // Drain all notification_fanout jobs in a loop
  let total_fanout = 0;
  let iters = 0;
  while (iters < 200) {
    const r = await client.query(`SELECT internal.process_notification_fanout_jobs(500, $1) AS processed`, [`drain-worker-${iters}`]);
    const n = Number(r.rows[0].processed);
    total_fanout += n;
    if (n === 0) break;
    iters++;
  }
  console.log(`notification_fanout: processed ${total_fanout} total jobs`);

  // Drain all PURGE_COURSE_CACHE jobs in a loop
  let total_cache = 0;
  iters = 0;
  while (iters < 200) {
    const r = await client.query(`SELECT internal.process_cache_purges(5000, $1) AS processed`, [`drain-cache-${iters}`]);
    const n = Number(r.rows[0].processed);
    total_cache += n;
    if (n === 0) break;
    iters++;
  }
  console.log(`PURGE_COURSE_CACHE: processed ${total_cache} total jobs`);

  // Final status
  console.log('\nFinal job queue status:');
  const r3 = await client.query(`
    SELECT status, job_type, count(*) 
    FROM internal.job_queue 
    GROUP BY status, job_type 
    ORDER BY status, job_type
  `);
  console.table(r3.rows);

  // Notifications summary
  const r4 = await client.query(`
    SELECT n.title, count(un.id) AS recipients, n.target_audience
    FROM public.notifications n
    LEFT JOIN public.user_notifications un ON un.notification_id = n.id
    GROUP BY n.id, n.title, n.target_audience
    ORDER BY n.title
  `);
  console.log('\nNotifications:');
  console.table(r4.rows);

  await client.end();
  console.log('\nAll pending jobs drained!');
}
run().catch(console.error);
