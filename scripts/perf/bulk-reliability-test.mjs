// Bulk-path reliability tests — Performance_Reliability_Execution_Plan tasks
// T1 (stale-lock release), T3 (per-tenant queue cap) and T2+T4 (result
// checkpoint / zero double-impact retry + truncated re-count).
//
// Runs against the disposable Postgres 17 harness with the REAL canonical
// schema applied (see bulk-test-utils.mjs). Exit code 0 = all PASS.
//
// Usage:  node scripts/perf/bulk-reliability-test.mjs
import {
  startDatabaseWithSchema,
  createContext,
  seedTenant,
  enqueueJob,
  createWorkerSimulator,
  assert,
  ms,
} from './bulk-test-utils.mjs';

const results = [];
function record(name, pass, details) {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} — ${name}${details ? `\n   ${details}` : ''}`);
}

// Drain any pending queue leftovers (e.g. T1/T3's no-user jobs) so each
// reliability scenario starts from a deterministic queue state.
async function drainQueue(worker) {
  for (let i = 0; i < 100; i++) {
    const r = await worker();
    if (!r) return i;
  }
  return 100;
}

async function main() {
  const { stop } = await startDatabaseWithSchema();
  const failures = [];

  try {
    // ── Shared contexts ───────────────────────────────────────────
    const adminCtx = await createContext(); // "cron"/maintenance context (no JWT GUCs)
    const serviceCtx = await createContext(); // service_role context

    // ══════════════════════════════════════════════════════════════
    // T1 — release_stale_job_locks resets expired processing jobs
    // (cron-safe guard: callable by the postgres role with no JWT context)
    // ══════════════════════════════════════════════════════════════
    {
      const { tenantId: tId, adminId } = await seedTenant(serviceCtx, { tenantN: 1 });
      const job = await enqueueJob(serviceCtx, {
        jobType: 'bulk_warn',
        tenantId: tId,
        initiatorId: adminId,
        estimatedCount: 1,
        nonce: 't1-stale',
      });

      // Simulate a worker that claimed the job and died: processing +
      // lock already expired (TTL passed).
      await serviceCtx.query(
        `UPDATE internal.job_queue
         SET status = 'processing',
             locked_at = now() - interval '35 minutes',
             lock_expires_at = now() - interval '5 minutes',
             started_at = now() - interval '35 minutes'
         WHERE id = $1`,
        [job.id],
      );

      // Call it WITHOUT service_role GUCs — the pg_cron context (postgres
      // role, no JWT). The old admin-only guard would raise here every
      // minute; the cron-safe coalesce(auth.role(), current_user) passes.
      const started = Date.now();
      const released = await adminCtx.query(`SELECT public.release_stale_job_locks() AS n`);
      const after = await serviceCtx.query(`SELECT status FROM internal.job_queue WHERE id = $1`, [
        job.id,
      ]);
      const duration = ms(started);

      const pass = released.rows[0].n >= 1 && after.rows[0].status === 'pending';
      record(
        'T1: release_stale_job_locks() recovers an expired processing job (cron context)',
        pass,
        `released=${released.rows[0].n}, status=${after.rows[0].status}, call took ${duration}ms`,
      );
      if (!pass) failures.push('T1 function');

      // And it still accepts the service_role API caller (jobs.service.ts path).
      await serviceCtx.query(
        `UPDATE internal.job_queue SET status='processing', lock_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [job.id],
      );
      await serviceCtx.setServiceRole();
      const releasedAsService = await serviceCtx.query(`SELECT public.release_stale_job_locks() AS n`);
      record(
        'T1: release_stale_job_locks() still allowed for service_role API callers',
        releasedAsService.rows[0].n >= 1,
        `released=${releasedAsService.rows[0].n}`,
      );
    }

    // ══════════════════════════════════════════════════════════════
    // T3 — per-tenant queue cap (fairness): tenant B unaffected by
    // tenant A's full queue; A's 11th pending job rejected.
    // ══════════════════════════════════════════════════════════════
    {
      const a = await seedTenant(serviceCtx, { tenantN: 2 });
      const b = await seedTenant(serviceCtx, { tenantN: 3 });

      // Fill tenant A's queue (per-tenant cap = 10).
      for (let i = 0; i < 10; i++) {
        await enqueueJob(serviceCtx, {
          jobType: 'bulk_warn',
          tenantId: a.tenantId,
          initiatorId: a.adminId,
          estimatedCount: 1,
          nonce: `t3-fill-${i}`,
        });
      }
      const pendingA = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM internal.job_queue WHERE status='pending' AND tenant_id=$1`,
        [a.tenantId],
      );

      // B's first enqueue must succeed despite A being full.
      let bJob = null;
      let bError = null;
      try {
        bJob = await enqueueJob(serviceCtx, {
          jobType: 'bulk_warn',
          tenantId: b.tenantId,
          initiatorId: b.adminId,
          estimatedCount: 1,
          nonce: 't3-b-first',
        });
      } catch (err) {
        bError = err.message;
      }

      // A's 11th enqueue must be rejected with JOB_QUEUE_FULL.
      let a11Error = null;
      try {
        await enqueueJob(serviceCtx, {
          jobType: 'bulk_warn',
          tenantId: a.tenantId,
          initiatorId: a.adminId,
          estimatedCount: 1,
          nonce: 't3-a-11th',
        });
      } catch (err) {
        a11Error = err.message;
      }

      const pass =
        pendingA.rows[0].n === 10 &&
        bJob !== null &&
        bError === null &&
        a11Error !== null &&
        a11Error.includes('JOB_QUEUE_FULL');
      record(
        'T3: per-tenant queue cap — B enqueues fine while A is full; A hits JOB_QUEUE_FULL',
        pass,
        `pendingA=${pendingA.rows[0].n}, bJob=${bJob ? 'ok' : 'FAILED'}, bError=${bError}, a11Error=${a11Error}`,
      );
      if (!pass) failures.push('T3 cap');
    }

    // ══════════════════════════════════════════════════════════════
    // T2 — crash mid-processing → release → retry: ZERO double-impact
    // (F-02, action = warn via the real worker_issue_warning RPC)
    // ══════════════════════════════════════════════════════════════
    {
      const c = await seedTenant(serviceCtx, {
        tenantN: 4,
        userCount: 30,
        permissions: ['warnings.write'],
      });

      // T1/T3 leave pending no-user jobs in the queue; dequeue picks by
      // run_at ASC, so drain them first for a deterministic scenario start.
      await drainQueue(createWorkerSimulator(serviceCtx, { batchSize: 50 }));

      const job = await enqueueJob(serviceCtx, {
        jobType: 'bulk_warn',
        tenantId: c.tenantId,
        initiatorId: c.adminId,
        estimatedCount: 30,
        nonce: 't2-crash',
      });

      const worker = createWorkerSimulator(serviceCtx, { batchSize: 15 });

      // Attempt 1: process the first 15 (checkpoint written) then "crash".
      const run1 = await worker({ crashAfterUsers: 15 });
      assert(run1 && run1.crashed, 'attempt 1 crashed mid-processing');
      assert(run1.processed === 15, 'attempt 1 processed 15 users', run1.processed);

      const mid1 = await serviceCtx.query(
        `SELECT status, result FROM internal.job_queue WHERE id = $1`,
        [job.id],
      );
      const midResult = mid1.rows[0].result ?? {};
      assert(
        Array.isArray(midResult.succeeded_ids) && midResult.succeeded_ids.length === 15,
        'checkpoint result.succeeded_ids has 15 entries after the first batch',
        midResult.succeeded_ids?.length,
      );
      assert(mid1.rows[0].status === 'processing', 'job still processing after crash');

      const warnsAfterRun1 = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM public.warnings WHERE tenant_id = $1`,
        [c.tenantId],
      );
      assert(warnsAfterRun1.rows[0].n === 15, 'exactly 15 warnings after attempt 1', warnsAfterRun1.rows[0].n);

      // TTL passes with no worker around…
      await serviceCtx.query(
        `UPDATE internal.job_queue SET lock_expires_at = now() - interval '1 second' WHERE id = $1`,
        [job.id],
      );
      // …the scheduled release (T1) puts it back to pending, keeping result.
      const released = await adminCtx.query(`SELECT public.release_stale_job_locks() AS n`);
      assert(released.rows[0].n >= 1, 'stale lock released before retry');

      const retryRes = await serviceCtx.query(
        `SELECT result FROM internal.job_queue WHERE id = $1`,
        [job.id],
      );
      assert(
        Array.isArray(retryRes.rows[0].result?.succeeded_ids) &&
          retryRes.rows[0].result.succeeded_ids.length === 15,
        'result checkpoint SURVIVED the stale-lock release (not wiped)',
      );

      // Attempt 2: the worker resumes from the checkpoint — only the
      // remaining 15 users get worker_issue_warning.
      const run2 = await worker();
      assert(run2 && !run2.crashed, 'attempt 2 completed');
      assert(run2.processed === 15, 'attempt 2 processed only the remaining 15 users', run2.processed);

      const after = await serviceCtx.query(
        `SELECT status, result FROM internal.job_queue WHERE id = $1`,
        [job.id],
      );
      const finalResult = after.rows[0].result ?? {};
      assert(after.rows[0].status === 'done', 'job done after retry');
      assert(finalResult.truncated === false, 'final result not truncated');

      // THE F-02 assertion: every one of the 30 users has EXACTLY ONE warning.
      const dupes = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM (
           SELECT user_id FROM public.warnings WHERE tenant_id = $1 GROUP BY user_id HAVING count(*) > 1
         ) d`,
        [c.tenantId],
      );
      const totalWarned = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM public.warnings WHERE tenant_id = $1`,
        [c.tenantId],
      );

      const pass =
        dupes.rows[0].n === 0 &&
        totalWarned.rows[0].n === 30 &&
        finalResult.succeeded_ids.length === 30 &&
        finalResult.failed_ids.length === 0;
      record(
        'T2/F-02: crash → release → retry issues ZERO duplicate warnings',
        pass,
        `total warnings=${totalWarned.rows[0].n}, users double-warned=${dupes.rows[0].n}, ` +
          `succeeded_ids=${finalResult.succeeded_ids.length}, attempt2 processed=${run2.processed}`,
      );
      if (!pass) failures.push('T2 double-impact');
    }

    // __T4_SUMMARY__

    // __T4_SUMMARY__

    // ══════════════════════════════════════════════════════════════
    // T4 — filter grew past 500 between submit and run → result says
    // truncated:true + remaining, never silent.
    // ══════════════════════════════════════════════════════════════
    {
      const d = await seedTenant(serviceCtx, {
        tenantN: 5,
        userCount: 300,
        permissions: ['warnings.write'],
      });
      const job = await enqueueJob(serviceCtx, {
        jobType: 'bulk_warn',
        tenantId: d.tenantId,
        initiatorId: d.adminId,
        estimatedCount: 300, // snapshot at submit time
        nonce: 't4-grow',
      });
      assert(job !== null, 'T4 job enqueued');

      // The filter "grows" 300 → 600 between submit and execution.
      await serviceCtx.query(
        `
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
        SELECT ('a205' || '0000-0000-4000-8000-' || lpad((100000 + g)::text, 12, '0'))::uuid,
               'late-' || g || '@t5.perf.local', 'x', now(), now(), now(), 'authenticated', 'authenticated'
        FROM generate_series(1, 300) g
        ON CONFLICT (id) DO NOTHING`,
      );
      await serviceCtx.query(
        `
        INSERT INTO public.users (id, tenant_id, email, email_hash, first_name, last_name, primary_role, account_status)
        SELECT ('a205' || '0000-0000-4000-8000-' || lpad((100000 + g)::text, 12, '0'))::uuid,
               $1, 'late-' || g || '@t5.perf.local',
               encode(extensions.digest(lower(btrim('late-' || g || '@t5.perf.local')), 'sha256'), 'hex'),
               'Late', g::text, 'student', 'active'
        FROM generate_series(1, 300) g
        ON CONFLICT (id) DO NOTHING`,
        [d.tenantId],
      );

      const worker = createWorkerSimulator(serviceCtx, { batchSize: 50 });
      // T3 leaves tenant A's 10 pending jobs (no users) — drain before T4.
      await drainQueue(worker);

      const run = await worker();

      assert(run && !run.crashed, 'T4 run completed');
      assert(run.truncated === true, 'run reports truncated');
      assert(run.processed === 500, 'processed exactly the 500 cap', run.processed);
      assert(run.remaining === 100, 'remaining = 600 - 500 = 100', run.remaining);

      const finalResult = run.result;
      const pass =
        finalResult.truncated === true &&
        finalResult.remaining === 100 &&
        finalResult.processed === 500 &&
        finalResult.succeeded_ids.length === 500;
      record(
        'T4: filter growth 300→600 yields truncated:true + remaining:100 in result',
        pass,
        `processed=${finalResult.processed}, truncated=${finalResult.truncated}, remaining=${finalResult.remaining}`,
      );
      if (!pass) failures.push('T4 truncation');
    }

    await adminCtx.end();
    await serviceCtx.end();
  } finally {
    await stop();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n═══ Reliability summary: ${passed}/${results.length} PASS ═══`);
  if (failures.length > 0 || passed !== results.length) {
    console.error(`Failed areas: ${failures.join(', ')}`);
    // exitCode (not process.exit) so buffered stdout fully flushes before exit
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n❌ reliability test run crashed:', err.message);
  process.exitCode = 1;
});
