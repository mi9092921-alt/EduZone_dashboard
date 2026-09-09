// Shared infrastructure for the bulk-path performance/reliability tests
// (scripts/perf/bulk-load-test.mjs, scripts/perf/bulk-reliability-test.mjs).
//
// It reuses the disposable Postgres 17 harness from
// scripts/security/local-test-harness/ (same embedded-postgres dependency,
// same port 54329, same eduzone_rls_test database, same throwaway data dir)
// and applies the REAL canonical schema from supabase/schema/*.sql so every
// function under test is the production definition, not a mock.
//
// pg_cron / pg_net are not available inside the embedded cluster (they need
// shared_preload_libraries at the cluster level), so those two CREATE
// EXTENSION lines are skipped — every cron.schedule call in the schema is
// already defensively guarded by IF EXISTS (pg_extension → pg_cron) and
// becomes a no-op locally, exactly as documented in plan task T1.
//
// Worker simulation note: the Deno bulk-worker Edge Function cannot run
// inside this harness, so the test scripts replay the worker's exact SQL
// call sequence (public.dequeue_job → worker_* RPCs → worker_update_bulk_job
// with the same progress/checkpoint writes). Only the transport differs
// (direct pg connection instead of supabase-js over PostgREST); the queue,
// locking, permission and checkpoint semantics exercised are the real ones.
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, rmSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = resolve(__dirname, '..', '..');
export const HARNESS_DIR = join(REPO_ROOT, 'scripts', 'security', 'local-test-harness');
export const SCHEMA_DIR = join(REPO_ROOT, 'supabase', 'schema');
export const DB_PORT = 54329;
export const DB_NAME = 'eduzone_rls_test';
export const PG_URL = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/${DB_NAME}`;

const harnessRequire = createRequire(join(HARNESS_DIR, 'package.json'));

/** pg Client/Pool from the harness's own node_modules (single dependency home). */
export function loadPg() {
  return harnessRequire('pg');
}

/** Extensions the embedded distribution cannot provide (skipped on purpose). */
const UNSUPPORTED_EXTENSIONS = ['pg_cron', 'pg_net'];

function applyExtensionSkip(sql) {
  for (const ext of UNSUPPORTED_EXTENSIONS) {
    const re = new RegExp(`^CREATE EXTENSION IF NOT EXISTS ${ext}[^;]*;$`, 'gim');
    sql = sql.replace(re, `-- skipped in harness (not available in embedded-postgres): ${ext}`);
  }
  return sql;
}

/** Apply one SQL file as a single multi-statement query (no parameters). */
async function applySqlFile(client, filePath, { optional = false } = {}) {
  const sql = applyExtensionSkip(readFileSync(filePath, 'utf8'));
  const label = filePath.split(/[\\/]/).pop();
  try {
    await client.query(sql);
    appendFileSync(join(REPO_ROOT, 'scripts', 'perf', 'apply-debug.log'), `OK   ${label}\n`);
    console.log(`   OK ${label}`);
    return true;
  } catch (err) {
    const first = err.message.split('\n')[0];
    appendFileSync(join(REPO_ROOT, 'scripts', 'perf', 'apply-debug.log'), `FAIL ${label}: ${first}\n`);
    // A failed multi-statement simple query aborts the connection's implicit
    // transaction; reset it so later queries (and optional-file skips) work.
    try {
      await client.query('ROLLBACK');
    } catch {
      // connection-level reset best effort
    }
    if (optional) {
      console.warn(`   SKIP (optional) ${label}: ${first}`);
      return false;
    }
    err.message = `${filePath}: ${first}`;
    throw err;
  }
}

// Canonical apply order — mirrors supabase/config.toml schema_paths exactly.
// NOTE: 07_functions.sql is deliberately applied BEFORE 06_views.sql (the
// views reference functions like is_admin_with_session_validation()), so a
// naive numeric sort is wrong. This MUST stay an array: an object keyed by
// '10'/'11' would reorder those integer-like keys ahead of '01'-'09' (V8
// integer-key ordering) and apply 10_permissions.sql before the tables.
const SCHEMA_APPLY_ORDER = [
  '01_extensions.sql',
  '02_types.sql',
  '03_tables.sql',
  '04_constraints.sql',
  '05_indexes.sql',
  '07_functions.sql',
  '06_views.sql',
  '08_triggers.sql',
  '09_rls.sql',
  '10_permissions.sql',
  '11_seed_reference.sql',
];

/**
 * Boot the embedded cluster, create the test DB and apply the canonical
 * schema (00/01 harness helpers first, then supabase/schema 01..11).
 * Returns { stop } — call stop() when done.
 */
export async function startDatabaseWithSchema() {
  const EmbeddedPostgres = harnessRequire('embedded-postgres').default;
  const { Client } = loadPg();

  // Keep the throwaway cluster OUT of the repo tree: the OS temp dir is not
  // watched by VS Code / indexed by search tools, whose transient file
  // handles caused EPERM on Windows when wiping the previous run's data dir.
  const dataDir = join(tmpdir(), 'eduzone-pgdata-perf');

  // A previous crashed run can orphan its postgres.exe, which keeps both the
  // port and the data dir locked (EPERM on Windows). Kill ONLY the process
  // bound to our harness port — never a user's unrelated postgres.
  if (process.platform === 'win32') {
    try {
      const out = execSync('netstat -ano | findstr :54329', { shell: 'cmd.exe' }).toString();
      const pids = new Set(
        out
          .split('\n')
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => /^\d+$/.test(pid)),
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { shell: 'cmd.exe' });
          console.log(`   killed orphaned postgres pid ${pid} on :54329`);
        } catch {
          // already gone
        }
      }
      if (pids.size > 0) await new Promise((r) => setTimeout(r, 2000));
    } catch {
      // nothing listening on the harness port
    }
  }

  // Windows: a lingering postgres.exe from a previous crashed run can hold
  // file handles for a few seconds — retry the wipe instead of failing.
  for (let attempt = 1; ; attempt++) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch (err) {
      if (attempt >= 10) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: DB_PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();

  // The Windows cluster defaults to WIN1252 (locale-dependent), but the
  // canonical schema files contain UTF-8 Arabic comments — create the test
  // database with an explicit UTF8 encoding instead of pg.createDatabase().
  const bootstrap = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
  });
  await bootstrap.connect();
  await bootstrap.query(
    `CREATE DATABASE ${DB_NAME} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
  );
  await bootstrap.end();

  const admin = new Client({ connectionString: PG_URL });
  // Postgres server death (or stop()) mid-run must surface as a catchable
  // error, not an unhandled 'error' event that kills the process and masks
  // the real test failure.
  admin.on('error', (e) => console.error(`[pg admin] ${e.message}`));
  await admin.connect();

  // Disposable perf cluster: disable durability to (a) speed the load runs
  // up and (b) sidestep a Windows embedded-postgres flake where the
  // checkpointer exits with code 1 under heavy write bursts (observed
  // mid-run on this machine; no SQL error precedes it — classic
  // antivirus/fsync interference on throwaway clusters). Standard practice
  // for throwaway test databases per the Postgres docs.
  await admin.query(`ALTER SYSTEM SET fsync = off`);
  await admin.query(`ALTER SYSTEM SET synchronous_commit = off`);
  await admin.query(`ALTER SYSTEM SET full_page_writes = off`);
  await admin.query(`SELECT pg_reload_conf()`);

  // Pre-create the Supabase roles 00_stub_auth.sql grants to. In the stub
  // file the GRANT lines precede the role-creation DO block, which only
  // works with psql's tolerant per-statement execution — a single
  // multi-statement query would fail on the first GRANT. Creating them here
  // makes the stub idempotent under any execution mode.
  console.log('→ pre-creating Supabase roles…');
  await admin.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
        CREATE ROLE dashboard_user NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOLOGIN SUPERUSER;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_privileged_role') THEN
        CREATE ROLE supabase_privileged_role NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres NOLOGIN SUPERUSER;
      END IF;
    END
    $$;
  `);

  console.log('→ applying harness auth/session stubs…');
  await applySqlFile(admin, join(HARNESS_DIR, '00_stub_auth.sql'));
  await applySqlFile(admin, join(HARNESS_DIR, '01_test_session_helpers.sql'));

  console.log('→ applying canonical supabase/schema/*.sql (the REAL functions)…');
  const debugLog = join(REPO_ROOT, 'scripts', 'perf', 'apply-debug.log');
  writeFileSync(
    debugLog,
    `=== apply run ${new Date().toISOString()} ===\n` +
      `order: ${SCHEMA_APPLY_ORDER.join(' | ')}\n`,
  );
  for (const name of SCHEMA_APPLY_ORDER) {
    const exists = existsSync(join(SCHEMA_DIR, name));
    appendFileSync(debugLog, `iter ${name} exists=${exists}\n`);
    if (!exists) {
      console.log(`   MISSING ${name} (existsSync=false)`);
      continue;
    }
    await applySqlFile(admin, join(SCHEMA_DIR, name), {
      optional: name === '11_seed_reference.sql',
    });
  }
  // Pre-flight check right before the test scenarios run: the entitlements
  // table is the earliest canary that the canonical order held.
  const probe = await admin.query(
    `SELECT to_regclass('public.offline_download_entitlements') AS entitlements,
            to_regclass('public.users') AS users,
            to_regclass('internal.job_queue') AS job_queue,
            to_regprocedure('public.get_tenants_usage(uuid[])') AS tenants_usage,
            to_regprocedure('public.release_stale_job_locks()') AS release_locks,
            to_regprocedure('public.worker_update_bulk_job(uuid,text,text,timestamptz,boolean,jsonb,boolean)') AS worker_update`,
  );
  const row = probe.rows[0];
  appendFileSync(debugLog, `pre-flight: ${JSON.stringify(row)}\n`);
  const missing = Object.entries(row).filter(([, v]) => v === null);
  if (missing.length > 0) {
    throw new Error(`Schema pre-flight check failed, missing: ${missing.map(([k]) => k).join(', ')}`);
  }
  console.log('✓ schema ready (pre-flight: all core objects present)\n');
  await admin.end();

  async function stop() {
    try {
      await pg.stop();
    } catch {
      // already down
    }
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
        break;
      } catch {
        if (attempt >= 10) break;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }

  return { stop };
}

// ── Connection contexts ─────────────────────────────────────────────
/**
 * A test "connection context": one dedicated pg client impersonating a role
 * via the same GUCs PostgREST sets from a verified JWT (00_stub_auth.sql's
 * auth.* functions read exactly these).
 */
export async function createContext(connectionString = PG_URL) {
  const { Client } = loadPg();
  const client = new Client({ connectionString });
  // Same rationale as the admin client: a dead server must not crash the
  // runner before the real failure is reported.
  client.on('error', (e) => console.error(`[pg ctx] ${e.message}`));
  await client.connect();

  async function setServiceRole() {
    // Only set the JWT-claim GUC (what auth.role() reads). Deliberately NOT
    // `set_config('role', ...)` — SET ROLE would downgrade this superuser
    // connection to service_role's actual (non-superuser) table privileges,
    // which is NOT how the Edge Function works: PostgREST/Supabase-JS keeps
    // the connection role and presents the service_role *claim* for the
    // in-function guards.
    await client.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
  }

  async function resetRole() {
    await client.query(
      "SELECT set_config('request.jwt.claim.role', '', false), set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)",
    );
  }

  async function query(text, params) {
    return client.query(text, params);
  }

  async function end() {
    await client.end();
  }

  return { client, query, setServiceRole, resetRole, end };
}

// ── Seeding helpers ─────────────────────────────────────────────────
const UUID_ROOT = 'a1000000-0000-4000-8000-';

export function tenantId(n) {
  return `${UUID_ROOT}${String(n).padStart(12, '0')}`;
}

export function userId(tenantN, userN) {
  return `a2${String(tenantN).padStart(2, '0')}0000-0000-4000-8000-${String(userN).padStart(12, '0')}`;
}

/**
 * Seeds one tenant (+ its admin user) and `userCount` regular student users
 * that all match the bulk filters used by the tests (primary_role='student').
 * The admin gets a user_permission_cache row for each requested permission so
 * the worker_* RPCs' server-side permission re-checks pass exactly as they
 * would for a real admin profile resolved through user_has_permission().
 */
export async function seedTenant(context, { tenantN, adminN = 1, userCount = 0, permissions = [] }) {
  const tId = tenantId(tenantN);
  const adminId = userId(tenantN, adminN);
  const emailDomain = `t${tenantN}.perf.local`;

  await context.query(
    `INSERT INTO public.tenants (id, name, slug, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [tId, `Perf Tenant ${tenantN}`, `perf-tenant-${tenantN}`],
  );

  await context.query(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
     VALUES ($1, $2, 'x', now(), now(), now(), 'authenticated', 'authenticated')
     ON CONFLICT (id) DO NOTHING`,
    [adminId, `admin-1@${emailDomain}`],
  );
  await context.query(
    `INSERT INTO public.users (id, tenant_id, email, email_hash, first_name, last_name, primary_role, account_status)
     VALUES ($1, $2, $3, encode(extensions.digest(lower(btrim($3)), 'sha256'), 'hex'), 'Admin', 'One', 'admin', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [adminId, tId, `admin-1@${emailDomain}`],
  );

  for (const permission of permissions) {
    await context.query(
      `INSERT INTO public.user_permission_cache (user_id, tenant_id, permission_name, expires_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id, tenant_id, permission_name) DO NOTHING`,
      [adminId, tId, permission],
    );
  }

  if (userCount > 0) {
    // Student ids are built textually (same shape as userId(tenantN, g + 1)
    // in JS) so the whole cohort seeds in two bulk statements. The +1 offset
    // skips slot 000000000001, which belongs to the tenant admin — otherwise
    // student #1 would collide with the admin id and be silently dropped by
    // ON CONFLICT DO NOTHING (leaving 29 rows for a 30-user seed).
    await context.query(
      `
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
      SELECT
        ('a2' || lpad($2::text, 2, '0') || '0000-0000-4000-8000-' || lpad((g + 1)::text, 12, '0'))::uuid,
        'user-' || g || '@${emailDomain}',
        'x', now(), now(), now(), 'authenticated', 'authenticated'
      FROM generate_series(1, $1) g
      ON CONFLICT (id) DO NOTHING`,
      [userCount, String(tenantN)],
    );
    await context.query(
      `
      INSERT INTO public.users (id, tenant_id, email, email_hash, first_name, last_name, primary_role, account_status)
      SELECT
        ('a2' || lpad($3::text, 2, '0') || '0000-0000-4000-8000-' || lpad((g + 1)::text, 12, '0'))::uuid,
        $2,
        'user-' || g || '@${emailDomain}',
        encode(extensions.digest(lower(btrim('user-' || g || '@${emailDomain}')), 'sha256'), 'hex'),
        'User', g::text, 'student', 'active'
      FROM generate_series(1, $1) g
      ON CONFLICT (id) DO NOTHING`,
      [userCount, tId, String(tenantN)],
    );
  }

  return { tenantId: tId, adminId };
}

