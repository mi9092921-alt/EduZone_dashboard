import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const t = await c.query(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
);
let ver = 'none';
try {
  const v = await c.query('SELECT version FROM public.schema_migrations LIMIT 1');
  ver = v.rows[0]?.version ?? 'none';
} catch {
  /* empty */
}
console.log('public_tables', t.rows[0].n);
console.log('schema_version', ver);
await c.end();
