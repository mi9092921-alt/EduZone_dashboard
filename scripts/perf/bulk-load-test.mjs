// Bulk-path load test — Performance_Reliability_Execution_Plan task T7.
// First load-testing tool in this repo; built ON TOP of the existing
// scripts/security/local-test-harness embedded Postgres 17 (no Docker, no
// cloud Supabase account needed for this layer). Runs the REAL canonical
// schema and replays the bulk-worker's exact SQL call sequence.
//
// Scenarios (plan §T7):
//   1. one 500-user job         → end-to-end DB-side completion time
//   2. 5 tenants × 100 users concurrently → zero double-processing
//      (FOR UPDATE SKIP LOCKED under real concurrency, not in theory)
//   3. kill mid-processing      → recovery time to `pending`
//   4. fairness                  → tenant B unaffected by A's full queue (T3)
//
// Usage: node scripts/perf/bulk-load-test.mjs
// Writes a baseline JSON to project_documents/performance/ so future work
// can diff against real numbers (same convention as bundle-baseline).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  startDatabaseWithSchema,
  createContext,
  seedTenant,
  enqueueJob,
  createWorkerSimulator,
  assert,
  ms,
} from './bulk-test-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = resolve(__dirname, '..', '..', 'project_documents', 'performance');

const results = [];
function record(name, pass, metrics) {
  results.push({ name, pass, metrics });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} — ${name}`);
  for (const [k, v] of Object.entries(metrics)) console.log(`   ${k}: ${v}`);
}

async function main() {
  const { stop } = await startDatabaseWithSchema();
  const baseline = {
    tool: 'scripts/perf/bulk-load-test.mjs',
    date: new Date().toISOString(),
    environment: {
      postgres: '17 (embedded, local-test-harness)',
      note:
        'DB-side bulk path only. The Deno bulk-worker Edge Function and its Supabase ' +
        'wall-clock ceiling are NOT measurable here — record the staging Edge Function ' +
        'limit in edge_function_wall_clock_limit once verified on a real project.',
      edge_function_wall_clock_limit: 'NOT_MEASURED — requires staging verification',
    },
    scenarios: {},
  };

  try {
    const serviceCtx = await createContext();
    await serviceCtx.setServiceRole();
    const worker = createWorkerSimulator(serviceCtx, { batchSize: 50 });

    // ── Scenario 1: one 500-user job, end-to-end ──────────────────
    {
      const s1 = await seedTenant(serviceCtx, {
        tenantN: 1,
        userCount: 500,
        permissions: ['warnings.write'],
      });
      const job = await enqueueJob(serviceCtx, {
        jobType: 'bulk_warn',
        tenantId: s1.tenantId,
        initiatorId: s1.adminId,
        estimatedCount: 500,
        nonce: 's1-500',
      });

      const started = Date.now();
      const run = await worker();
      const elapsed = ms(started);

      const counts = await serviceCtx.query(
        `SELECT count(*)::int AS warnings FROM public.warnings WHERE tenant_id = $1`,
        [s1.tenantId],
      );
      const pass =
        run.processed === 500 &&
        run.result.succeeded_ids.length === 500 &&
        counts.rows[0].warnings === 500;
      record(
        'S1: 500-user job completes end-to-end',
        pass,
        {
          elapsed_ms: elapsed,
          processed: run.processed,
          warnings_written: counts.rows[0].warnings,
          batches: 10,
          note: '10 batches × 50 parallel worker_issue_warning RPCs',
        },
      );
      baseline.scenarios.s1_single_job_500_users = { elapsed_ms: elapsed, processed: run.processed };
      if (!pass) process.exitCode = 1;
    }

    // ── Scenario 2: 5 concurrent jobs / 5 tenants — SKIP LOCKED ───
    {
      const tenants = [];
      for (let i = 0; i < 5; i++) {
        tenants.push(
          await seedTenant(serviceCtx, {
            tenantN: 10 + i,
            userCount: 100,
            permissions: ['warnings.write'],
          }),
        );
      }

      // 5 concurrent enqueues (separate connections).
      const enqueueContexts = [];
      for (let i = 0; i < 5; i++) enqueueContexts.push(await createContext());
      const jobs = await Promise.all(
        tenants.map((t, i) =>
          enqueueJob(enqueueContexts[i], {
            jobType: 'bulk_warn',
            tenantId: t.tenantId,
            initiatorId: t.adminId,
            estimatedCount: 100,
            nonce: `s2-job-${i}`,
          }),
        ),
      );
      await Promise.all(enqueueContexts.map((c) => c.end()));
      assert(jobs.length === 5, '5 jobs enqueued concurrently');

      // 5 concurrent worker claims on 5 dedicated connections — the real
      // FOR UPDATE SKIP LOCKED contention the plan demands.
      const workerContexts = [];
      for (let i = 0; i < 5; i++) workerContexts.push(await createContext());
      const started = Date.now();
      const runs = await Promise.all(
        workerContexts.map((ctx) => createWorkerSimulator(ctx, { batchSize: 50 })()),
      );
      const elapsed = ms(started);
      await Promise.all(workerContexts.map((c) => c.end()));

      // Zero double-processing: every job done exactly once; every user
      // warned exactly once (F-02 semantics under concurrency).
      const doneCount = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM internal.job_queue WHERE status='done'`,
      );
      const dupWarnings = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM (
           SELECT tenant_id, user_id FROM public.warnings GROUP BY tenant_id, user_id HAVING count(*) > 1
         ) d`,
      );
      const totalWarnings = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM public.warnings`,
      );

      const totalProcessed = runs.reduce((acc, r) => acc + (r?.processed ?? 0), 0);
      const pass =
        doneCount.rows[0].n === 5 &&
        dupWarnings.rows[0].n === 0 &&
        totalWarnings.rows[0].n === 500 &&
        totalProcessed === 500;
      record(
        'S2: 5 concurrent jobs across 5 tenants — zero double-processing',
        pass,
        {
          elapsed_ms_total_wall_clock: elapsed,
          concurrent_dequeues: 5,
          jobs_done: doneCount.rows[0].n,
          users_double_warned: dupWarnings.rows[0].n,
          total_warnings: totalWarnings.rows[0].n,
        },
      );
      baseline.scenarios.s2_concurrent_5x100 = {
        elapsed_ms_wall_clock: elapsed,
        jobs_done: doneCount.rows[0].n,
        users_double_warned: dupWarnings.rows[0].n,
      };
      if (!pass) process.exitCode = 1;
    }

    // ── Scenario 3: kill mid-processing → recovery time ───────────
    {
      const s3 = await seedTenant(serviceCtx, {
        tenantN: 20,
        userCount: 300,
        permissions: ['warnings.write'],
      });
      await enqueueJob(serviceCtx, {
        jobType: 'bulk_warn',
        tenantId: s3.tenantId,
        initiatorId: s3.adminId,
        estimatedCount: 300,
        nonce: 's3-kill',
      });

      // Worker claims the job and "dies" after the first 100 users.
      const crashed = await worker({ crashAfterUsers: 100 });
      assert(crashed && crashed.crashed, 'worker crashed after 100 users');

      // Real recovery = remaining LOCK_TTL (1800s here, configurable in
      // production) + one cron cycle. We fast-forward the TTL, then measure
      // the release call itself — the automated half of the recovery path.
      const t0 = Date.now();
      await serviceCtx.query(
        `UPDATE internal.job_queue SET lock_expires_at = now() - interval '1 second' WHERE id = $1`,
        [crashed.job.id],
      );
      const adminCtx = await createContext();
      const released = await adminCtx.query(`SELECT public.release_stale_job_locks() AS n`);
      const after = await serviceCtx.query(
        `SELECT status FROM internal.job_queue WHERE id = $1`,
        [crashed.job.id],
      );
      const releaseMs = ms(t0);
      await adminCtx.end();

      // …and the recovered job processes to completion from the checkpoint.
      const t1 = Date.now();
      const resumed = await worker();
      const resumeMs = ms(t1);

      const pass =
        released.rows[0].n >= 1 &&
        after.rows[0].status === 'pending' &&
        resumed &&
        !resumed.crashed &&
        resumed.processed === 200; // 300 - 100 already done (checkpoint)
      record(
        'S3: kill mid-processing → release → resume from checkpoint',
        pass,
        {
          release_call_ms: releaseMs,
          resume_processing_ms: resumeMs,
          crashed_after: crashed.processed,
          resumed_processed: resumed.processed,
          recovery_formula:
            '≤ LOCK_TTL_SECONDS remaining + one cron cycle (~60s); TTL fast-forwarded in test',
        },
      );
      baseline.scenarios.s3_kill_recovery = {
        release_call_ms: releaseMs,
        resume_processing_ms: resumeMs,
        lock_ttl_seconds: 1800,
      };
      if (!pass) process.exitCode = 1;
    }

    // ── Scenario 4: fairness — B unaffected by A's full queue (T3) ─
    {
      const a = await seedTenant(serviceCtx, { tenantN: 30 });
      const b = await seedTenant(serviceCtx, {
        tenantN: 31,
        userCount: 25,
        permissions: ['warnings.write'],
      });

      const t0 = Date.now();
      for (let i = 0; i < 10; i++) {
        await enqueueJob(serviceCtx, {
          jobType: 'bulk_warn',
          tenantId: a.tenantId,
          initiatorId: a.adminId,
          estimatedCount: 1,
          nonce: `s4-a-${i}`,
        });
      }
      const aFillMs = ms(t0);

      const t1 = Date.now();
      const bJob = await enqueueJob(serviceCtx, {
        jobType: 'bulk_warn',
        tenantId: b.tenantId,
        initiatorId: b.adminId,
        estimatedCount: 25,
        nonce: 's4-b-first',
      });
      const bEnqueueMs = ms(t1);

      let a11Error = null;
      try {
        await enqueueJob(serviceCtx, {
          jobType: 'bulk_warn',
          tenantId: a.tenantId,
          initiatorId: a.adminId,
          estimatedCount: 1,
          nonce: 's4-a-11th',
        });
      } catch (err) {
        a11Error = err.message;
      }

      // B's job runs to completion while A's 10 stay pending.
      const bRun = await worker();
      const bDone = await serviceCtx.query(
        `SELECT status FROM internal.job_queue WHERE id = $1`,
        [bJob.id],
      );
      const bWarnings = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM public.warnings WHERE tenant_id = $1`,
        [b.tenantId],
      );
      const aStillPending = await serviceCtx.query(
        `SELECT count(*)::int AS n FROM internal.job_queue WHERE status='pending' AND tenant_id=$1`,
        [a.tenantId],
      );

      const pass =
        bJob !== null &&
        a11Error !== null &&
        a11Error.includes('JOB_QUEUE_FULL') &&
        bRun.processed === 25 &&
        bDone.rows[0].status === 'done' &&
        bWarnings.rows[0].n === 25 &&
        aStillPending.rows[0].n === 10;
      record(
        'S4: fairness — tenant B completes its job while A is queue-capped',
        pass,
        {
          a_fill_ms: aFillMs,
          b_enqueue_ms: bEnqueueMs,
          a_11th_rejected: a11Error ? a11Error.split('\n')[0] : 'NOT REJECTED',
          b_processed: bRun.processed,
          b_warnings: bWarnings.rows[0].n,
          a_jobs_still_pending: aStillPending.rows[0].n,
        },
      );
      baseline.scenarios.s4_fairness = {
        b_enqueue_ms: bEnqueueMs,
        b_processed: bRun.processed,
        a_jobs_still_pending: aStillPending.rows[0].n,
      };
      if (!pass) process.exitCode = 1;
    }
  } finally {
    await stop();
  }

  // ── Persist the baseline ─────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  baseline.summary = {
    pass: passed,
    total: results.length,
    all_pass: passed === results.length,
  };
  mkdirSync(BASELINE_DIR, { recursive: true });
  const baselinePath = join(BASELINE_DIR, 'bulk-load-baseline-2026-09-06.json');
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n═══ Load summary: ${passed}/${results.length} PASS ═══`);
  console.log(`→ baseline written: ${baselinePath}`);
  if (passed !== results.length) {
    process.exitCode = 1; // exitCode (not process.exit) so buffered stdout flushes
  }
}
