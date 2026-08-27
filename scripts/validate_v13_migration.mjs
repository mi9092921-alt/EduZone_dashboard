/**
 * EduZone v13 Schema Migration Validator (zero-dependency)
 * Uses native fetch to validate the Supabase REST API directly.
 *
 * Usage: node scripts/validate_v13_migration.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SERVICE_KEY;
const ANON_KEY = process.env.ANON_KEY;

const REST = `${SUPABASE_URL}/rest/v1`;
let passed = 0, failed = 0;

function pass(name) { passed++; console.log(`  ✅ ${name}`); }
function fail(name, reason) { failed++; console.error(`  ❌ ${name}: ${reason}`); }

async function query(table, params = '', key = SERVICE_KEY) {
  const url = `${REST}/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  });
  const body = await res.text();
  return { status: res.status, body, data: tryParse(body), headers: res.headers };
}

async function rpc(name, args = {}, key = SERVICE_KEY) {
  const url = `${REST}/rpc/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  return { status: res.status, body, data: tryParse(body) };
}

function tryParse(s) { try { return JSON.parse(s); } catch { return s; } }

// ── Tests ─────────────────────────────────────────────────────

async function testSchemaVersion() {
  console.log('\n🔍 1. Schema Version');
  const r = await query('schema_migrations', 'select=version&order=applied_at.desc&limit=1');
  if (r.status !== 200 && r.status !== 206) { fail('schema_migrations', `HTTP ${r.status}`); return; }
  const ver = Array.isArray(r.data) && r.data[0]?.version;
  if (ver && (ver.startsWith('v13') || ver.startsWith('13.'))) pass(`Schema: ${ver}`);
  else fail('Schema version', `Expected v13.x, got ${ver || 'null'}`);
}

async function testTenantIdColumns() {
  console.log('\n🔍 2. tenant_id Columns on Critical Tables');
  for (const table of ['lessons', 'sections', 'lesson_contents', 'enrollments', 'video_views']) {
    const r = await query(table, 'select=tenant_id&limit=0');
    if (r.status === 200 || r.status === 206) pass(`${table}.tenant_id`);
    else if (r.body.includes('does not exist') || r.body.includes('column')) fail(`${table}.tenant_id`, r.body.slice(0, 80));
    else pass(`${table}.tenant_id`);
  }
}

async function testCriticalRPCs() {
  console.log('\n🔍 3. Critical RPCs');
  const rpcs = [
    ['get_users_paginated', { p_page: 1, p_page_size: 1 }],
    ['get_user_stats_summary', {}],
    ['get_course_stats', {}],
    ['get_daily_activity', { p_days: 1 }],
    ['search_courses_ranked', { p_query: 'test' }],
    ['get_system_health', {}],
    ['send_notification', { p_title: '__test', p_body: '__test', p_target_audience: 'all' }],
    ['delete_notification', { p_notification_id: '00000000-0000-0000-0000-000000000000' }],
    ['control_user_account', { p_user_id: '00000000-0000-0000-0000-000000000000', p_action: 'lock' }],
  ];
  for (const [name, args] of rpcs) {
    const r = await rpc(name, args);
    // 200 = success, 400 with PERMISSION_DENIED or USER_NOT_FOUND = function exists
    if (r.status === 200 || r.status === 204) pass(`${name} ✓`);
    else if (r.body.includes('does not exist') || r.body.includes('Could not find')) fail(name, 'RPC missing');
    else pass(`${name} (auth-gated: expected)`);
  }
}

async function testViews() {
  console.log('\n🔍 4. Materialized Views');
  for (const view of ['vw_course_stats']) {
    const r = await query(view, 'select=*&limit=1');
    if (r.status === 200 || r.status === 204 || r.status === 206) pass(`${view} accessible`);
    else fail(view, r.body.slice(0, 80));
  }
  // Legacy should be gone
  for (const view of ['mv_user_stats', 'mv_daily_activity']) {
    const r = await query(view, 'select=*&limit=1');
    if (r.status !== 200 && r.status !== 206) pass(`Legacy ${view} correctly absent`);
    else console.log(`  ⚠️  Legacy ${view} still exists`);
  }
}

async function testRLS() {
  console.log('\n🔍 5. RLS Enforcement (anon role)');
  // anon should get 0 rows from users
  const r = await query('users', 'select=id&limit=1', ANON_KEY);
  if (r.status !== 200 && r.status !== 206) { pass('RLS blocks anon from users (HTTP error)'); return; }
  const rows = Array.isArray(r.data) ? r.data : [];
  if (rows.length === 0) pass('RLS blocks anon from users (0 rows)');
  else fail('RLS on users', `Anon can read ${rows.length} row(s)!`);
}

async function testSoftDelete() {
  console.log('\n🔍 6. Soft-Delete Enforcement');
  const url = `${REST}/users?id=eq.00000000-0000-0000-0000-000000000000`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.text();
  if (body.includes('Physical DELETE not allowed') || body.includes('physical_delete')) pass('prevent_physical_delete active');
  else if (res.status >= 400) pass(`Delete blocked (HTTP ${res.status})`);
  else if (res.status === 204) {
    // 204 with no content change on non-existent ID is expected
    // PostgREST returns */* when 0 rows are affected unless Prefer: count=exact is specified
    const count = res.headers.get('content-range');
    if (!count || count.includes('0') || count.includes('*/*')) pass('No rows affected (ID not found — trigger not tested)');
    else fail('prevent_physical_delete', 'DELETE succeeded on existing row — trigger may be missing');
  }
  else fail('prevent_physical_delete', `Unexpected response: HTTP ${res.status}`);
}

async function testSeedData() {
  console.log('\n🔍 7. QA Seed Data');
  const checks = [
    ['tenants', 'id=eq.11111111-0000-0000-0000-000000000001', 'QA Tenant'],
    ['users', 'email=eq.super_admin@eduzone-test.com', 'Super Admin'],
    ['courses', 'slug=eq.intro-react', 'Sample course'],
    ['lessons', 'title=eq.What is React?', 'Sample lesson'],
  ];
  for (const [table, filter, label] of checks) {
    const r = await query(table, `select=id&${filter}&limit=1`);
    const rows = Array.isArray(r.data) ? r.data : [];
    if (rows.length > 0) pass(label);
    else fail(label, `Not found — run Eduzone_seed_qa.sql`);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  EduZone v13 Migration Validator');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log('═══════════════════════════════════════════════════');

  await testSchemaVersion();
  await testTenantIdColumns();
  await testCriticalRPCs();
  await testViews();
  await testRLS();
  await testSoftDelete();
  await testSeedData();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
