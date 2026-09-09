import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Minimal .env.test loader (zero dependencies — dotenv is not installed in
// this repo and the script must run with plain node + @supabase/supabase-js).
function loadEnvTest() {
  const p = resolve(process.cwd(), '.env.test');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

// Load .env.test specifically so we point to the disposable test backend
// (local Supabase started by e2e.yml, or a dedicated Cloud test project).
// Required: SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY,
//           TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD  (Tenant A teacher)
// Optional: TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD      (Tenant A admin, holds
//           courses.manage — required for the one positive-path RPC case.
//           Without it that case is reported UNVERIFIED, everything else runs.)
loadEnvTest();

const supabaseUrl = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const teacherEmail = process.env.TEST_TEACHER_EMAIL;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !teacherEmail || !teacherPassword) {
  console.error('Missing required .env.test variables to run RLS Smoke Tests');
  console.error('(need SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD)');
  process.exit(1);
}

// ── Canonical QA seed identities (supabase/schema/11_seed_reference.sql) ──
// Overridable via env for non-seed backends.
const TENANT_A = process.env.TEST_TENANT_A_ID ?? '11111111-0000-0000-0000-000000000001';
const TENANT_B = process.env.TEST_TENANT_B_ID ?? '11111111-1111-1111-1111-111111111111';
const STUDENT_A = process.env.TEST_STUDENT_A_ID ?? 'aaaaaaaa-0000-0000-0000-000000000004'; // Omar (Tenant A)
const STUDENT_B = process.env.TEST_STUDENT_B_ID ?? 'bbbbbbbb-2222-2222-2222-222222222222'; // Test student (Tenant B)
const COURSE_A = process.env.TEST_COURSE_A_ID ?? 'cccccccc-0000-0000-0000-000000000001'; // Intro React (Tenant A)
const COURSE_B = process.env.TEST_COURSE_B_ID ?? '33333333-3333-3333-3333-333333333333'; // Test course (Tenant B)
const COMPLETED_COURSE_A = 'cccccccc-0000-0000-0000-000000000005'; // Omar/AWS = completed
const GUESSED_UUID = '99999999-9999-9999-9999-999999999999';

let failures = 0;

function ok(msg: string) {
  console.log(`✅ ${msg}`);
}

function breach(msg: string) {
  failures++;
  process.exitCode = 1;
  console.error(`❌ BREACH/FAIL: ${msg}`);
}

async function signIn(url: string, key: string, email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, key);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return c;
}

// ── Existing baseline tests (kept verbatim in behavior) ──

async function testTeacherCannotReadUsers(client: SupabaseClient) {
  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) throw new Error('Could not get user data');

  const { data, error } = await client
    .from('users')
    .select('id, tenant_id')
    .neq('id', userData.user.id);

  if (error) {
    console.error('Error reading users:', error);
  }

  // Teacher visibility into users is same-tenant-scoped BY DESIGN
  // (users_select_merged: own row + admin + students in teacher's active
  // courses). The invariant is: zero rows outside the teacher's tenant.
  const foreign = (data ?? []).filter(
    (r: { tenant_id: string }) => r.tenant_id !== TENANT_A,
  );
  if (foreign.length !== 0) {
    breach(`Teacher can see ${foreign.length} cross-tenant users!`);
  } else {
    ok(`RLS OK: Teacher sees ${(data ?? []).length} same-tenant users, 0 cross-tenant`);
  }
}

async function testTeacherCannotReadSettings(client: SupabaseClient) {
  const { data, error } = await client
    .from('settings_kv')
    .select('key, value')
    .eq('is_public', false);

  if (error) {
    console.error('Error reading settings_kv:', error.message);
  }

  if (data?.length !== 0) {
    breach(`Teacher can see ${data?.length} private settings!`);
  } else {
    ok('RLS OK: Teacher sees 0 private settings');
  }
}

async function testTeacherCannotWriteSettings(client: SupabaseClient) {
  const { error } = await client
    .from('settings_kv')
    .update({ value: 'hacked' })
    .eq('key', 'app_locked');

  if (error === null) {
    breach('Teacher was able to update settings!');
  } else {
    ok('RLS OK: Teacher cannot write settings (error expected and received)');
  }
}

async function testTeacherCannotInsertUserRoles(client: SupabaseClient) {
  const { error } = await client
    .from('user_roles')
    .insert({ user_id: 'some_user_id', role_name: 'admin' });

  if (error === null) {
    breach('Teacher was able to insert into user_roles!');
  } else {
    ok('RLS OK: Teacher cannot insert cross-tenant user roles');
  }
}

// ── SEC-1: cross-tenant read isolation (Tenant A actor → Tenant B rows) ──

async function testCrossTenantRead(
  client: SupabaseClient,
  table: string,
  select: string,
  label: string,
) {
  const { data, error } = await client.from(table).select(select).eq('tenant_id', TENANT_B).limit(10);
  if (error) {
    // A denial error is also isolation (logged, not a breach).
    ok(`RLS OK: ${label} cross-tenant read denied (${error.message.slice(0, 80)})`);
    return;
  }
  if ((data?.length ?? 0) !== 0) {
    breach(`${label}: Tenant-A actor read ${data?.length} Tenant-B rows from ${table}!`);
  } else {
    ok(`RLS OK: ${label} sees 0 Tenant-B rows in ${table}`);
  }
}

