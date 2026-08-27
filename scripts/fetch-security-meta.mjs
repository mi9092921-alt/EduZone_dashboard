import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync('all-advisors.json', 'utf8');
const data = JSON.parse(raw);
const securityFindings = data.filter(x => 
  ['anon_security_definer_function_executable', 'authenticated_security_definer_function_executable', 'function_search_path_mutable', 'security_definer'].includes(x.name)
);

console.error(`Found ${securityFindings.length} security findings`);

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
console.error('Connected to DB');

const results = [];
const seen = new Set();

for (let i = 0; i < securityFindings.length; i++) {
  const item = securityFindings[i];
  const schema = item.metadata.schema;
  const name = item.metadata.name;
  if (!schema || !name) continue;
  
  const key = `${schema}.${name}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const sql = `
    SELECT
      p.proname as function_name,
      n.nspname as schema,
      p.prosecdef as is_security_definer,
      p.proconfig,
      array_to_json(p.proacl) as execution_grants
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = '${schema}' AND p.proname = '${name}'
  `;

  try {
    const res = await c.query(sql);
    if (res.rows.length > 0) {
      results.push({
        schema,
        name,
        advisor_reason: item.name,
        ...res.rows[0]
      });
    }
  } catch (e) {
    console.error(`Error querying ${schema}.${name}: ${e.message}`);
  }
  
  if (i % 50 === 0) {
    console.error(`Processed ${i}/${securityFindings.length}`);
  }
}

writeFileSync('security_report.json', JSON.stringify(results, null, 2));
console.error(`Wrote ${results.length} rows to security_report.json`);
await c.end();
