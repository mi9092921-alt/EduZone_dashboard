// One-shot DB password rotation for project evmrahlzcgqgjhwvxzih.
// Rotates via the Supabase Management API (ALTER ROLE is blocked for the
// postgres role), verifies the new password connects, checks pg_cron, then
// rewrites db_url.txt in BOTH repos. The new password is never printed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const WEB_ROOT = path.join(__dirname, '..');
const WEB_DB_URL_TXT = path.join(WEB_ROOT, 'supabase', 'db_url.txt');
const ENV_DEPLOY = path.join(WEB_ROOT, 'scripts', '.env.deploy');
const FLUTTER_DB_URL_TXT =
  'D:\\projects\\EduZone\\flutter_projects\\EduZone_App\\supabase\\db_url.txt';
const PROJECT_REF = 'evmrahlzcgqgjhwvxzih';

function readEnvFileValue(filePath, key) {
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const clean = line.replace(/\r/g, '').trim();
    if (clean.startsWith(`${key}=`)) return clean.substring(key.length + 1).trim();
  }
  throw new Error(`${key} not found in ${filePath}`);
}

function readDbUrl(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(filePath, 'utf16le');
  for (const line of content.split('\n')) {
    const clean = line.replace(/\r/g, '').trim();
    if (clean.startsWith('DATABASE_URL=')) return clean.substring('DATABASE_URL='.length).trim();
  }
  throw new Error(`No DATABASE_URL line found in ${filePath}`);
}

function mask(url) {
  return url.replace(/:[^:@]+@/, ':***@');
}

function writeDbUrl(filePath, newUrl) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].replace(/\r/g, '').trim().startsWith('DATABASE_URL=')) {
      lines[i] = `DATABASE_URL=${newUrl}`;
      fs.writeFileSync(filePath, lines.join('\n'));
      return;
    }
  }
  throw new Error(`No DATABASE_URL line to replace in ${filePath}`);
}

async function connect(url) {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function main() {
  const oldUrl = readDbUrl(WEB_DB_URL_TXT);
  console.log('Old URL:', mask(oldUrl));

  const newPassword = crypto.randomBytes(24).toString('base64url');
  const newUrl = oldUrl.replace(/:[^:@]+@/, `:${newPassword}@`);

  // 1. Rotate via Management API (PATCH). Classic sbp_ PAT carries full scope.
  const token = readEnvFileValue(ENV_DEPLOY, 'SUPABASE_ACCESS_TOKEN');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    console.error('Management API response:', res.status, await res.text());
    throw new Error('Password rotation via Management API failed');
  }
  console.log('PATCH /database/password — 200 OK');

  // 2. Verify the new password connects.
  const c2 = await connect(newUrl);
  const who = await c2.query('SELECT current_user');
  console.log('New password verified, connected as:', who.rows[0].current_user);

  // 3. pg_cron health (read-only).
  const ext = await c2.query("SELECT extname FROM pg_extension WHERE extname = 'pg_cron'");
  console.log('pg_cron extension:', ext.rows.length ? 'INSTALLED' : 'NOT INSTALLED');
  if (ext.rows.length) {
    const jobs = await c2.query('SELECT jobname, schedule, active FROM cron.job ORDER BY jobname');
    for (const j of jobs.rows) console.log(`  cron job: ${j.jobname} | ${j.schedule} | active=${j.active}`);
  }
  await c2.end();

  // 4. Persist the new URL in both repos' gitignored db_url.txt.
  writeDbUrl(WEB_DB_URL_TXT, newUrl);
  console.log('Updated:', WEB_DB_URL_TXT);
  if (fs.existsSync(FLUTTER_DB_URL_TXT)) {
    const flutterUrl = readDbUrl(FLUTTER_DB_URL_TXT);
    if (flutterUrl === oldUrl) {
      writeDbUrl(FLUTTER_DB_URL_TXT, newUrl);
      console.log('Updated:', FLUTTER_DB_URL_TXT);
    } else {
      console.log('Flutter db_url.txt differs from the web one — NOT auto-updated. It points to:', mask(flutterUrl));
    }
  } else {
    console.log('Flutter db_url.txt not found — skipped');
  }

  console.log('ROTATION COMPLETE (new password written to files only, not printed)');
}

main().catch((err) => {
  console.error('ROTATION FAILED:', err.message);
  console.error('IMPORTANT: if rotation half-applied, reset the password from the Supabase dashboard.');
  process.exit(1);
});