async function testNoTenantBLeakInUnfilteredReads(client: SupabaseClient) {
  // Defense in depth: even without an explicit tenant filter, no Tenant-B
  // row may leak through to a Tenant-A teacher.
  for (const table of ['courses', 'enrollments', 'user_progress']) {
    const { data, error } = await client.from(table).select('id, tenant_id').limit(50);
    if (error) {
      ok(`RLS OK: unfiltered ${table} read denied (${error.message.slice(0, 60)})`);
      continue;
    }
    const leaked = (data ?? []).filter((r: { tenant_id: string }) => r.tenant_id === TENANT_B);
    if (leaked.length > 0) {
      breach(`Unfiltered ${table} read leaked ${leaked.length} Tenant-B rows!`);
    } else {
      ok(`RLS OK: unfiltered ${table} read leaks 0 Tenant-B rows`);
    }
  }
}

// ── SEC-1: cross-tenant write isolation ──
// NOTE: the QA seed holds ZERO enrollments in Tenant B, so the delete probe
// below cannot destroy data even if RLS were misconfigured.

async function testCrossTenantWriteBlocked(client: SupabaseClient) {
  const { data, error } = await client
    .from('enrollments')
    .update({ updated_at: new Date().toISOString() })
    .eq('tenant_id', TENANT_B)
    .select('id');

  if (error) {
    ok(`RLS OK: cross-tenant enrollment UPDATE denied (${error.message.slice(0, 60)})`);
  } else if ((data?.length ?? 0) > 0) {
    breach(`Cross-tenant enrollment UPDATE touched ${data?.length} Tenant-B rows!`);
  } else {
    ok('RLS OK: cross-tenant enrollment UPDATE touched 0 rows');
  }

  const del = await client.from('enrollments').delete().eq('tenant_id', TENANT_B).select('id');
  if (del.error) {
    ok(`RLS OK: cross-tenant enrollment DELETE denied (${del.error.message.slice(0, 60)})`);
  } else if (((del.data as unknown[])?.length ?? 0) > 0) {
    breach('Cross-tenant enrollment DELETE removed Tenant-B rows!');
  } else {
    ok('RLS OK: cross-tenant enrollment DELETE removed 0 rows');
  }
}

// ── SEC-1: privileged RPC matrix for extend_enrollment ──
// Function contract (07_functions.sql:2816): SECURITY DEFINER, requires
// auth.uid() + courses.manage in caller tenant + same-tenant user/course,
// future expiry, non-completed status. Every case below except R-POS must FAIL.

function futureTs() {
  return new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
}

async function expectRpcFail(
  client: SupabaseClient,
  label: string,
  args: { p_user_id: string; p_course_id: string; p_new_expires_at: string },
) {
  const { error } = await client.rpc('extend_enrollment', args);
  if (error) {
    ok(`RPC OK: ${label} rejected (${error.message.slice(0, 90)})`);
  } else {
    breach(`RPC ${label} SUCCEEDED but must FAIL!`);
  }
}

