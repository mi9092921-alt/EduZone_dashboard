import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function run() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let url = '';
  let serviceKey = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=')[1].trim();
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = 'ece7b281-51a8-4ebd-8365-b148015decad';
  const initiatorId = 'aaaaaaaa-0000-0000-0000-000000000001';

  console.log(`--- Inspecting User ${userId} ---`);
  const { data: user, error: userError } = await admin
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    console.error('Error fetching user:', userError);
  } else {
    console.log('User Row:', JSON.stringify(user, null, 2));
  }

  console.log(`--- Testing worker_control_user_account lock ---`);
  const { error: lockError } = await admin.rpc("worker_control_user_account", {
    p_initiator_id: initiatorId,
    p_user_id: userId,
    p_action: "lock",
    p_reason: "Test lock",
  });
  if (lockError) {
    console.error('Lock error:', lockError);
  } else {
    console.log('Lock success!');
  }

  console.log(`--- Testing worker_issue_warning ---`);
  const { error: warnError } = await admin.rpc("worker_issue_warning", {
    p_initiator_id: initiatorId,
    p_user_id: userId,
    p_reason: "Test warning",
    p_severity: 1,
  });
  if (warnError) {
    console.error('Warn error:', warnError);
  } else {
    console.log('Warn success!');
  }
}

run().catch(console.error);
