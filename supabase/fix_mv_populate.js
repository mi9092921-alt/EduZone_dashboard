// One-off remediation: deploy the fixed 07_functions.sql, then populate the
// never-refreshed analytics MVs and verify. Reads supabase/db_url.txt
// (same mechanism as deploy_schema.js). Never prints credentials.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDbUrl() {
  let content = fs.readFileSync(path.join(__dirname, 'db_url.txt'), 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(path.join(__dirname, 'db_url.txt'), 'utf16le');
  for (const line of content.split('\n')) {
    const clean = line.replace(/\r/g, '').trim();
    if (clean.startsWith('DATABASE_URL=')) return clean.substring('DATABASE_URL='.length).trim();
  }
  throw new Error('DATABASE_URL not found in db_url.txt');
}

async function main() {
  const client = new Client({ connectionString: readDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('Connected.');

    console.log('\n[1/3] Executing schema/07_functions.sql (fixed)...');
    const sql = fs.readFileSync(path.join(__dirname, 'schema/07_functions.sql'), 'utf8');
    await client.query(sql);
    console.log('OK');

    console.log('\n[2/3] Populating analytics MVs (one-time plain REFRESH)...');
    const mvs = [
      'REFRESH MATERIALIZED VIEW private.mv_user_stats',
      'REFRESH MATERIALIZED VIEW private.mv_course_stats',
      'REFRESH MATERIALIZED VIEW private.mv_course_stats_tenant',
      'REFRESH MATERIALIZED VIEW private.mv_hourly_activity_48h',
      'REFRESH MATERIALIZED VIEW private.mv_daily_activity_30d',
      'REFRESH MATERIALIZED VIEW public.vw_student_progress_timeline',
      'REFRESH MATERIALIZED VIEW public.vw_daily_revenue',
    ];
    for (const stmt of mvs) {
      const t0 = Date.now();
      await client.query(stmt);
      console.log(`OK (${Date.now() - t0}ms): ${stmt.replace('REFRESH MATERIALIZED VIEW ', '')}`);
    }

    console.log('\n[3/3] Verification:');
    const v1 = await client.query(
      `SELECT schemaname, matviewname, ispopulated
       FROM pg_matviews
       WHERE (schemaname = 'private' AND matviewname LIKE 'mv_%')
          OR (schemaname = 'public' AND matviewname IN ('vw_student_progress_timeline','vw_daily_revenue'))
       ORDER BY 1, 2`,
    );
    console.table(v1.rows);

    const v2 = await client.query('SELECT count(*)::int AS course_stats_rows FROM private.mv_course_stats');
    console.log(`private.mv_course_stats rows: ${v2.rows[0].course_stats_rows}`);

    try {
      const v3 = await client.query("SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'refresh-materialized-views'");
      console.table(v3.rows);
    } catch {
      console.log('pg_cron: cron.job not accessible / pg_cron not installed (schedule block skipped silently).');
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
