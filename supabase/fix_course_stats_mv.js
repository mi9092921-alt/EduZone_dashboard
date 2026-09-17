// One-off remediation: rebuild private.mv_course_stats with a working
// avg_progress. The deployed definition filtered user_progress on
// lesson_id IS NULL, but user_progress.lesson_id is NOT NULL — the filter
// could never match, so avg_progress was permanently NULL ("Avg: %" in
// Engagement by Course). avg_progress now averages enrollments.progress_pct
// (same source as get_dashboard_stats.total_progress). Also refreshes the
// matview so `completed` reflects current enrollments (no auto-refresh is
// bound: trg_schedule_mv_refresh() has no trigger bindings and
// internal.execute_background_job is a stub).
//
// Reads supabase/db_url.txt (same mechanism as deploy_schema.js).
// Never prints credentials. Idempotent — safe to re-run.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDbUrl() {
  const urlFilePath = path.join(__dirname, 'db_url.txt');
  if (!fs.existsSync(urlFilePath)) {
    throw new Error(
      'supabase/db_url.txt not found. Put a line "DATABASE_URL=postgres://..." in it (same format deploy_schema.js expects).',
    );
  }
  let content = fs.readFileSync(urlFilePath, 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(urlFilePath, 'utf16le');
  for (const line of content.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean.startsWith('DATABASE_URL=')) return clean.substring('DATABASE_URL='.length).trim();
  }
  throw new Error('DATABASE_URL not found in db_url.txt');
}

const CREATE_MATVIEW = `
CREATE MATERIALIZED VIEW private.mv_course_stats AS
SELECT
  c.id         AS course_id,
  c.tenant_id,
  -- All non-deleted enrollments (active + completed): "% Complete" in the UI
  -- divides completed by enrolled, so completed-only courses must not drop
  -- out of the denominator (they showed enrolled=0, "0% Complete").
  (SELECT count(*) FROM public.enrollments e
     WHERE e.course_id = c.id AND e.deleted_at IS NULL)             AS enrolled,
  (SELECT count(*) FROM public.enrollments e
     WHERE e.course_id = c.id AND e.status = 'completed'
       AND e.deleted_at IS NULL)                                    AS completed,
  -- Course-level progress lives in enrollments.progress_pct (same source as
  -- get_dashboard_stats.total_progress). The previous user_progress filter
  -- (lesson_id IS NULL) was impossible: that column is NOT NULL. Courses
  -- with no enrollments coalesce to 0 instead of NULL.
  (SELECT round(coalesce(avg(e.progress_pct), 0)::numeric, 2) FROM public.enrollments e
     WHERE e.course_id = c.id AND e.deleted_at IS NULL)             AS avg_progress,
  (SELECT count(*) FROM public.video_views vv
     WHERE vv.course_id = c.id)                                      AS total_views,
  now()                                                              AS refreshed_at
FROM public.courses c
WHERE c.deleted_at IS NULL
WITH NO DATA;
`;

// Mirrors schema/06_views.sql — dropped here because they select FROM the
// matview and must be recreated after it.
const CREATE_PUBLIC_VIEWS = `
CREATE OR REPLACE VIEW public.vw_course_stats AS
SELECT
  course_id,
  tenant_id,
  enrolled,
  completed,
  avg_progress,
  total_views,
  refreshed_at
FROM private.mv_course_stats
WHERE tenant_id = public.get_current_tenant_id()
   OR public.is_current_user_super_admin();

CREATE OR REPLACE VIEW public.mv_course_stats AS SELECT * FROM public.vw_course_stats;

ALTER VIEW IF EXISTS public.vw_course_stats SET (security_invoker = true);
ALTER VIEW IF EXISTS public.mv_course_stats SET (security_invoker = true);
`;

// Mirrors schema/10_permissions.sql grants (lines must run AFTER the objects
// exist — the blanket-REVOKE sweep in 10 runs before these in a full deploy,
// and a recreated object loses all grants).
const GRANTS = `
GRANT SELECT ON public.vw_course_stats TO authenticated, anon, service_role;
GRANT SELECT ON public.mv_course_stats TO authenticated, service_role, anon;
GRANT SELECT ON private.mv_course_stats TO authenticated, anon;
GRANT SELECT ON private.mv_course_stats TO service_role;
`;

async function main() {
  const client = new Client({ connectionString: readDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('Connected.');

    console.log('\n[1/5] Dropping dependent public views, then private.mv_course_stats...');
    await client.query('DROP VIEW IF EXISTS public.mv_course_stats');
    await client.query('DROP VIEW IF EXISTS public.vw_course_stats');
    await client.query('DROP MATERIALIZED VIEW IF EXISTS private.mv_course_stats');
    console.log('OK');

    console.log('\n[2/5] Creating fixed private.mv_course_stats...');
    await client.query(CREATE_MATVIEW);
    console.log('OK');

    console.log('\n[3/5] Recreating unique indexes (needed for REFRESH CONCURRENTLY)...');
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_course_stats_course_tenant ON private.mv_course_stats (course_id, tenant_id)',
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_course_stats_course ON private.mv_course_stats (course_id)',
    );
    console.log('OK');

    console.log('\n[4/5] Refreshing matview and recreating public views + grants...');
    await client.query('REFRESH MATERIALIZED VIEW private.mv_course_stats');
    await client.query(CREATE_PUBLIC_VIEWS);
    await client.query(GRANTS);
    console.log('OK');

    console.log('\n[5/5] Verification — private.mv_course_stats sample:');
    const { rows } = await client.query(`
      SELECT c.title,
             m.enrolled,
             m.completed,
             m.avg_progress,
             m.total_views,
             m.refreshed_at::text
      FROM private.mv_course_stats m
      JOIN public.courses c ON c.id = m.course_id
      ORDER BY m.avg_progress DESC NULLS LAST
      LIMIT 10
    `);
    for (const r of rows) {
      console.log(
        `  ${String(r.title).slice(0, 40).padEnd(40)} enrolled=${r.enrolled} completed=${r.completed} avg=${r.avg_progress} views=${r.total_views}`,
      );
    }
    const bad = rows.filter((r) => r.avg_progress === null);
    console.log(
      bad.length === 0
        ? '\nPASS: avg_progress is populated (coalesce → 0 for enrollment-free courses).'
        : `\nFAIL: ${bad.length} rows still have NULL avg_progress.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
