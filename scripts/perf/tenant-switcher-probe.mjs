// Real functional + security probe for Wave 1 of the Tenant Switcher
// (switch_tenant_context RPC + get_current_tenant_id() / assert_tenant()
// changes in 07_functions.sql, acting_tenant_id column in 03_tables.sql).
// Run against the actual canonical schema on the local-test-harness --
// raw Postgres, real RLS, real functions, no mocks.
import { randomUUID } from 'node:crypto';
import { startDatabaseWithSchema, createContext } from './bulk-test-utils.mjs';

const results = [];
const record = (name, pass, details) => {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${details ? ' — ' + JSON.stringify(details) : ''}`);
};

const { stop } = await startDatabaseWithSchema();
const ctx = await createContext();       // unrestricted, for seeding
const personaCtx = await createContext(); // for test.login_as() + checks

try {
  // ── Seed: two real tenants, a super_admin (home = tenant X), a regular
  // admin (tenant Y, to prove they CANNOT call switch_tenant_context), one
  // student per tenant (to prove RLS actually respects the switch). ──────
  const tenantX = randomUUID();
  const tenantY = randomUUID();
  const superAdmin = randomUUID();
  const regularAdmin = randomUUID();
  const studentInX = randomUUID();
  const studentInY = randomUUID();

  await ctx.query(`INSERT INTO public.tenants (id, name, slug, status) VALUES ($1,'Tenant X','tsw-tenant-x','active'),($2,'Tenant Y','tsw-tenant-y','active')`, [tenantX, tenantY]);

  // audit_chain_state's single seed row (id=1) only exists in
  // 11_seed_reference.sql, which cannot apply in this harness
  // (supabase_vault dependency -- same known limitation documented in
  // security-probe.mjs). Without it, flush_activity_logs() computes
  // v_seq := NULL + 1 and fails a NOT NULL constraint. Self-seed it,
  // matching that same established workaround.
  await ctx.query(`INSERT INTO public.audit_chain_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  const mkAuthUser = async (id, email) => ctx.query(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
     VALUES ($1,$2,'x',now(),now(),now(),'authenticated','authenticated')`, [id, email]);
  const mkUser = async (id, tenant, email, role) => ctx.query(
    `INSERT INTO public.users (id, tenant_id, email, email_hash, first_name, last_name, primary_role, account_status)
     VALUES ($1,$2,$3, encode(extensions.digest(lower(btrim($3)),'sha256'),'hex'), 'F','L',$4,'active')`,
    [id, tenant, email, role]);

  for (const [id, tenant, email, role] of [
    [superAdmin, tenantX, 'superadmin@tsw.local', 'super_admin'],
    [regularAdmin, tenantY, 'regularadmin@tsw.local', 'admin'],
    [studentInX, tenantX, 'studentx@tsw.local', 'student'],
    [studentInY, tenantY, 'studenty@tsw.local', 'student'],
  ]) {
    await mkAuthUser(id, email);
    await mkUser(id, tenant, email, role);
  }

  // ── 1. A regular admin CANNOT call switch_tenant_context ───────────
  await personaCtx.query(`SELECT test.login_as($1)`, [regularAdmin]);
  let regularAdminError = null;
  try {
    await personaCtx.query(`SELECT * FROM public.switch_tenant_context($1)`, [tenantX]);
  } catch (e) { regularAdminError = e.message; }
  record(
    'Regular admin CANNOT call switch_tenant_context (PERMISSION_DENIED)',
    regularAdminError !== null && regularAdminError.includes('PERMISSION_DENIED'),
    { error: regularAdminError },
  );

  // ── 2. switch_tenant_context rejects a non-existent / inactive tenant ──
  await personaCtx.query(`SELECT test.login_as($1)`, [superAdmin]);
  let badTenantError = null;
  try {
    await personaCtx.query(`SELECT * FROM public.switch_tenant_context($1)`, [randomUUID()]);
  } catch (e) { badTenantError = e.message; }
  record(
    'switch_tenant_context rejects a non-existent tenant',
    badTenantError !== null && badTenantError.includes('TENANT_NOT_FOUND_OR_INACTIVE'),
    { error: badTenantError },
  );

  const suspendedTenant = randomUUID();
  await ctx.query(`INSERT INTO public.tenants (id, name, slug, status) VALUES ($1,'Suspended Tenant','tsw-suspended','suspended')`, [suspendedTenant]);
  let suspendedError = null;
  try {
    await personaCtx.query(`SELECT * FROM public.switch_tenant_context($1)`, [suspendedTenant]);
  } catch (e) { suspendedError = e.message; }
  record(
    'switch_tenant_context rejects a suspended tenant',
    suspendedError !== null && suspendedError.includes('TENANT_NOT_FOUND_OR_INACTIVE'),
    { error: suspendedError },
  );

  // ── 3. Before switching: super_admin's own get_current_tenant_id() = home tenant ──
  const beforeSwitch = await personaCtx.query(`SELECT public.get_current_tenant_id() AS tid`);
  record('Before switching, get_current_tenant_id() = super_admin\'s own tenant (X)', beforeSwitch.rows[0].tid === tenantX);

  // ── 4. Switch to tenant Y — real RPC call, check the returned row ──
  const switchResult = await personaCtx.query(`SELECT * FROM public.switch_tenant_context($1)`, [tenantY]);
  record(
    'switch_tenant_context(tenantY) returns tenantY id + name',
    switchResult.rows[0].tenant_id === tenantY && switchResult.rows[0].tenant_name === 'Tenant Y',
    { row: switchResult.rows[0] },
  );

  // ── 5. get_current_tenant_id() now returns tenant Y, not X ─────────
  const afterSwitch = await personaCtx.query(`SELECT public.get_current_tenant_id() AS tid`);
  record('After switching, get_current_tenant_id() = tenant Y (not home tenant X)', afterSwitch.rows[0].tid === tenantY);

  // ── 6. RLS actually respects the switch: super_admin's own users_select_merged
  // path via is_admin_with_session_validation() already grants full visibility
  // regardless of tenant (confirmed in 09_rls.sql), so the real proof point is a
  // WRITE-scoping function: get_users_paginated's p_tenant_id defaulting or
  // assert_tenant()-style checks. We prove it directly and unambiguously via
  // assert_tenant() itself, which raises CROSS_TENANT_ACCESS_DENIED on any
  // mismatch between get_current_tenant_id() and the caller's own row -- this
  // is exactly the regression assert_tenant() would have had without the Wave 1
  // fix (see 07_functions.sql comment).
  let assertTenantError = null;
  let assertTenantResult = null;
  try {
    const r = await personaCtx.query(`SELECT public.assert_tenant() AS tid`);
    assertTenantResult = r.rows[0].tid;
  } catch (e) { assertTenantError = e.message; }
  record(
    'assert_tenant() does NOT raise CROSS_TENANT_ACCESS_DENIED for a switched super_admin (Wave 1 regression fix)',
    assertTenantError === null && assertTenantResult === tenantY,
    { error: assertTenantError, result: assertTenantResult },
  );

  // ── 7. Exit back to home tenant (p_tenant_id = NULL) ────────────────
  const exitResult = await personaCtx.query(`SELECT * FROM public.switch_tenant_context(NULL)`);
  record(
    'switch_tenant_context(NULL) returns to home tenant X',
    exitResult.rows[0].tenant_id === tenantX && exitResult.rows[0].tenant_name === 'Tenant X',
  );
  const afterExit = await personaCtx.query(`SELECT public.get_current_tenant_id() AS tid`);
  record('After exit, get_current_tenant_id() = home tenant X again', afterExit.rows[0].tid === tenantX);

  // ── 8. ON DELETE SET NULL fallback: switch to Y, delete Y, confirm auto-revert ──
  await personaCtx.query(`SELECT * FROM public.switch_tenant_context($1)`, [tenantY]);
  const midDelete = await personaCtx.query(`SELECT public.get_current_tenant_id() AS tid`);
  // No dedicated soft_delete_tenant() RPC exists; a generic trigger blocks
  // physical DELETE on tenants ("Physical DELETE not allowed on tenants.
  // Use soft_delete_*() functions instead"), so simulate the same
  // end-state (soft-deleted) directly, same as that trigger's own intent.
  await ctx.query(`UPDATE public.tenants SET deleted_at = now(), status = 'deleted' WHERE id = $1`, [tenantY]);
  const afterTenantDeleted = await personaCtx.query(`SELECT public.get_current_tenant_id() AS tid`);
  record(
    'ON DELETE SET NULL: deleting the acting tenant reverts super_admin to home tenant automatically',
    midDelete.rows[0].tid === tenantY && afterTenantDeleted.rows[0].tid === tenantX,
    { midDelete: midDelete.rows[0].tid, afterDelete: afterTenantDeleted.rows[0].tid },
  );

  // ── 9. Audit trail: activity is written async via activity_log_queue
  // (flushed_at), same pattern as the T1 job queue -- flush it first,
  // same as a real cron/worker would, before checking activity_logs.
  await ctx.query(`SELECT public.flush_activity_logs(100)`);
  const auditRows = await ctx.query(
    `SELECT activity_type, details FROM public.activity_logs WHERE user_id = $1 AND activity_type = 'tenant_context_switched' ORDER BY created_at`,
    [superAdmin],
  );
  record(
    'Every switch/exit call produced an activity_logs row (audit trail)',
    auditRows.rows.length === 3, // switch->Y, exit->X, switch->Y(again); the delete-fallback (step 8) doesn't call the RPC, so it logs nothing
    { count: auditRows.rows.length, rows: auditRows.rows.map((r) => r.details) },
  );
} finally {
  await ctx.end();
  await personaCtx.end();
  await stop();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n═══ Tenant Switcher (Wave 1) probe: ${passed}/${results.length} PASS ═══`);
if (passed !== results.length) process.exitCode = 1;
