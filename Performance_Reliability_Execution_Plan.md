# EduZone Dashboard — Performance & Reliability Execution Plan

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-09  
**Status:** **CLOSED — all items T1–T7 verified with executable runtime evidence**

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

**Runtime status: VERIFIED.**

Evidence recorded via `scripts/perf/bulk-reliability-test.mjs`:
- Expired processing lock (`locked_at` / `lock_expires_at` past) called in cron context (`postgres` role, no JWT) executes `release_stale_job_locks()` and resets status to `pending` in 14ms (`released=1`).
- `release_stale_job_locks()` also confirmed working for `service_role` API callers.
- Canonical schema (`07_functions.sql`) verified: guarded registration via `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')`.

### T2 — Bulk result/checkpoint/retry semantics

**Source status: IMPLEMENTED.**

The current schema and bulk worker use `job_queue.result` for structured progress/checkpoint data. The worker preserves `succeeded_ids` and retries can resume from that checkpoint instead of repeating already-successful actions.

**Runtime status: VERIFIED.**

Evidence recorded via `scripts/perf/bulk-reliability-test.mjs`:
- Interruption simulation: worker processed first 15 users, checkpointed `succeeded_ids` (15 items), and crashed.
- Recovery: job expired lock released, resumed with new worker.
- Resumed run processed only the remaining 15 users (`attempt2 processed=15`).
- Total warnings = 30, double-warned users = 0 (`F-02` zero duplicate side-effects invariant maintained).

### T3 — Tenant-scoped queue fairness

**Source status: IMPLEMENTED.**

`public.admin_enqueue_bulk_job()` now counts `pending` jobs for the initiator's tenant only, with a ceiling of 10. The previous global queue count is no longer present in the current canonical function definition.

**Runtime status: VERIFIED.**

Evidence recorded via `scripts/perf/bulk-reliability-test.mjs` & `scripts/perf/bulk-load-test.mjs`:
- Tenant A saturated to 10 pending jobs.
- Tenant B submitted job successfully (`bJob=ok, bError=null`).
- Tenant A attempted 11th job and was immediately rejected with `JOB_QUEUE_FULL: Too many pending operations`.
- Under queue drain (Scenario S4), B's job completed cleanly without being starved or lost.

### T4 — Bulk worker resilience and bounded scope

**Source status: IMPLEMENTED.**

The current `bulk-worker`:

- re-checks the actual matching user count immediately before processing;
- caps a single job at 500 users;
- records truncation/remaining counts;
- processes batches with `Promise.allSettled()`;
- persists structured progress and checkpoints incrementally.

**Runtime status: VERIFIED.**

Evidence recorded via `scripts/perf/bulk-reliability-test.mjs`:
- Filter grew from 300 to 600 matching users between submit and execution.
- Worker executed and strictly capped processing at 500 (`processed=500`).
- Result persisted: `truncated=true`, `remaining=100`, `succeeded_ids.length=500`.

### T5 — Tenant-list N+1

**Source status: IMPLEMENTED.**

`tenants.service.ts` uses one `get_tenants_usage` RPC for the page rather than two count queries per tenant.

**Runtime status: VERIFIED.**

Evidence recorded via `apps/admin/src/infrastructure/repos/tenants.service.test.ts`:
- 15 unit tests passed.
- 50-tenant pagination benchmark: verified that fetching 50 tenants triggers exactly 1 table query (`tenants`) and exactly 1 batched RPC query (`get_tenants_usage` with 50 IDs), eliminating the prior ~100 individual count queries per page.

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

**Runtime status: VERIFIED.**

Evidence recorded via `apps/admin/src/infrastructure/youtube.service.test.ts`:
- 10 unit tests passed.
- Batching: 10 valid videos retrieved in 1 HTTP call.
- Pagination: >50 IDs chunked into separate requests of ≤50 items.
- Partial failure: 1 missing video (404-equivalent) isolated without failing batch (9 ok, 1 recorded in `partial_failures`).
- Timeout: AbortController aborts with `youtube_timeout` error within timeout window.
- Rate limiting: HTTP 429 retries once after backoff delay and succeeds.

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

**Runtime status: VERIFIED.**

Evidence recorded via `scripts/perf/bulk-load-test.mjs`:
- 4/4 scenarios passed (S1: 500-user single job, S2: 5 concurrent jobs/tenants zero double-warn, S3: kill mid-processing and resume from checkpoint, S4: queue cap and fairness drain).
- Baseline results recorded and persisted to `project_documents/performance/bulk-load-baseline-2026-09-06.json`.

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
| T1 stale locks | Implemented | `bulk-reliability-test.mjs` (cron context, 14ms release) | VERIFIED |
| T2 checkpoint/retry | Implemented | `bulk-reliability-test.mjs` (mid-run crash, 0 double-warn) | VERIFIED |
| T3 tenant queue cap | Implemented | `bulk-reliability-test.mjs` + `bulk-load-test.mjs` (S4 cap) | VERIFIED |
| T4 worker resilience | Implemented | `bulk-reliability-test.mjs` (300→600 growth, truncated:true) | VERIFIED |
| T5 tenant N+1 | Implemented | `tenants.service.test.ts` (50-tenant 1 RPC benchmark) | VERIFIED |
| T6 YouTube resilience | Implemented | `youtube.service.test.ts` (MSW batch/429/timeout/404 tests) | VERIFIED |
| T7 load baseline | Tooling present | `bulk-load-test.mjs` (4/4 scenarios PASS + baseline JSON) | VERIFIED |

## 6. Release rule

A performance or reliability item may be marked **VERIFIED** only when its corresponding executable evidence is recorded. Source implementation alone is not sufficient.
