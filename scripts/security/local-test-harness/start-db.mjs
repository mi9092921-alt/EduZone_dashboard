// Disposable local PostgreSQL 17 cluster for exercising the real
// supabase/schema/ RLS + permission policies without any network
// dependency on a live Supabase Cloud project. Data dir is wiped and
// recreated on every run — this is a throwaway test fixture, not a
// persistent database.
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '.pgdata');

rmSync(dataDir, { recursive: true, force: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: false,
});

await pg.initialise();
await pg.start();
await pg.createDatabase('eduzone_rls_test');

console.log('READY pg17 on port 54329, db=eduzone_rls_test');

// Keep the process alive; a companion stop-db.mjs (or SIGTERM) tears it down.
process.on('SIGTERM', async () => {
  await pg.stop();
  process.exit(0);
});
