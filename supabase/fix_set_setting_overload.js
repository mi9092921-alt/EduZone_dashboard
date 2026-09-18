const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDatabaseUrl() {
  const envUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (envUrl) return envUrl;

  const filePath = path.join(__dirname, 'db_url.txt');
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(filePath, 'utf16le');

  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from supabase/db_url.txt');
  let value = line.slice(line.indexOf('=') + 1).trim();
  while (value.startsWith('DATABASE_URL=')) value = value.slice('DATABASE_URL='.length).trim();
  return value;
}

async function main() {
  const client = new Client({
    connectionString: readDatabaseUrl(),
    ssl: { rejectUnauthorized: process.env.SUPABASE_DB_SSL_STRICT === 'true' },
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP FUNCTION IF EXISTS public.set_setting(text, text)');
    const result = await client.query(`
      SELECT oid::regprocedure AS signature
      FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname = 'set_setting'
      ORDER BY oid::regprocedure::text
    `);
    await client.query('COMMIT');
    console.log('Remaining set_setting overloads:', result.rows.map((row) => row.signature).join(', '));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
