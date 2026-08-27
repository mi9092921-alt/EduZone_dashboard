import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query('DROP SCHEMA IF EXISTS public CASCADE');
await c.query('CREATE SCHEMA public');
await c.query('GRANT ALL ON SCHEMA public TO postgres');
await c.query('GRANT ALL ON SCHEMA public TO public');
for (const s of ['private', 'audit', 'internal', 'maintenance', 'extensions']) {
  await c.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
}
console.log('reset complete');
await c.end();
