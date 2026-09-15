#!/usr/bin/env node
/**
 * Diagnose why the System Analytics "Course Performance" section is empty.
 * Uses the Supabase Management API SQL endpoint (direct-pg is blocked on
 * this workstation — see run_validation_mgmt.mjs).
 * Read-only: SELECTs only, no mutations.
 */
import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('./.env.deploy', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in scripts/.env.deploy');
  process.exit(1);
}

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const checks = [
  ['mv_course_stats rows', "SELECT count(*)::int AS n, max(refreshed_at) AS last_refresh FROM private.mv_course_stats"],
  ['mv_user_stats rows', "SELECT count(*)::int AS n, max(refreshed_at) AS last_refresh FROM private.mv_user_stats"],
  ['base data', `SELECT
    (SELECT count(*)::int FROM public.courses WHERE deleted_at IS NULL) AS courses,
    (SELECT count(*)::int FROM public.enrollments WHERE deleted_at IS NULL) AS enrollments,
    (SELECT count(*)::int FROM public.users WHERE deleted_at IS NULL) AS users`],
  ['admins', `SELECT u.primary_role, u.account_status, count(*)::int AS n
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name IN ('admin','super_admin') AND u.deleted_at IS NULL
    GROUP BY 1,2 LIMIT 10`],
  ['refresh jobs in queue', `SELECT job_type, status, count(*)::int AS n
    FROM internal.job_queue WHERE job_type ILIKE '%refresh%'
    GROUP BY 1,2 ORDER BY 1 LIMIT 10`],
  ['cron jobs (if any)', `SELECT jobname, schedule, active FROM cron.job LIMIT 10`],
];

let failed = 0;
for (const [label, sql] of checks) {
  try {
    const rows = await runQuery(sql);
    console.log(`\n== ${label} ==`);
    console.log(JSON.stringify(rows, null, 1));
  } catch (e) {
    failed++;
    console.log(`\n== ${label} == ERROR: ${e.message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
