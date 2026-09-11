// FAST security/RLS gate — runs against the disposable local Postgres
// harness (scripts/security/local-test-harness), applying the REAL,
// canonical supabase/schema/*.sql RLS policies. No mocks, no live Cloud
// project, no Docker.
//
// This is deliberately separate from scripts/security/rls-smoke-test.ts,
// which stays exactly as-is: a deeper SEC-1 cross-tenant + privileged-RPC
// matrix that runs against a real, Docker-based local Supabase stack as
// the "Security gate" step of .github/workflows/e2e.yml (currently
// dormant behind the E2E_ENABLED repository variable). This file is the
// always-on, blocking counterpart wired directly into ci.yml, positioned
// right after Unit tests and before the production build — light enough
// to run unconditionally on every PR.
//
// Every check here compares what an RLS-scoped session actually returns
// against ground truth computed from the same tables the policies
// themselves read, fetched via a superuser connection that bypasses RLS.
// That is deliberate: a hardcoded expectation (e.g. "teacher must see 0
// other users") goes stale the moment a legitimate feature changes what
// a role is allowed to see, and produces a false breach report -- which
// trains people to ignore this gate. Comparing against ground truth
// catches real RLS regressions without ever going stale on its own.
import { asUser, BreachTracker, connect } from './pg-session';

const TEACHER_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

async function testTeacherUserVisibility(admin: import('pg').Client, teacher: import('pg').Client, t: BreachTracker) {
  // Ground truth per the actual RLS policy (users_select_merged): a
  // teacher may see another user in their own tenant only if that user
  // is actively enrolled in one of the teacher's own courses.
  const { rows: expectedRows } = await admin.query<{ id: string }>(
    `SELECT DISTINCT e.user_id AS id
     FROM public.courses c
     JOIN public.enrollments e ON e.course_id = c.id
     WHERE c.teacher_id = $1 AND e.status = 'active'
     ORDER BY 1`,
    [TEACHER_ID],
  );
  const expected = new Set(expectedRows.map((r) => r.id));

  const actualRows = await asUser(teacher, TEACHER_ID, async () => {
    const { rows } = await teacher.query<{ id: string }>(
      `SELECT id FROM public.users WHERE id <> $1 ORDER BY 1`,
      [TEACHER_ID],
    );
    return rows;
  });
  const actual = new Set(actualRows.map((r) => r.id));

  const extra = [...actual].filter((id) => !expected.has(id));
  const missing = [...expected].filter((id) => !actual.has(id));

  if (extra.length > 0) {
    t.report(
      `RLS BREACH: teacher can see ${extra.length} user(s) they should not (not an actively-enrolled student of theirs): ${extra.join(', ')}`,
    );
  } else if (missing.length > 0) {
    t.report(
      `RLS OVER-RESTRICTION: teacher cannot see ${missing.length} of their own actively-enrolled students: ${missing.join(', ')}`,
    );
  } else {
    t.ok(`RLS OK: teacher sees exactly their ${expected.size} actively-enrolled student(s), nothing more`);
  }
}

async function testTeacherCannotReadPrivateSettings(teacher: import('pg').Client, t: BreachTracker) {
  const rows = await asUser(teacher, TEACHER_ID, async () => {
    const { rows } = await teacher.query(
      `SELECT key FROM public.settings_kv WHERE is_public = false`,
    );
    return rows;
  });

  if (rows.length !== 0) {
    t.report(`RLS BREACH: teacher can see ${rows.length} private setting(s)`);
  } else {
    t.ok('RLS OK: teacher sees 0 private settings');
  }
}

async function testTeacherCannotWriteSettings(teacher: import('pg').Client, t: BreachTracker) {
  await asUser(teacher, TEACHER_ID, async () => {
    try {
      const { rowCount } = await teacher.query(
        `UPDATE public.settings_kv SET value = 'true'::jsonb WHERE key = 'app_locked'`,
      );
      if ((rowCount ?? 0) > 0) {
        t.report('RLS BREACH: teacher was able to update settings_kv (app_locked)');
      } else {
        // RLS on settings_admin_update makes the row invisible to the
        // UPDATE's USING clause -- 0 rows affected, no error. That is
        // the expected (safe) outcome for a non-super_admin caller.
        t.ok('RLS OK: teacher cannot write settings (0 rows matched under RLS)');
      }
    } catch (err) {
      // Some policies raise instead of silently matching 0 rows -- also
      // an acceptable "blocked" outcome.
      t.ok(`RLS OK: teacher cannot write settings (rejected: ${(err as Error).message})`);
    }
  });
}

async function testTeacherCannotEscalateViaUserRoles(
  admin: import('pg').Client,
  teacher: import('pg').Client,
  t: BreachTracker,
) {
  const { rows: adminRoleRows } = await admin.query<{ id: string }>(
    `SELECT id FROM public.roles WHERE name = 'admin' LIMIT 1`,
  );
  const { rows: tenantRows } = await admin.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM public.users WHERE id = $1`,
    [TEACHER_ID],
  );
  if (adminRoleRows.length === 0 || tenantRows.length === 0) {
    throw new Error('Seed data missing: could not resolve admin role id or teacher tenant_id');
  }
  const adminRoleId = adminRoleRows[0]!.id;
  const tenantId = tenantRows[0]!.tenant_id;

  await asUser(teacher, TEACHER_ID, async () => {
    try {
      // A real privilege-escalation shape: the teacher tries to grant
      // themselves the admin role in their own tenant.
      const { rowCount } = await teacher.query(
        `INSERT INTO public.user_roles (user_id, role_id, tenant_id, granted_by)
         VALUES ($1, $2, $3, $1)`,
        [TEACHER_ID, adminRoleId, tenantId],
      );
      if ((rowCount ?? 0) > 0) {
        t.report('RLS BREACH: teacher was able to grant themselves the admin role via user_roles');
      } else {
        t.ok('RLS OK: teacher cannot insert into user_roles (0 rows affected)');
      }
    } catch (err) {
      t.ok(`RLS OK: teacher cannot self-escalate via user_roles (rejected: ${(err as Error).message})`);
    } finally {
      // Never leave a would-be escalation row behind even if RLS somehow
      // let it through, so a re-run of this script starts clean.
      await admin.query(
        `DELETE FROM public.user_roles WHERE user_id = $1 AND role_id = $2 AND tenant_id = $3`,
        [TEACHER_ID, adminRoleId, tenantId],
      );
    }
  });
}

async function main() {
  const admin = await connect();
  const teacher = await connect();
  const t = new BreachTracker();

  try {
    console.log('Starting RLS Smoke Tests (local harness)...\n');
    await testTeacherUserVisibility(admin, teacher, t);
    await testTeacherCannotReadPrivateSettings(teacher, t);
    await testTeacherCannotWriteSettings(teacher, t);
    await testTeacherCannotEscalateViaUserRoles(admin, teacher, t);
  } finally {
    await admin.end();
    await teacher.end();
  }

  t.finish('RLS smoke tests');
}

main().catch((err) => {
  console.error('\n❌ RLS smoke tests crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
