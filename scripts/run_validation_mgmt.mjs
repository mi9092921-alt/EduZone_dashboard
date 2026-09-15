#!/usr/bin/env node
/**
 * One-off validation runner against a remote Supabase project via the
 * Management API (avoids direct-pg TLS issues on this workstation).
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  personal access token (sbp_...)
 *   SUPABASE_PROJECT_REF   project ref (host prefix of SUPABASE_URL)
 *
 * Runs supabase/schema/VALIDATION.sql plus result/cron/queue queries in a
 * single session (the results table is TEMP), then prints a summary.
 */
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF');
  process.exit(1);
}

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const validationSql =
  fs.readFileSync(join(ROOT, 'supabase/schema/VALIDATION.sql'), 'utf8') +
  "\nSELECT coalesce(json_agg(t), '[]'::json) AS rows FROM validation_results t;";

const results = await runQuery(validationSql);
const rows = results[0]?.rows ?? [];
const fails = rows.filter((x) => x.status !== 'PASS');
for (const row of rows) {
  console.log(String(row.status).padEnd(5), row.check_name, '—', String(row.details).slice(0, 110));
}
console.log('---');
console.log(fails.length === 0 ? `ALL PASS (${rows.length} checks)` : `FAILURES: ${fails.length}`);

const cron = await runQuery(
  "SELECT coalesce(json_agg(t), '[]'::json) AS rows FROM (SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('course-notification-worker','notification_push_worker','release-stale-job-locks') ORDER BY 1) t",
);
for (const j of cron[0]?.rows ?? []) console.log('CRON:', j.jobname, j.schedule, `active=${j.active}`);

const queue = await runQuery(
  "SELECT coalesce(json_agg(t), '[]'::json) AS rows FROM (SELECT status, count(*)::int AS n FROM internal.job_queue WHERE job_type IN ('NOTIFY_LESSON_PUBLISHED','NOTIFY_STUDENT_ENROLLED') GROUP BY status ORDER BY 1) t",
);
for (const b of queue[0]?.rows ?? []) console.log('QUEUE:', b.status, b.n);

process.exitCode = fails.length === 0 ? 0 : 1;
