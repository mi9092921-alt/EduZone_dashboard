#!/usr/bin/env node
/**
 * End-to-end smoke test for the automatic course-notification pipeline,
 * run against a REMOTE Supabase project via the Management API.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  personal access token (sbp_...)
 *   SUPABASE_PROJECT_REF   project ref
 *   SMOKE_APPLY_CLEANUP    'true' (default) soft-deletes smoke rows afterwards
 *
 * Scenarios: lesson publish (grouped copy), enrollment reactivation,
 * fresh enrollment. Push risk is checked first (0 active tokens = safe).
 * All smoke rows are tagged and cleaned; job rows stay as audit trail.
 */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF');
  process.exit(1);
}

const COURSE = 'cccccccc-0000-0000-0000-000000000001';
const SECTION = '55555555-0000-0000-0000-000000000001';
const COURSE_C = 'cccccccc-0000-0000-0000-000000000004';
const TENANT = '11111111-0000-0000-0000-000000000001';
const STUDENT = 'aaaaaaaa-0000-0000-0000-000000000004';
const LESSON_ID = 'dddddddd-0000-0000-0000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
const ORDER_INDEX = 900 + Math.floor(Math.random() * 100000);
const SMOKE_TITLE = '[SMOKE] اختبار الإشعارات التلقائية';

async function run(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} — ${text.slice(0, 400)}`);
  const rows = text ? JSON.parse(text) : null;
  console.log(`· ${label}`, JSON.stringify(rows));
  return rows;
}

// 0. push safety
const tokens = await run('push tokens:', `SELECT count(*)::int AS n FROM public.push_tokens WHERE is_active`);
if ((tokens[0]?.n ?? 0) > 0) {
  console.error('ABORT: active push tokens exist on this environment — FCM would fire for real.');
  process.exit(1);
}

// clean any residue from a previous smoke run (physical deletes on lessons
// are blocked by trg_prevent_physical_delete_lessons, so soft-delete instead;
// lesson state transitions require an auth context for changed_by, injected
// via request.jwt.claims since the Management API has no JWT)
const CLAIMS = `{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}`;
const withAuth = (sql) => `SELECT set_config('request.jwt.claims', '${CLAIMS}', true);\n` + sql;
await run('pre-clean', withAuth(`
  DELETE FROM public.user_notifications WHERE notification_id IN (
    SELECT id FROM public.notifications WHERE body LIKE '%[SMOKE]%' AND created_at > now() - interval '1 day');
  DELETE FROM public.notification_targets WHERE notification_id IN (
    SELECT id FROM public.notifications WHERE body LIKE '%[SMOKE]%' AND created_at > now() - interval '1 day');
  UPDATE public.notifications SET deleted_at = now()
    WHERE body LIKE '%[SMOKE]%' AND created_at > now() - interval '1 day' AND deleted_at IS NULL;
  UPDATE public.lessons SET is_published = false, deleted_at = now()
    WHERE title LIKE '[SMOKE]%' AND deleted_at IS NULL;
`));

// 1. lesson publish path
await run('insert published lesson', withAuth(`
  INSERT INTO public.lessons (id, section_id, course_id, tenant_id, title, order_index, is_published)
  VALUES ('${LESSON_ID}', '${SECTION}', '${COURSE}', '${TENANT}', '${SMOKE_TITLE}', ${ORDER_INDEX}, true);
`));
const job = await run('enqueued job', `
  SELECT id, tenant_id, payload, status FROM internal.job_queue
  WHERE job_type = 'NOTIFY_LESSON_PUBLISHED' AND payload->>'lesson_id' = '${LESSON_ID}' ORDER BY created_at DESC LIMIT 1;
`);
if (!job?.length) throw new Error('FAIL: publish trigger did not enqueue a job');

const processed = await run('worker run', `SELECT internal.process_course_notify_jobs(50, 'smoke-lesson');`);
const jobAfter = await run('job after worker', `
  SELECT status, result FROM internal.job_queue WHERE payload->>'lesson_id' = '${LESSON_ID}' ORDER BY created_at DESC LIMIT 1;
`);
const notif = await run('notification created', `
  SELECT n.id, n.title, n.body, n.targeting_mode, n.created_by,
         (SELECT count(*)::int FROM public.user_notifications un WHERE un.notification_id = n.id) AS inbox_rows,
         (SELECT count(*)::int FROM public.notification_targets nt WHERE nt.notification_id = n.id) AS targets,
         (SELECT count(*)::int FROM public.push_deliveries pd WHERE pd.notification_id = n.id) AS push_rows
  FROM public.notifications n
  WHERE n.body LIKE '%[SMOKE]%' AND n.created_at > now() - interval '5 minutes'
  ORDER BY n.created_at DESC LIMIT 1;
`);
const asyncFanout = await run('async fanout jobs (must be 0 = GUC mute works)', `
  SELECT count(*)::int AS n FROM internal.job_queue
  WHERE job_type = 'notification_fanout' AND payload->>'notification_id' = '${notif[0].id}';
`);

// 2. reactivation path (active -> revoked -> active restores original state)
const enr = await run('pick enrollment', `
  SELECT id, user_id, status FROM public.enrollments
  WHERE course_id = '${COURSE}' AND tenant_id = '${TENANT}' AND deleted_at IS NULL AND status = 'active' LIMIT 1;
`);
await run('revoke', `UPDATE public.enrollments SET status = 'revoked', revoked_at = now(), revoke_reason = '[SMOKE] test' WHERE id = '${enr[0].id}';`);
await run('reactivate', `UPDATE public.enrollments SET status = 'active', revoked_at = NULL, revoke_reason = NULL WHERE id = '${enr[0].id}';`);
const reJob = await run('reactivation job', `
  SELECT id, status, payload FROM internal.job_queue
  WHERE job_type = 'NOTIFY_STUDENT_ENROLLED' AND (payload->>'user_id') = '${enr[0].user_id}'
    AND (payload->>'is_reactivation') = 'true' ORDER BY created_at DESC LIMIT 1;