async function testExtendEnrollmentMatrix(
  teacherClient: SupabaseClient,
  adminClient: SupabaseClient | null,
  anonClient: SupabaseClient,
) {
  // R1: teacher HOLDS courses.manage per canonical seed (11_seed_reference.sql)
  // and owns Extend/Revoke in StudentProgressPage — valid same-tenant input
  // from the teacher must SUCCEED. Cross-tenant/user cases below must FAIL.
  {
    const { error } = await teacherClient.rpc('extend_enrollment', {
      p_user_id: STUDENT_A,
      p_course_id: COURSE_A,
      p_new_expires_at: futureTs(),
    });
    if (error) {
      breach(`R1 authorized teacher extend failed unexpectedly: ${error.message}`);
    } else {
      ok('RPC OK: R1 authorized teacher same-tenant extend succeeded');
    }
  }

  // Privileged actor for the rest: admin when available, else teacher
  // (negative cases still prove blocking; the reason conflates with
  // permission-denied and the log says so).
  const privileged = adminClient ?? teacherClient;
  const privilegedLabel = adminClient ? 'admin' : 'teacher-as-stand-in (no admin creds)';

  // R-POS: the single legitimate path — same-tenant admin extend → SUCCESS.
  if (adminClient) {
    const { error } = await adminClient.rpc('extend_enrollment', {
      p_user_id: STUDENT_A,
      p_course_id: COURSE_A,
      p_new_expires_at: futureTs(),
    });
    if (error) {
      breach(`R-POS legitimate admin extend failed unexpectedly: ${error.message}`);
    } else {
      ok('RPC OK: R-POS legitimate same-tenant admin extend succeeded');
    }
  } else {
    console.log('⚠️  R-POS SKIPPED (UNVERIFIED): no TEST_ADMIN_EMAIL/PASSWORD in .env.test');
  }

  // R2: valid course + foreign user → FAIL.
  await expectRpcFail(privileged, `R2 foreign user (${privilegedLabel})`, {
    p_user_id: STUDENT_B,
    p_course_id: COURSE_A,
    p_new_expires_at: futureTs(),
  });

  // R3: valid user + foreign course → FAIL.
  await expectRpcFail(privileged, `R3 foreign course (${privilegedLabel})`, {
    p_user_id: STUDENT_A,
    p_course_id: COURSE_B,
    p_new_expires_at: futureTs(),
  });

  // R4: both foreign → FAIL.
  await expectRpcFail(privileged, `R4 both foreign (${privilegedLabel})`, {
    p_user_id: STUDENT_B,
    p_course_id: COURSE_B,
    p_new_expires_at: futureTs(),
  });

  // R5: guessed UUIDs → FAIL.
  await expectRpcFail(privileged, `R5 guessed UUIDs (${privilegedLabel})`, {
    p_user_id: GUESSED_UUID,
    p_course_id: GUESSED_UUID,
    p_new_expires_at: futureTs(),
  });

  // R6: expired date → FAIL.
  await expectRpcFail(privileged, `R6 past expiry (${privilegedLabel})`, {
    p_user_id: STUDENT_A,
    p_course_id: COURSE_A,
    p_new_expires_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  });

  // R7: malformed UUIDs → FAIL.
  await expectRpcFail(privileged, `R7 malformed UUID (${privilegedLabel})`, {
    p_user_id: 'not-a-uuid',
    p_course_id: COURSE_A,
    p_new_expires_at: futureTs(),
  });

  // R8: anonymous (no session) → FAIL.
  await expectRpcFail(anonClient, 'R8 anonymous caller', {
    p_user_id: STUDENT_A,
    p_course_id: COURSE_A,
    p_new_expires_at: futureTs(),
  });

  // R9: completed enrollment cannot be extended → FAIL.
  await expectRpcFail(privileged, `R9 completed status (${privilegedLabel})`, {
    p_user_id: STUDENT_A,
    p_course_id: COMPLETED_COURSE_A,
    p_new_expires_at: futureTs(),
  });
}

// Run all tests
(async () => {
  try {
    // Gate self-proof: --prove-failure forces exactly one breach so CI
    // wiring can demonstrate EXIT 1 on a violation (chain verification).
    const proveFailure = process.argv.includes('--prove-failure');

    console.log('Starting RLS Smoke Tests (baseline + SEC-1 cross-tenant matrix)...');
    console.log(`Tenants: A=${TENANT_A} B=${TENANT_B}`);

    const teacherClient = await signIn(supabaseUrl!, supabaseAnonKey!, teacherEmail!, teacherPassword!);

    let adminClient: SupabaseClient | null = null;
    if (adminEmail && adminPassword) {
      try {
        adminClient = await signIn(supabaseUrl!, supabaseAnonKey!, adminEmail, adminPassword);
        console.log('Privileged actor: Tenant-A admin (positive path enabled)');
      } catch (e) {
        console.log(`⚠️  Admin sign-in failed (${(e as Error).message}); negatives run as teacher stand-in`);
      }
    } else {
      console.log('⚠️  No admin creds; R-POS will be UNVERIFIED, negatives run as teacher stand-in');
    }
    const anonClient = createClient(supabaseUrl!, supabaseAnonKey!);

    // Baseline (unchanged behavior)
    await testTeacherCannotReadUsers(teacherClient);
    await testTeacherCannotReadSettings(teacherClient);
    await testTeacherCannotWriteSettings(teacherClient);
    await testTeacherCannotInsertUserRoles(teacherClient);

    // SEC-1 reads
    await testCrossTenantRead(teacherClient, 'courses', 'id, tenant_id', 'Teacher-A');
    await testCrossTenantRead(teacherClient, 'enrollments', 'id, tenant_id', 'Teacher-A');
    await testCrossTenantRead(teacherClient, 'user_progress', 'id, tenant_id', 'Teacher-A');
    await testCrossTenantRead(teacherClient, 'activity_logs', 'id, tenant_id', 'Teacher-A');
    await testCrossTenantRead(teacherClient, 'audit_logs', 'id, tenant_id', 'Teacher-A');
    await testNoTenantBLeakInUnfilteredReads(teacherClient);

    // SEC-1 writes
    await testCrossTenantWriteBlocked(teacherClient);

    // SEC-1 RPC matrix
    await testExtendEnrollmentMatrix(teacherClient, adminClient, anonClient);

    if (proveFailure) {
      breach('PROVE-FAILURE flag: deliberate breach to verify EXIT 1 wiring');
    }

    if (failures > 0) {
      console.error(`\n❌ RLS smoke tests FAILED with ${failures} breach(es).`);
      process.exit(1);
    }
    console.log('\n🔒 All RLS smoke tests passed (baseline + SEC-1 matrix).');
    process.exit(0);
  } catch (err: unknown) {
    console.error('\n❌ RLS Smoke tests failed:', (err as Error).message);
    process.exit(1);
  }
})();
