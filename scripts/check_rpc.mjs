import fs from 'fs';

async function checkRpc() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let REST, SERVICE_KEY;
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) REST = line.split('=')[1].trim() + '/rest/v1';
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) SERVICE_KEY = line.split('=')[1].trim();
  }

  const url = `${REST}/rpc/get_users_paginated`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_page: 1, p_page_size: 1 }),
  });
  
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}

checkRpc().catch(console.error);
