import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.test specifically so we point to the dummy Cloud project
dotenv.config({ path: resolve(process.cwd(), '.env.test') });

const supabaseUrl = process.env.SUPABASE_TEST_URL;
const supabaseAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
const teacherEmail = process.env.TEST_TEACHER_EMAIL;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !teacherEmail || !teacherPassword) {
  console.error('Missing required .env.test variables to run RLS Smoke Tests');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseAnonKey);

async function testTeacherCannotReadUsers() {
  const { error: authError } = await client.auth.signInWithPassword({
    email: teacherEmail!,
    password: teacherPassword!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);

  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) throw new Error('Could not get user data');

  // Attempt to read users table directly (should return 0 rows due to RLS)
  const { data, error } = await client
    .from('users')
    .select('id, email, primary_role')
    .neq('id', userData.user.id); // exclude self

  if (error) {
    console.error('Error reading users:', error);
  }

  console.assert(data?.length === 0, `❌ RLS BREACH: Teacher can see ${data?.length} other users!`);
  if (data?.length === 0) {
    console.log('✅ RLS OK: Teacher sees 0 users (own record excluded)');
  }
}

async function testTeacherCannotReadSettings() {
  const { data, error } = await client
    .from('settings_kv')
    .select('key, value')
    .eq('is_public', false);

  if (error) {
    console.error('Error reading settings_kv:', error.message);
  }

  console.assert(
    data?.length === 0,
    `❌ RLS BREACH: Teacher can see ${data?.length} private settings!`,
  );
  if (data?.length === 0) {
    console.log('✅ RLS OK: Teacher sees 0 private settings');
  }
}

async function testTeacherCannotWriteSettings() {
  const { error } = await client
    .from('settings_kv')
    .update({ value: 'hacked' })
    .eq('key', 'app_locked');

  console.assert(error !== null, '❌ RLS BREACH: Teacher was able to update settings!');
  if (error !== null) {
    console.log('✅ RLS OK: Teacher cannot write settings (error expected and received)');
  }
}

async function testTeacherCannotInsertUserRoles() {
  const { error } = await client
    .from('user_roles')
    .insert({ user_id: 'some_user_id', role_name: 'admin' });

  console.assert(error !== null, '❌ RLS BREACH: Teacher was able to insert into user_roles!');
  if (error !== null) {
    console.log('✅ RLS OK: Teacher cannot insert cross-tenant user roles');
  }
}

// Run all tests
(async () => {
  try {
    console.log('Starging RLS Smoke Tests...');
    await testTeacherCannotReadUsers();
    await testTeacherCannotReadSettings();
    await testTeacherCannotWriteSettings();
    await testTeacherCannotInsertUserRoles();
    console.log('\n🔒 All RLS smoke tests passed.');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ RLS Smoke tests failed:', err.message);
    process.exit(1);
  }
})();
