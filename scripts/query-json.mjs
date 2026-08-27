import pg from 'pg';

const sql = process.argv.slice(2).join(' ');

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
try {
  const res = await c.query(sql);
  console.log(JSON.stringify(res.rows, null, 2));
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  await c.end();
}
