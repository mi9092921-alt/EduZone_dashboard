import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.env.local');

/**
 * SECURITY (launch audit B1, 2026-09-15): database credentials must never be
 * hardcoded in tracked source. The production Postgres password was previously
 * pasted into 16 ops scripts and must be treated as compromised — rotate it in
 * the Supabase dashboard and purge it from git history. This helper resolves
 * the connection string from the process environment or the git-ignored
 * .env.local at the repository root.
 */
function loadEnvLocal() {
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) return;
  if (!fs.existsSync(ENV_LOCAL_PATH)) return;
  const lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(DATABASE_URL|SUPABASE_DB_URL)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) process.env[match[1]] ??= value;
  }
}

export function resolveDatabaseUrl() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      [
        '✖ DATABASE_URL is required.',
        '  Add it to .env.local (git-ignored) or export it in your shell, e.g.:',
        '  DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"',
        '  Never hardcode credentials in tracked files.',
      ].join('\n'),
    );
    process.exit(1);
  }
  return url;
}

export async function connectDb() {
  const pg = (await import('pg')).default;
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  return client;
}
