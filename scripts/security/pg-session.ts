import pg from 'pg';

/**
 * Connection info for the disposable local RLS/permission test harness
 * (scripts/security/local-test-harness). Never points at a real project.
 */
export const HARNESS_CONNECTION = {
  host: process.env.RLS_TEST_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.RLS_TEST_DB_PORT ?? 54329),
  user: process.env.RLS_TEST_DB_USER ?? 'postgres',
  password: process.env.RLS_TEST_DB_PASSWORD ?? 'postgres',
  database: process.env.RLS_TEST_DB_NAME ?? 'eduzone_rls_test',
};

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client(HARNESS_CONNECTION);
  await client.connect();
  return client;
}

/**
 * Impersonates `userId` on this connection for the duration of `fn`,
 * exactly the way PostgREST would after verifying a real JWT: sets
 * request.jwt.claim.sub/.role, the full claims object (including a
 * matching auth.sessions row + token_version so
 * public.validate_user_session() passes), and `SET ROLE authenticated`.
 * See local-test-harness/01_test_session_helpers.sql for the
 * implementation this calls into.
 *
 * Every RLS policy and SECURITY DEFINER permission function exercised
 * inside `fn` runs under the same rules a real authenticated PostgREST
 * request would — this is not a shortcut around RLS, it is what drives it.
 */
export async function asUser<T>(
  client: pg.Client,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('SELECT test.login_as($1)', [userId]);
  await client.query('SET ROLE authenticated');
  try {
    return await fn();
  } finally {
    // RESET ROLE first: test.logout() reads/writes nothing that needs
    // elevated privilege, but the *next* asUser() call's test.login_as()
    // must run before this connection is left downgraded — resetting to
    // the connecting (superuser) role here keeps that always true.
    await client.query('RESET ROLE');
    await client.query('SELECT test.logout()');
  }
}

export interface Breach {
  description: string;
}

/**
 * Small assertion collector so every script produces one final summary
 * and a single, unambiguous exit code — no per-check `process.exit()`
 * calls that could let a later failure go unreported.
 */
export class BreachTracker {
  private breaches: Breach[] = [];

  report(description: string) {
    this.breaches.push({ description });
    console.error(`❌ ${description}`);
  }

  ok(description: string) {
    console.log(`✅ ${description}`);
  }

  get count() {
    return this.breaches.length;
  }

  finish(label: string): never {
    if (this.count > 0) {
      console.error(`\n❌ ${label}: ${this.count} issue(s) found.`);
      process.exit(1);
    }
    console.log(`\n🔒 ${label}: all checks passed.`);
    process.exit(0);
  }
}
