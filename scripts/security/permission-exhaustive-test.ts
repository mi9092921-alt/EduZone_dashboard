import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Minimal .env.test loader (zero dependencies — see rls-smoke-test.ts).
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

loadEnvTest();

const supabaseUrl = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const teacherEmail = process.env.TEST_TEACHER_EMAIL;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
// Canonical QA seed: teacher@eduzone-test.com belongs to the EduZone QA tenant.
const TEACHER_TENANT_ID =
  process.env.TEST_TEACHER_TENANT_ID ?? '11111111-0000-0000-0000-000000000001';

if (!supabaseUrl || !supabaseAnonKey || !teacherEmail || !teacherPassword) {
  console.error('Missing required .env.test variables to run permissions tests');
  process.exit(1);
}

const ADMIN_ONLY_PERMISSIONS = [
  // NOTE: users.read is intentionally NOT admin-only. The canonical seed
  // grants it to teacher (teachers must read their students; enforced by
  // the users_select_merged RLS policy, same-tenant scoped).
  'users.write',
  'users.lock',
  'users.delete',
  'courses.delete',
  // NOTE: courses.manage is intentionally NOT admin-only. The canonical seed
  // (11_seed_reference.sql) grants it to teacher — teachers own Extend/Revoke
  // in StudentProgressPage. See TEACHER_ALLOWED_PERMISSIONS below.
  'settings.read',
  'settings.write',
  'devices.manage',
  'sessions.manage',
  'audit.read',
  'feature_flags.manage',
  'tenants.manage',
] as const;

const TEACHER_ALLOWED_PERMISSIONS = [
  'users.read', // same-tenant students; RLS-scoped by users_select_merged
  'courses.read',
  'courses.write',
  'courses.manage', // granted by canonical seed; required for Extend/Revoke
  'reports.read',
  'warnings.write',
] as const;

async function runPermissionTests() {
  const client = createClient(supabaseUrl!, supabaseAnonKey!);
  const { error: authError } = await client.auth.signInWithPassword({
    email: teacherEmail!,
    password: teacherPassword!,
  });

  if (authError) throw new Error(`Auth failed: ${authError.message}`);

  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) throw new Error('Could not get user data');

  const teacherUserId = userData.user.id;

  console.log('\n📋 Testing permissions for teacher role:\n');
  let breachCount = 0;

  for (const perm of ADMIN_ONLY_PERMISSIONS) {
    const { data, error } = await client.rpc('user_has_permission', {
      p_user_id: teacherUserId,
      p_permission: perm,
      // App callers always scope to the caller's tenant (authorization.service,
      // jobs-rpc.service). Omitting p_tenant_id defaults to the system tenant
      // and yields false for every tenant-scoped grant — a test artifact.
      p_tenant_id: TEACHER_TENANT_ID,
    });

    if (error) {
      console.error(`Error checking ${perm}:`, error.message);
      breachCount++;
      continue;
    }

    if (data === true) {
      console.error(`❌ PERMISSION BREACH: Teacher has "${perm}" — must be false!`);
      breachCount++;
    } else {
      console.log(`  ✅ ${perm}: false (correct)`);
    }
  }

  for (const perm of TEACHER_ALLOWED_PERMISSIONS) {
    const { data, error } = await client.rpc('user_has_permission', {
      p_user_id: teacherUserId,
      p_permission: perm,
      p_tenant_id: TEACHER_TENANT_ID,
    });

    if (error) {
      console.error(`Error checking ${perm}:`, error.message);
      breachCount++;
      continue;
    }

    if (data === false) {
      console.error(`❌ MISSING PERMISSION: Teacher lacks "${perm}" — must be true!`);
      breachCount++;
    } else {
      console.log(`  ✅ ${perm}: true (correct)`);
    }
  }

  if (breachCount > 0) {
    console.error(`\n❌ Found ${breachCount} permission assignment issues.`);
    process.exit(1);
  } else {
    console.log('\n🔒 All exhaustive permission tests passed.');
    process.exit(0);
  }
}

// Execute
runPermissionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
