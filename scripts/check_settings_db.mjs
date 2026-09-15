import { resolveDatabaseUrl } from "./lib/db.mjs";
import pg from 'pg';

async function run() {
  const dbUrl = resolveDatabaseUrl();
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  // Query feature_flags columns
  const flagsCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'feature_flags';
  `);
  console.log('Columns in public.feature_flags:');
  console.table(flagsCols.rows);

  await client.end();
}

run().catch(console.error);
