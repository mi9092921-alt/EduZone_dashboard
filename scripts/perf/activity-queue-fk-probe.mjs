// Real functional probe for the flush_activity_logs 23503/409 fix
// (activity_logs_user_tenant_fkey poison). Reproduces the original incident
// end-to-end against the REAL canonical schema on the local-test-harness --
// raw Postgres, real RLS, real functions, no mocks:
//
//   1. A switched super_admin's *acting* tenant must never reach
//      activity_log_queue as an invalid (user_id, tenant_id) pair.
//      internal.log_activity_internal() must self-heal the override to the
//      actor's home tenant (stamping tenant_override_dropped).
//   2. A VALID service_role override must still be honored unchanged.
//   3. A missing/deleted actor must degrade to (NULL user_id, system tenant).
//   4. flush_activity_logs() must drain the queue with zero 23503 errors and
//      advance the hash chain — the exact call that used to fail 409.
import { randomUUID } from 'node:crypto';
import { startDatabaseWithSchema, createContext } from './bulk-test-utils.mjs';

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000001';

const results = [];
const record = (name, pass, details) => {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${details ? ' — ' + JSON.stringify(details) : ''}`);
};

const { stop } = await startDatabaseWithSchema();
const ctx = await createContext();       // unrestricted (seeding + service_role claim)
const persona = await createContext();   // authenticated persona via test.login_as()

try {
  // ── Seed: home tenant + other tenant + the system tenant (the seed file
  // cannot apply in this harness), one super_admin in the home tenant, and
  // the audit_chain_state singleton (same known harness limitation as
  // tenant-switcher-probe.mjs). ────────────────────────────────────────────
  const tenantHome = randomUUID();
  const tenantOther = randomUUID();
  const superAdmin = randomUUID();
  const missingUser = randomUUID();

  await ctx.query(
    `INSERT INTO public.tenants (id, name, slug, status)
     VALUES ($1,'FKQ Home','fkq-home','active'),
            ($2,'FKQ Other','fkq-other','active')
     ON CONFLICT (id) DO NOTHING`,
    [tenantHome, tenantOther],
  );
  await ctx.query(`INSERT INTO public.audit_chain_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await ctx.query(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
     VALUES ($1,'superadmin@fkq.local','x',now(),now(),now(),'authenticated','authenticated')`,
    [superAdmin],
  );
  await ctx.query(
    `INSERT INTO public.users (id, tenant_id, email, email_hash, first_name, last_name, primary_role, account_status)
     VALUES ($1,$2,'superadmin@fkq.local', encode(extensions.digest(lower(btrim('superadmin@fkq.local')),'sha256'),'hex'), 'S','A','super_admin','active')`,
    [superAdmin, tenantHome],
  );

  // PostgREST-style service_role: JWT claim only, connection role untouched.
  await ctx.setServiceRole();

  // ── 1. Invalid override (the original bug): actor home ≠ override tenant ──
  const idA = (await ctx.query(
    `SELECT public.log_activity_async($1,'fkq_case_a','{}',NULL,NULL,'low',$2) AS id`,
    [superAdmin, tenantOther],
  )).rows[0].id;
  const rowA = (await ctx.query(
    `SELECT tenant_id, user_id, details FROM public.activity_log_queue WHERE id = $1`,
    [idA],
  )).rows[0];
  record(
    'Invalid override self-heals to the actor\'s home tenant',
    rowA.tenant_id === tenantHome && rowA.user_id === superAdmin,
    rowA,
  );
  record(
    'tenant_override_dropped stamped in details for observability',
    rowA.details.tenant_override_dropped === tenantOther,
    rowA.details,
  );

  // ── 2. Valid override (override == actor's home tenant) must be honored ──
  const idB = (await ctx.query(
    `SELECT public.log_activity_async($1,'fkq_case_b','{}',NULL,NULL,'low',$2) AS id`,
    [superAdmin, tenantHome],
  )).rows[0].id;
  const rowB = (await ctx.query(
    `SELECT tenant_id, details FROM public.activity_log_queue WHERE id = $1`,
    [idB],
  )).rows[0];
  record(
    'Valid service_role override is still honored',
    rowB.tenant_id === tenantHome && rowB.details.tenant_override_dropped === undefined,
    rowB,
  );

  // ── 3. Missing/deleted actor, no override: degrade to (NULL, system) ─────
  const idC = (await ctx.query(
    `SELECT public.log_activity_async($1,'fkq_case_c','{}',NULL,NULL,'low',NULL) AS id`,
    [missingUser],
  )).rows[0].id;
  const rowC = (await ctx.query(
    `SELECT tenant_id, user_id, details FROM public.activity_log_queue WHERE id = $1`,
    [idC],
  )).rows[0];
  record(
    'Missing actor degrades to NULL user_id + system tenant',
    rowC.user_id === null && rowC.tenant_id === SYSTEM_TENANT,
    rowC,
  );
  record(
    'audit_actor_unresolved stamped in details',
    rowC.details.audit_actor_unresolved === missingUser,
    rowC.details,
  );

  // ── 4. The original incident, end-to-end: switch context, then emit the
  // exact audit payload SupabaseAuditLogger used to send (service_role +
  // acting-tenant override) ────────────────────────────────────────────────
  await persona.query(`SELECT test.login_as($1)`, [superAdmin]);
  const switched = await persona.query(`SELECT * FROM public.switch_tenant_context($1)`, [tenantOther]);
  record(
    'switch_tenant_context switches the super_admin to the other tenant',
    switched.rows[0].tenant_id === tenantOther,
    switched.rows[0],
  );

  const idD = (await ctx.query(
    `SELECT public.log_activity_async($1,'fkq_case_d','{}',NULL,NULL,'medium',$2) AS id`,
    [superAdmin, tenantOther],
  )).rows[0].id;
  const rowD = (await ctx.query(
    `SELECT tenant_id, user_id, details FROM public.activity_log_queue WHERE id = $1`,
    [idD],
  )).rows[0];
  record(
    'Audit-logger-style acting-tenant override healed (incident scenario)',
    rowD.tenant_id === tenantHome && rowD.details.tenant_override_dropped === tenantOther,
    rowD,
  );

  // ── 5. The exact flush call that used to fail with 23503 → 409 ──────────
  // The harness seed (11_seed_reference.sql) enqueues its own activity
  // events, so the expected count is whatever is unflushed right now — the
  // assertion is that the flush drains ALL of them without the composite-FK
  // abort that used to wedge the pipeline.
  const pending = (await ctx.query(
    `SELECT count(*)::int AS n FROM public.activity_log_queue WHERE flushed_at IS NULL`,
  )).rows[0].n;
  const flushed = (await ctx.query(`SELECT public.flush_activity_logs(1000) AS n`)).rows[0].n;
  record('flush_activity_logs drains the queue without 23503', Number(flushed) === pending, { flushed, pending });

  const remaining = (await ctx.query(
    `SELECT count(*)::int AS n FROM public.activity_log_queue WHERE flushed_at IS NULL`,
  )).rows[0].n;
  record('No unflushed rows remain', remaining === 0, { remaining });

  const chain = (await ctx.query(
    `SELECT last_seq, last_hash FROM public.audit_chain_state WHERE id = 1`,
  )).rows[0];
  record('Hash chain advanced by exactly the flushed count', Number(chain.last_seq) === Number(flushed), chain);

  const logs = (await ctx.query(
    `SELECT seq, user_id, tenant_id, entry_hash FROM public.activity_logs ORDER BY seq`,
  )).rows;
  record(
    'All flushed entries carry a 64-hex entry_hash',
    logs.length >= pending && logs.every((r) => /^[0-9a-f]{64}$/.test(r.entry_hash)),
    { count: logs.length },
  );
  const fkInvalid = (await ctx.query(
    `SELECT count(*)::int AS n FROM public.activity_logs l
     WHERE l.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.users u
         WHERE u.id = l.user_id AND u.tenant_id = l.tenant_id
       )`,
  )).rows[0].n;
  record(
    'Zero flushed entries violate the (user_id, tenant_id) membership pair',
    fkInvalid === 0,
    { fkInvalid },
  );
} catch (e) {
  record('probe crashed', false, { error: e.message });
} finally {
  await persona.end();
  await ctx.end();
  await stop();
}

if (results.some((r) => !r.pass)) {
  console.error('\n❌ FK-pair poison probe FAILED');
  process.exit(1);
}
console.log('\n✅ FK-pair poison probe PASSED (all checks green)');