import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const path = 'supabase/schema/10_permissions.sql';
let content = readFileSync(path, 'utf8');

// Get all functions and their identity arguments
const res = await c.query(`
  SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
`);

const functions = res.rows;

// Replace "FUNCTION public.name()" with "FUNCTION public.name(args)"
for (const f of functions) {
  const oldStr = `FUNCTION public.${f.proname}()`;
  const newStr = `FUNCTION public.${f.proname}(${f.args})`;
  
  // We need to be careful with global replacement if multiple overloads exist
  // But for this project, let's assume one signature per name as seen in advisors
  if (content.includes(oldStr)) {
    content = content.replaceAll(oldStr, newStr);
  }
}

writeFileSync(path, content);
console.log('Fixed function signatures in 10_permissions.sql');
await c.end();
