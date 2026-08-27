import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function run() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let url = '';
  let anonKey = '';
  let serviceKey = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=')[1].trim();
  }

  console.log('Connecting to:', url);
  const supabase = createClient(url, anonKey);
  const adminSupabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  console.log('--- Testing admin_get_job_counts using service_role client with .single() ---');
  const { data: counts, error: countsError } = await adminSupabase
    .rpc('admin_get_job_counts')
    .single();

  if (countsError) {
    console.error('admin_get_job_counts error:', countsError);
  } else {
    console.log('admin_get_job_counts success! Counts:', counts);
  }

  console.log('--- Testing admin_get_jobs using service_role client ---');
  const { data: jobs, error: jobsError } = await adminSupabase
    .rpc('admin_get_jobs', {
      p_page: 1,
      p_page_size: 10,
    });

  if (jobsError) {
    console.error('admin_get_jobs error:', jobsError);
  } else {
    console.log('admin_get_jobs success! Jobs count:', jobs?.length);
    if (jobs && jobs.length > 0) {
      console.log('First job:', jobs[0]);
    }
  }
}

run().catch(console.error);
