import { resolveDatabaseUrl } from "./lib/db.mjs";
import pg from 'pg';
import fs from 'fs';
import path from 'path';

async function run() {
  const dbUrl = resolveDatabaseUrl();
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  // Read SQL from migration file
  const sqlPath = path.resolve('../../supabase/migrations/20260604_notification_fanout_worker.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Applying migration SQL...');
  await client.query(sql);
  console.log('Migration SQL applied successfully!');

  console.log('Sending reload schema notification to Postgrest...');
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log('Schema reload triggered!');

  await client.end();
}

run().catch(console.error);
