#!/usr/bin/env node
/** Final structural verification of the course-notification pipeline on a
 * remote DB. Env: DATABASE_URL, SUPABASE_DB_CA_CERT (PEM content). */
import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca: process.env.SUPABASE_DB_CA_CERT },
});
await c.connect();

const checks = await c.query(`
  SELECT
    (SELECT count(*)::int FROM pg_proc WHERE proname = 'process_course_notify_jobs') AS worker_fn,
    (SELECT count(*)::int FROM pg_proc WHERE proname = 'send_system_notification') AS sys_fn,
    (SELECT count(*)::int FROM pg_trigger
      WHERE tgname IN ('trg_lesson_notify_ins','trg_lesson_notify_pub',
                       'trg_enrollment_notify_ins','trg_enrollment_notify_react')
      AND NOT tgisinternal) AS triggers,
    (SELECT count(*)::int FROM information_schema.columns
      WHERE table_schema='public' AND table_name='notifications' AND column_name='targeting_mode') AS column_ok,
    (SELECT has_function_privilege('service_role','public.process_course_notify_jobs(integer,text)','EXECUTE')) AS grant_ok
`);
console.log('FINAL CHECKS:', JSON.stringify(checks.rows[0]));

const cron = await c.query("SELECT jobname, schedule, active FROM cron.job WHERE jobname='course-notification-worker'");
console.log('CRON:', JSON.stringify(cron.rows));

const queue = await c.query("SELECT status, count(*)::int AS n FROM internal.job_queue WHERE job_type IN ('NOTIFY_LESSON_PUBLISHED','NOTIFY_STUDENT_ENROLLED') GROUP BY status");
console.log('QUEUE:', JSON.stringify(queue.rows));

await c.end();
