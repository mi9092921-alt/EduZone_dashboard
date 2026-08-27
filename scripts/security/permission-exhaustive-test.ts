import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.test') });

const supabaseUrl = process.env.SUPABASE_TEST_URL;
const supabaseAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
const teacherEmail = process.env.TEST_TEACHER_EMAIL;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !teacherEmail || !teacherPassword) {
  console.error("Missing required .env.test variables to run permissions tests");
  process.exit(1);
}

const ADMIN_ONLY_PERMISSIONS = [
  'users.read',
  'users.write',
  'users.lock',
  'users.delete',
  'courses.delete',
  'courses.manage',
  'settings.read',
  'settings.write',
  'devices.manage',
  'sessions.manage',
  'audit.read',
  'feature_flags.manage',
  'tenants.manage',
] as const;

const TEACHER_ALLOWED_PERMISSIONS = [
  'courses.read',
  'courses.write',
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
  if (!userData?.user) throw new Error("Could not get user data");

  const teacherUserId = userData.user.id;

  console.log('\n📋 Testing permissions for teacher role:\n');
  let breachCount = 0;

  for (const perm of ADMIN_ONLY_PERMISSIONS) {
    const { data, error } = await client.rpc('user_has_permission', {
      p_user_id: teacherUserId,
      p_permission: perm,
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
runPermissionTests().catch(err => {
  console.error(err);
  process.exit(1);
});
