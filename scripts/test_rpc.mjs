import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function run() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let url = '';
  let anonKey = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim();
  }

  console.log('Connecting to:', url);
  const supabase = createClient(url, anonKey);

  console.log('Logging in as admin@eduzone-test.com...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@eduzone-test.com',
    password: 'Test1234!',
  });

  if (authError) {
    console.error('Auth error:', authError);
    return;
  }

  console.log('Auth success! User ID:', authData.user.id);
  console.log('Testing query on users_active...');
  const { data: profile, error: profileError } = await supabase
    .from('users_active')
    .select('id, primary_role, tenant_id, token_version')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Query users_active error:', profileError);
  } else {
    console.log('Query users_active success! Profile:', profile);
  }

  console.log('Testing get_dashboard_stats RPC...');
  const { data: stats, error: statsError } = await supabase
    .rpc('get_dashboard_stats');

  if (statsError) {
    console.error('get_dashboard_stats error:', statsError);
  } else {
    console.log('get_dashboard_stats success! Stats:', stats);
  }

  console.log('Testing get_system_health RPC...');
  const { data: health, error: healthError } = await supabase
    .rpc('get_system_health');

  if (healthError) {
    console.error('get_system_health error:', healthError);
  } else {
    console.log('get_system_health success! Health:', health);
  }
}

run().catch(console.error);
