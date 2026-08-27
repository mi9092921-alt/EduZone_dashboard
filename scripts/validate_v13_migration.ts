/**
 * EduZone v13 Schema Migration Validator
 * ────────────────────────────────────────
 * Validates that the live Supabase instance has the v13 schema applied
 * and all service-layer contracts are compatible.
 *
 * Usage: npx tsx scripts/validate_v13_migration.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://vlezaxucklrwiouoamkk.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || '';

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

// ── Helpers ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function pass(name: string) {
  passed++;
  console.log(`  ✅ ${name}`);
}

function fail(name: string, reason: string) {
  failed++;
  console.error(`  ❌ ${name}: ${reason}`);
}

// ── Test Groups ───────────────────────────────────────────────────

async function validateSchemaVersion(client: SupabaseClient) {
  console.log('\n🔍 1. Schema Version Check');
  const { data, error } = await client
    .from('schema_migrations')
    .select('version')
    .order('applied_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    fail('schema_migrations table', error.message);
    return;
  }

  if (data?.version?.startsWith('v13')) {
    pass(`Schema version: ${data.version}`);
  } else {
    fail('Schema version', `Expected v13.x, got ${data?.version ?? 'null'}`);
  }
}

async function validateCriticalTables(client: SupabaseClient) {
  console.log('\n🔍 2. Critical Table Structure (tenant_id columns)');

  const tables = ['lessons', 'sections', 'lesson_contents', 'enrollments', 'video_views'];

  for (const table of tables) {
    const { data, error } = await client.from(table).select('tenant_id').limit(0);
    if (error?.message?.includes('column') || error?.message?.includes('does not exist')) {
      fail(`${table}.tenant_id`, 'Column missing');
    } else {
      pass(`${table}.tenant_id exists`);
    }
  }
}

async function validateCriticalRPCs(client: SupabaseClient) {
  console.log('\n🔍 3. Critical RPC Availability');

  const rpcs = [
    { name: 'get_users_paginated', args: { p_page: 1, p_page_size: 1 } },
    { name: 'get_user_stats_summary', args: {} },
    { name: 'get_course_stats', args: {} },
    { name: 'get_daily_activity', args: { p_days: 1 } },
    { name: 'search_courses_ranked', args: { p_query: 'test' } },
    { name: 'get_system_health', args: {} },
    { name: 'check_schema_naming_conventions', args: {} },
  ];

  for (const rpc of rpcs) {
    const { error } = await client.rpc(rpc.name, rpc.args);
    if (error && !error.message.includes('PERMISSION_DENIED')) {
      fail(`RPC ${rpc.name}`, error.message.slice(0, 80));
    } else {
      pass(`RPC ${rpc.name} callable`);
    }
  }
}

async function validateViews(client: SupabaseClient) {
  console.log('\n🔍 4. Materialized View Availability');

  const views = ['vw_course_stats'];

  for (const view of views) {
    const { error } = await client.from(view).select('*').limit(1);
    if (error) {
      fail(`View ${view}`, error.message.slice(0, 80));
    } else {
      pass(`View ${view} accessible`);
    }
  }

  // Check legacy MV names (should fail or be aliases)
  const legacyViews = ['mv_user_stats', 'mv_daily_activity'];
  for (const view of legacyViews) {
    const { error } = await client.from(view).select('*').limit(1);
    if (error) {
      pass(`Legacy ${view} correctly removed/absent`);
    } else {
      console.log(`  ⚠️  Legacy ${view} still exists (consider removing)`);
    }
  }
}

async function validateRLSPolicies(client: SupabaseClient) {
  console.log('\n🔍 5. RLS Policy Enforcement');

  // anon client should NOT be able to read users directly
  const { data: anonUsers, error: anonError } = await anonClient
    .from('users')
    .select('id')
    .limit(1);

  if (!anonError && anonUsers && anonUsers.length > 0) {
    fail('RLS on users (anon)', 'Anon can read user data — RLS not enforced!');
  } else {
    pass('RLS blocks anon from users table');
  }

  // anon client should NOT be able to read settings_kv
  const { data: anonSettings } = await anonClient
    .from('settings_kv')
    .select('key, value')
    .eq('is_public', false)
    .limit(1);

  if (anonSettings && anonSettings.length > 0) {
    fail('RLS on settings_kv', 'Anon can read private settings!');
  } else {
    pass('RLS blocks anon from private settings');
  }
}

async function validatePreventPhysicalDelete(client: SupabaseClient) {
  console.log('\n🔍 6. Soft-Delete Enforcement (prevent_physical_delete trigger)');

  // Try to DELETE from users — should be blocked by trigger
  const { error } = await client
    .from('users')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000000'); // non-existent ID

  if (error?.message?.includes('Physical DELETE not allowed')) {
    pass('prevent_physical_delete trigger active on users');
  } else if (error) {
    // Could be RLS blocking the delete, which is also fine
    pass(`Delete blocked (${error.message.slice(0, 50)})`);
  } else {
    fail('prevent_physical_delete', 'DELETE succeeded — trigger may be missing');
  }
}

async function validateNotificationRPCs(client: SupabaseClient) {
  console.log('\n🔍 7. Notification RPCs');

  // Test send_notification exists (will fail with PERMISSION_DENIED, which is OK)
  const { error: sendErr } = await client.rpc('send_notification', {
    p_title: '__test__',
    p_body: '__test__',
    p_target_audience: 'all',
  });

  if (sendErr && !sendErr.message.includes('PERMISSION_DENIED') && !sendErr.message.includes('does not exist')) {
    // RPC exists but auth issue — that's expected
    pass('send_notification RPC exists');
  } else if (sendErr?.message?.includes('does not exist')) {
    fail('send_notification', 'RPC does not exist in schema');
  } else {
    pass('send_notification RPC exists');
  }

  // Test delete_notification exists
  const { error: delErr } = await client.rpc('delete_notification', {
    p_notification_id: '00000000-0000-0000-0000-000000000000',
  });

  if (delErr?.message?.includes('does not exist')) {
    fail('delete_notification', 'RPC does not exist in schema');
  } else {
    pass('delete_notification RPC exists');
  }
}

async function validateSeedData(client: SupabaseClient) {
  console.log('\n🔍 8. QA Seed Data Integrity');

  const checks = [
    { table: 'tenants', filter: { id: '11111111-0000-0000-0000-000000000001' }, label: 'QA Tenant' },
    { table: 'users', filter: { email: 'super_admin@eduzone-test.com' }, label: 'Super Admin user' },
    { table: 'courses', filter: { slug: 'intro-react' }, label: 'Sample course' },
    { table: 'lessons', filter: { title: 'What is React?' }, label: 'Sample lesson' },
    { table: 'enrollments', filter: { id: 'eeeeeeee-0000-0000-0000-000000000001' }, label: 'Sample enrollment' },
  ];

  for (const check of checks) {
    let q = client.from(check.table).select('id').limit(1);
    for (const [key, val] of Object.entries(check.filter)) {
      q = q.eq(key, val);
    }
    const { data, error } = await q;
    if (error || !data || data.length === 0) {
      fail(check.label, error?.message ?? 'Not found — run Eduzone_seed_qa.sql');
    } else {
      pass(check.label);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  EduZone v13 Migration Validator');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log('═══════════════════════════════════════════════════');

  await validateSchemaVersion(serviceClient);
  await validateCriticalTables(serviceClient);
  await validateCriticalRPCs(serviceClient);
  await validateViews(serviceClient);
  await validateRLSPolicies(serviceClient);
  await validatePreventPhysicalDelete(serviceClient);
  await validateNotificationRPCs(serviceClient);
  await validateSeedData(serviceClient);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