`);
await run('worker run 2', `SELECT internal.process_course_notify_jobs(50, 'smoke-reactivate');`);
const reNotif = await run('reactivation notification', `
  SELECT n.title, n.body,
         (SELECT count(*)::int FROM public.user_notifications un WHERE un.notification_id = n.id) AS inbox_rows
  FROM public.notifications n
  WHERE n.title = '♻️ تم إعادة تفعيل اشتراكك' AND n.tenant_id = '${TENANT}'
    AND n.created_by IS NULL AND n.created_at > now() - interval '10 minutes'
  ORDER BY n.created_at DESC LIMIT 1;
`);

// 3. fresh enrollment path — pick a course where the student has NO physical
// enrollment row at all (the unique index counts soft-deleted rows too)
const courseCPick = await run('pick fresh course', `
  SELECT c.id FROM public.courses c
  WHERE c.tenant_id = '${TENANT}' AND c.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.user_id = '${STUDENT}' AND e.course_id = c.id)
  ORDER BY c.created_at LIMIT 1;
`);
let freshEnrollment = null;
let freshNotif;
if (courseCPick?.length) {
  const COURSE_C = courseCPick[0].id;
  freshEnrollment = await run('fresh enroll', `
    INSERT INTO public.enrollments (user_id, course_id, tenant_id, enrolled_by, status)
    VALUES ('${STUDENT}', '${COURSE_C}', '${TENANT}', '${STUDENT}', 'active')
    RETURNING id;
  `);
  await run('worker run 3', `SELECT internal.process_course_notify_jobs(50, 'smoke-enroll');`);
  freshNotif = await run('fresh notification', `
    SELECT n.title, n.body,
           (SELECT count(*)::int FROM public.user_notifications un WHERE un.notification_id = n.id) AS inbox_rows
    FROM public.notifications n
    WHERE n.title = '📚 كورس جديد' AND n.tenant_id = '${TENANT}'
      AND n.created_by IS NULL AND n.created_at > now() - interval '10 minutes'
    ORDER BY n.created_at DESC LIMIT 1;
  `);
} else {
  console.log('· no course without an enrollment row for the student — fresh-enroll scenario skipped');
}

// 4. verdicts
const verdicts = [];
verdicts.push(['publish job enqueued with lesson_id/tenant_id', !!job[0]?.payload?.lesson_id && job[0].tenant_id === TENANT]);
verdicts.push(['publish job done', jobAfter[0]?.status === 'done']);
verdicts.push(['grouped notification created (title=درس جديد)', notif[0]?.title === 'درس جديد']);
verdicts.push(['inbox rows delivered to enrolled students', (notif[0]?.inbox_rows ?? 0) > 0]);
verdicts.push(['targets recorded', (notif[0]?.targets ?? 0) > 0]);
verdicts.push(['targeting_mode=users', notif[0]?.targeting_mode === 'users']);
verdicts.push(['async fanout muted (GUC)', (asyncFanout[0]?.n ?? 1) === 0]);
verdicts.push(['reactivation job processed', reJob[0]?.status === 'done' || reNotif[0]?.title !== undefined]);
verdicts.push(['reactivation copy (not "new course")', reNotif[0]?.title === '♻️ تم إعادة تفعيل اشتراكك']);
if (freshEnrollment) verdicts.push(['fresh enrollment copy', freshNotif?.[0]?.title === '📚 كورس جديد']);

console.log('--- VERDICTS ---');
let allOk = true;
for (const [name, ok] of verdicts) {
  console.log(ok ? 'PASS' : 'FAIL', '-', name);
  if (!ok) allOk = false;
}

// 5. cleanup
if (process.env.SMOKE_APPLY_CLEANUP !== 'false') {
  await run('cleanup: lesson soft-delete', withAuth(`
    UPDATE public.lessons SET is_published = false, deleted_at = now() WHERE id = '${LESSON_ID}';
  `));
  if (freshEnrollment?.length) {
    await run('cleanup: fresh enrollment soft-delete', `
      UPDATE public.enrollments SET status = 'revoked', deleted_at = now(), revoked_at = now(), revoke_reason = '[SMOKE] cleanup'
      WHERE id = '${freshEnrollment[0].id}';
    `);
  }
  await run('cleanup: notifications', `
    DELETE FROM public.user_notifications WHERE notification_id IN (
      SELECT id FROM public.notifications WHERE title IN ('درس جديد', '📚 كورس جديد', '♻️ تم إعادة تفعيل اشتراكك')
        AND tenant_id = '${TENANT}' AND created_by IS NULL AND created_at > now() - interval '1 day');
    DELETE FROM public.notification_targets WHERE notification_id IN (
      SELECT id FROM public.notifications WHERE title IN ('درس جديد', '📚 كورس جديد', '♻️ تم إعادة تفعيل اشتراكك')
        AND tenant_id = '${TENANT}' AND created_by IS NULL AND created_at > now() - interval '1 day');
    UPDATE public.notifications SET deleted_at = now()
      WHERE title IN ('درس جديد', '📚 كورس جديد', '♻️ تم إعادة تفعيل اشتراكك')
        AND tenant_id = '${TENANT}' AND created_by IS NULL AND created_at > now() - interval '1 day' AND deleted_at IS NULL;
  `);
  console.log('· cleanup done (job rows kept as audit trail)');
}

process.exitCode = allOk ? 0 : 1;
