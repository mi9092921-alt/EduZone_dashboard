# EduZone Dashboard — Performance & Reliability Execution Plan

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-08  
**Status:** **OPEN — source fixes are present in several areas; runtime/load evidence remains required**

## 1. Evidence policy

This is an execution and verification document, not a blanket statement that performance work is complete.

```text
Implemented in source
≠
Verified at runtime
≠
Production-approved
```

Use:

```text
Check → Think → Modify → Verify → Repeat
```

## 2. Current source-state audit

### T1 — Stale job-lock recovery

**Source status: IMPLEMENTED.**

`public.release_stale_job_locks()` exists and the canonical schema registers a guarded `pg_cron` schedule named `release-stale-job-locks` every minute when `pg_cron` and its job table are available.

**Runtime status: UNVERIFIED.**

Required evidence:

```sql
SELECT * FROM cron.job WHERE jobname = 'release-stale-job-locks';
```

Then create an expired processing lock and verify that it becomes `pending` after the scheduler executes.

### T2 — Bulk result/checkpoint/retry semantics

**Source status: IMPLEMENTED.**

The current schema and bulk worker use `job_queue.result` for structured progress/checkpoint data. The worker preserves `succeeded_ids` and retries can resume from that checkpoint instead of repeating already-successful actions.

**Runtime status: UNVERIFIED.**

Required evidence:

```text
process batch
→ crash/interruption
→ release/retry
→ resume from succeeded_ids
→ no duplicate side effects
```

### T3 — Tenant-scoped queue fairness

**Source status: IMPLEMENTED.**

`public.admin_enqueue_bulk_job()` now counts `pending` jobs for the initiator's tenant only, with a ceiling of 10. The previous global queue count is no longer present in the current canonical function definition.

**Runtime status: UNVERIFIED.**

Required evidence:

```text
Tenant A = 10 pending
Tenant B = 0 pending
→ Tenant B can enqueue
→ Tenant A enqueue is rejected
```

### T4 — Bulk worker resilience and bounded scope

**Source status: IMPLEMENTED.**

The current `bulk-worker`:

- re-checks the actual matching user count immediately before processing;
- caps a single job at 500 users;
- records truncation/remaining counts;
- processes batches with `Promise.allSettled()`;
- persists structured progress and checkpoints incrementally.

**Runtime status: UNVERIFIED.**

Required evidence includes worker interruption, partial per-user failure, retry, and truncation scenarios.

### T5 — Tenant-list N+1

**Source status: IMPLEMENTED.**

`tenants.service.ts` uses one `get_tenants_usage` RPC for the page rather than two count queries per tenant.

**Runtime status: UNVERIFIED.**

Acceptance evidence should record the actual request/query count for a representative page, including a 50-tenant case.

### T6 — YouTube/API resilience

**Source status: IMPLEMENTED.**

The current YouTube service provides:

```text
≤50 IDs per API call
8-second AbortController timeout
one 429 retry with bounded delay
per-input partial failures
```

`createLessons()` consumes the batch result and continues lesson creation when metadata for an individual video cannot be resolved.

**Runtime status: UNVERIFIED.**

Required evidence:

```text
10 valid videos → one API request where possible
1 invalid video → remaining lessons still created
>8s response → timeout, not an unbounded hang
429 → one retry, then bounded failure
```

### T7 — Load and performance baseline

**Source status: TOOLING PRESENT.**

Current repository tooling includes:

```text
scripts/perf/bulk-load-test.mjs
scripts/perf/bulk-reliability-test.mjs
scripts/perf/bulk-test-utils.mjs
scripts/perf/bundle-baseline.mjs
scripts/perf/web-vitals.mjs
```

**Runtime status: UNVERIFIED.**

The repository contains test tooling, but this review does not treat the existence of those scripts as a completed benchmark.

## 3. Database performance verification

For critical queries, capture:

```text
EXPLAIN / EXPLAIN ANALYZE
rows scanned
index usage
sort/aggregate cost
tenant-filter selectivity
concurrency behavior
```

Do not close an optimization item solely from source inspection.

## 4. Reliability requirements

Where applicable, asynchronous and external operations should have:

```text
idempotency
bounded retries
timeouts
lease/lock expiry
cancellation semantics
durable status
safe recovery
```

## 5. Verification ledger

| Item | Source state | Runtime evidence | Status |
|---|---|---|---|
| T1 stale locks | Implemented | cron execution + expired-lock test | UNVERIFIED |
| T2 checkpoint/retry | Implemented | interruption/retry/idempotency test | UNVERIFIED |
| T3 tenant queue cap | Implemented | Tenant A/B queue test | UNVERIFIED |
| T4 worker resilience | Implemented | partial-failure/truncation/retry test | UNVERIFIED |
| T5 tenant N+1 | Implemented | request/query-count benchmark | UNVERIFIED |
| T6 YouTube resilience | Implemented | MSW/delayed/429/404 tests | UNVERIFIED |
| T7 load baseline | Tooling present | benchmark execution + recorded results | UNVERIFIED |

## 6. Release rule

A performance or reliability item may be marked **VERIFIED** only when its corresponding executable evidence is recorded. Source implementation alone is not sufficient.