// ── Worker simulation (bulk-worker's exact SQL sequence) ───────────
/**
 * Replays the bulk-worker's SQL call sequence for one dequeued job:
 * dequeue → re-count filters (PERF-04) → skip result.succeeded_ids
 * (PERF-02) → parallel processAction within batches → per-batch
 * worker_update_bulk_job with the result checkpoint → final done update.
 * `action` supports the two RPC-backed actions warn (worker_issue_warning —
 * F-02's action) and lock (worker_control_user_account).
 */
export function createWorkerSimulator(context, { batchSize = 50, onProgress } = {}) {
  return async function processOneJob({ crashAfterUsers = null } = {}) {
    await context.setServiceRole();

    const dequeued = await context.query(`SELECT * FROM public.dequeue_job($1, $2, $3)`, [
      'bulk-worker-perf',
      ['bulk_warn', 'bulk_lock', 'bulk_unlock', 'bulk_suspend', 'bulk_ban', 'bulk_terminate_sessions', 'bulk_reset_devices', 'bulk_delete', 'bulk_export'],
      1800,
    ]);
    if (dequeued.rows.length === 0) return null;
    const job = dequeued.rows[0];

    const payload = job.payload;

    // PERF-04: re-verify the real filter size right before processing —
    // same query shape the Edge Function runs (head count + limit 500).
    const countRes = await context.query(
      `SELECT count(*)::int AS n FROM public.users
       WHERE tenant_id = $1 AND deleted_at IS NULL AND primary_role = 'student'`,
      [job.tenant_id],
    );
    const totalMatching = countRes.rows[0].n;
    const truncated = totalMatching > 500;
    const remaining = truncated ? totalMatching - 500 : 0;

    const usersRes = await context.query(
      `SELECT id FROM public.users
       WHERE tenant_id = $1 AND deleted_at IS NULL AND primary_role = 'student'
       ORDER BY id
       LIMIT 500`,
      [job.tenant_id],
    );

    // PERF-02: resume from the result checkpoint on retries.
    const previous = job.result ?? {};
    const alreadySucceeded = new Set(
      Array.isArray(previous.succeeded_ids) ? previous.succeeded_ids : [],
    );
    const userIds = usersRes.rows.map((r) => r.id).filter((id) => !alreadySucceeded.has(id));

    const total = userIds.length;
    let processed = 0;
    const succeededIds = [...alreadySucceeded];
    const failedIds = [];
    const action = payload.action;
    const initiatorId = payload.initiator_id;
    const params = payload.params ?? {};

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);

      // PERF-07: parallel within the batch, isolated failures (allSettled).
      const settled = await Promise.allSettled(
        batch.map(async (uid) => {
          if (action === 'warn') {
            await context.query(`SELECT public.worker_issue_warning($1, $2, $3, $4)`, [
              initiatorId,
              uid,
              params.reason ?? 'Bulk warning',
              params.severity ?? 1,
            ]);
          } else if (action === 'lock') {
            await context.query(`SELECT public.worker_control_user_account($1, $2, $3, $4)`, [
              initiatorId,
              uid,
              'lock',
              params.reason ?? 'Bulk lock operation',
            ]);
          } else {
            throw new Error(`createWorkerSimulator: unsupported action ${action}`);
          }
        }),
      );

      settled.forEach((outcome, idx) => {
        processed++;
        if (outcome.status === 'fulfilled') succeededIds.push(batch[idx]);
        else failedIds.push(batch[idx]);
      });

      onProgress?.({ jobId: job.id, processed, total });

      // PERF-02: progress + checkpoint go to the dedicated `result`
      // column (error_message stays reserved for fatal errors), and
      // succeeded_ids lands incrementally so a crash between batches resumes
      // cleanly after release_stale_job_locks / retry.
      await context.query(
        `SELECT public.worker_update_bulk_job($1, NULL, NULL, NULL, false, $2, true)`,
        [
          job.id, // $1 = p_id uuid
          JSON.stringify({
            processed,
            total,
            succeeded: succeededIds.length,
            failed: failedIds.length,
            succeeded_ids: succeededIds,
            failed_ids: failedIds,
            in_progress: true,
            truncated,
            ...(truncated ? { remaining } : {}),
          }), // $2 = p_result jsonb
        ],
      );

      // Crash simulation: die right AFTER the checkpoint write for this
      // batch (the Edge-Function wall-clock scenario the plan models: the
      // worker died with its checkpoint on disk, mid-job). Nothing after
      // this point runs for this job in this attempt.
      if (crashAfterUsers !== null && processed >= crashAfterUsers) {
        return {
          job,
          crashed: true,
          processed,
          total,
          succeededIds,
          failedIds,
          truncated,
          remaining,
        };
      }
    }

    const result = {
      processed,
      succeeded: succeededIds.length,
      failed: failedIds.length,
      total,
      succeeded_ids: succeededIds,
      failed_ids: failedIds,
      truncated,
      ...(truncated ? { remaining } : {}),
    };

    await context.query(
      `SELECT public.worker_update_bulk_job($1, 'done', NULL, now(), true, $2, true)`,
      [job.id, JSON.stringify(result)], // $1 = p_id, $2 = p_result
    );

    return { job, crashed: false, processed, total, result, truncated, remaining };
  };
}

/** Enqueue one bulk job through the REAL admin_enqueue_bulk_job RPC. */
export async function enqueueJob(context, {
  jobType,
  tenantId: tId,
  initiatorId,
  filters = {},
  params = {},
  estimatedCount,
  nonce,
}) {
  await context.setServiceRole();
  const payload = {
    action: jobType.replace(/^bulk_/, ''),
    filters: { ...filters, tenant_id: tId },
    params,
    initiator_id: initiatorId,
    estimated_count: estimatedCount,
    // nonce keeps payloads unique under the uq_job_dedupe partial index
    // (job_type, payload_hash) WHERE status IN ('pending','processing').
    ...(nonce ? { nonce } : {}),
  };
  const res = await context.query(`SELECT public.admin_enqueue_bulk_job($1, $2, $3) AS job`, [
    jobType,
    JSON.stringify(payload),
    initiatorId,
  ]);
  return res.rows[0].job;
}

export function assert(condition, message, details) {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}${details ? `\n  details: ${JSON.stringify(details)}` : ''}`,
    );
  }
}

export function ms(start) {
  return Date.now() - start;
}



