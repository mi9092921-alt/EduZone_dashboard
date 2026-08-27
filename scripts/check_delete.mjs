import fs from 'fs';

async function checkDelete() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let REST, SERVICE_KEY;
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) REST = line.split('=')[1].trim() + '/rest/v1';
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) SERVICE_KEY = line.split('=')[1].trim();
  }

  // 1. Get a real user ID
  let res = await fetch(`${REST}/users?limit=1`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    }
  });
  const users = await res.json();
  if (users.length === 0) {
    console.log('No users found in the DB to test delete trigger!');
    return;
  }
  const realUserId = users[0].id;
  console.log('Testing delete on real user:', realUserId);

  // 2. Try to delete the real user
  const url = `${REST}/users?id=eq.${realUserId}`;
  res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}

checkDelete().catch(console.error);
