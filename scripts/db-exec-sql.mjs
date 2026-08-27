import { readFileSync } from 'node:fs';
import pg from 'pg';

const sql = process.argv[2]?.startsWith('--file=')
  ? readFileSync(process.argv[2].slice(7), 'utf8')
  : process.argv.slice(2).join(' ');

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query(sql);
console.log('ok');
await c.end();
