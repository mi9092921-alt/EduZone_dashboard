// Post-deploy ACL + shape verification for the rebuilt course-stats stack
// (grants must survive object recreation — the blanket-REVOKE sweep was the
// historical root cause of silent empty reads). Never prints credentials.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readDbUrl() {
  const urlFilePath = path.join(__dirname, 'db_url.txt');
  if (!fs.existsSync(urlFilePath)) throw new Error('supabase/db_url.txt not found');
  let content = fs.readFileSync(urlFilePath, 'utf8');
  if (content.includes('\u0000')) content = fs.readFileSync(urlFilePath, 'utf16le');
  for (const line of content.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean.startsWith('DATABASE_URL=')) return clean.substring('DATABASE_URL='.length).trim();
  }
  throw new Error('DATABASE_URL not found in db_url.txt');
}

async function main() {
  const client = new Client({ connectionString: readDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: acls } = await client.query(`
      SELECT obj::regclass::text AS obj, role, has_table_privilege(role, obj, 'SELECT') AS can_select
      FROM (VALUES
        ('public.vw_course_stats', 'authenticated'),
        ('public.vw_course_stats', 'anon'),
        ('public.vw_course_stats', 'service_role'),
        ('public.mv_course_stats', 'authenticated'),
        ('public.mv_course_stats', 'anon'),
        ('public.mv_course_stats', 'service_role'),
        ('private.mv_course_stats', 'authenticated'),
        ('private.mv_course_stats', 'anon'),
        ('private.mv_course_stats', 'service_role')
      ) AS t(obj, role)
    `);
    console.log('ACLs:');
    let fail = 0;
    for (const r of acls) {
      console.log(`  ${r.obj.padEnd(26)} ${r.role.padEnd(14)} ${r.can_select ? 'GRANT ✓' : 'MISSING ✗'}`);
      if (!r.can_select) fail++;
    }

    const { rows: opts } = await client.query(`
      SELECT c.relname, c.relkind, c.reloptions
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE (n.nspname, c.relname) IN (('public','vw_course_stats'), ('public','mv_course_stats'), ('private','mv_course_stats'))
    `);
    console.log('\nObjects:');
    for (const r of opts) {
      const invoker = (r.reloptions ?? []).some((o) => o.includes('security_invoker=true'));
      const kind = r.relkind === 'v' ? 'view' : 'matview';
      console.log(`  ${r.relname.padEnd(20)} ${kind.padEnd(8)} security_invoker=${invoker ? 'true ✓' : 'false'}`);
      if (kind === 'view' && !invoker) fail++;
    }

    const { rows: cols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vw_course_stats'
      ORDER BY ordinal_position
    `);
    console.log('\npublic.vw_course_stats columns:', cols.map((c) => c.column_name).join(', '));

    console.log(fail === 0 ? '\nPASS: grants + security_invoker verified.' : `\nFAIL: ${fail} problem(s) found.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
