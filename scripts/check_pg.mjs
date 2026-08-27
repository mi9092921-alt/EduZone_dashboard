import fs from 'fs';

async function checkPostgres() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let REST, SERVICE_KEY;
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) REST = line.split('=')[1].trim() + '/rest/v1';
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) SERVICE_KEY = line.split('=')[1].trim();
  }

  // Use a hack to execute arbitrary SQL if possible, or just note that coalesce is a keyword.
  console.log("Coalesce is a keyword, not a function!");
}
checkPostgres().catch(console.error);
