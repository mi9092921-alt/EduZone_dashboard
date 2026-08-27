import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const sql = `
  SELECT 
    n.nspname as schema,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef = true
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
`;

try {
  const res = await c.query(sql);
  writeFileSync('live_functions.json', JSON.stringify(res.rows, null, 2), 'utf8');
  console.log(`Successfully fetched ${res.rows.length} live functions`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  await c.end();
}
