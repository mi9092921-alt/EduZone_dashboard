#!/usr/bin/env node
import pg from 'pg';

const table = process.argv[2] || 'enrollments';
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows } = await client.query(
  `SELECT policyname, cmd, roles::text FROM pg_policies
   WHERE schemaname = 'public' AND tablename = $1
   ORDER BY cmd, policyname`,
  [table],
);
console.table(rows);
await client.end();
