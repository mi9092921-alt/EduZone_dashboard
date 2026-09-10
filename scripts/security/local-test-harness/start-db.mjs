// Disposable local PostgreSQL 17 cluster for exercising the real
// supabase/schema/ RLS + permission policies without any network
// dependency on a live Supabase Cloud project. Data dir is wiped and
// recreated on every run — this is a throwaway test fixture, not a
// persistent database.
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '.pgdata');

rmSync(dataDir, { recursive: true, force: true });

// Postgres refuses to run its server process as root — that is the ONLY
// reason embedded-postgres's `createPostgresUser` option exists (it makes
// the library create a dedicated unprivileged `postgres` OS user/group
// and drop to it). GitHub Actions runners execute job steps as the
// unprivileged `runner` user already, so this is never needed there —
// and asking for it anyway is actively harmful: GitHub's runner images
// ship PostgreSQL preinstalled, which has *already* created a `postgres`
// system group (but no matching user). embedded-postgres's own
// `createPostgresUser` logic only checks for an existing *user* named
// postgres, not the group, so it unconditionally runs `groupadd
// postgres` — which fails on "group already exists" — and treats that
// failure as fatal instead of tolerating it, aborting the whole harness.
// Gating this on actually running as root sidesteps that bug entirely on
// any normal CI runner, while still working in a root sandbox/container.
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

if (isRoot) {
  // Defensive belt-and-braces for root-based environments that might hit
  // the exact same "group exists, user doesn't" situation GitHub Actions
  // does: provision the postgres user ourselves, tolerating an
  // already-existing group, before embedded-postgres gets a chance to
  // run its own (buggy) groupadd/useradd pair.
  try {
    execSync('id -u postgres', { stdio: 'ignore' });
  } catch {
    try {
      execSync('getent group postgres', { stdio: 'ignore' });
    } catch {
      execSync('groupadd postgres');
    }
    execSync('useradd -g postgres postgres');
  }
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: false,
  // Portable across environments: GitHub Actions runners are non-root,
  // but a sandboxed/root container (or `docker run` without --user) is
  // not uncommon for local use — embedded-postgres refuses to run as
  // root otherwise. This is the library's own supported way to handle
  // that, and removes any need to `su` to a system `postgres` user.
  createPostgresUser: true,
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
