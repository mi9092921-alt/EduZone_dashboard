// FAST exhaustive permission gate — runs against the disposable local
// Postgres harness (scripts/security/local-test-harness), calling the
// REAL public.user_has_permission() RPC the app itself uses. No Docker,
// no live Cloud project.
//
// This is deliberately separate from
// scripts/security/permission-exhaustive-test.ts, which stays exactly
// as-is (a curated ADMIN_ONLY_PERMISSIONS / TEACHER_ALLOWED_PERMISSIONS
// check against a real, Docker-based local Supabase stack, wired into
// .github/workflows/e2e.yml — currently dormant behind E2E_ENABLED).
// This file is the always-on, blocking counterpart wired directly into
// ci.yml, right after Unit tests and before the production build.
//
// Rather than a hand-maintained "these N permissions should be
// true/false for a teacher" list (which drifts the moment role_permissions
// seed data changes), this checks EVERY permission in public.permissions
// against ground truth computed directly from
// user_roles/role_permissions/user_permission_cache (the exact tables
// user_has_permission() itself reads). That makes this an actual
// regression test for the RPC's logic, not a snapshot of today's seed
// data.
//
// It also directly proves the core regression this suite exists for
// (P1-SEC-005): a role-level grant is never enough on its own -- revoking
// one permission at the database layer must be immediately reflected by
// user_has_permission(), even though the role otherwise still "allows" it.
import type { Client } from 'pg';
import { asUser, BreachTracker, connect } from './pg-session';

const TEACHER_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

async function groundTruthPermissions(admin: Client, userId: string, tenantId: string) {
  const { rows } = await admin.query<{ name: string; expected: boolean }>(
    `SELECT
       pm.name,
       (
         EXISTS (
           SELECT 1 FROM public.user_permission_cache pc
           WHERE pc.user_id = $1
             AND pc.permission_name = pm.name
             AND pc.tenant_id = $2
             AND (pc.expires_at IS NULL OR pc.expires_at > now())
         )
         OR EXISTS (
           SELECT 1
           FROM public.user_roles ur
           JOIN public.role_permissions rp ON rp.role_id = ur.role_id
           WHERE ur.user_id = $1
             AND ur.is_active = true
             AND (ur.expires_at IS NULL OR ur.expires_at > now())
             AND rp.permission_id = pm.id
             AND ur.tenant_id = $2
         )
       ) AS expected
     FROM public.permissions pm
     ORDER BY pm.name`,
    [userId, tenantId],
  );
  return new Map(rows.map((r) => [r.name, r.expected]));
}

async function testExhaustivePermissionMatrix(
  admin: Client,
  teacher: Client,
  tenantId: string,
  t: BreachTracker,
) {
  const expected = await groundTruthPermissions(admin, TEACHER_ID, tenantId);

  console.log(`\n📋 Checking all ${expected.size} permissions for the teacher role:\n`);

  await asUser(teacher, TEACHER_ID, async () => {
    for (const [permission, expectedValue] of expected) {
      const { rows } = await teacher.query<{ user_has_permission: boolean }>(
        `SELECT public.user_has_permission($1, $2, $3) AS user_has_permission`,
        [TEACHER_ID, permission, tenantId],
      );
      const actual = rows[0]?.user_has_permission ?? false;

      if (actual === expectedValue) {
        t.ok(`${permission}: ${actual} (matches role_permissions/user_permission_cache)`);
      } else if (actual && !expectedValue) {
        t.report(`PERMISSION BREACH: teacher has "${permission}" but no grant exists for it — must be false!`);
      } else {
        t.report(`MISSING PERMISSION: teacher lacks "${permission}" despite a grant existing — must be true!`);
      }
    }
  });
}

/**
 * Direct regression test for P1-SEC-005: a role-level allowlist is not
 * the source of truth. Revoke a permission the teacher currently has at
 * the database layer, and confirm user_has_permission() reflects that
 * immediately -- proving the DB decision is final, not merely a role
 * default. The row is always restored, so this test is idempotent.
 */
async function testRevokedPermissionIsHonored(
  admin: Client,
  teacher: Client,
  tenantId: string,
  t: BreachTracker,
) {
  const permission = 'courses.read';

  const { rows: before } = await admin.query<{ role_id: string; permission_id: string }>(
    `SELECT rp.role_id, rp.permission_id
     FROM public.user_roles ur
     JOIN public.role_permissions rp ON rp.role_id = ur.role_id
     JOIN public.permissions pm ON pm.id = rp.permission_id
     WHERE ur.user_id = $1 AND ur.tenant_id = $2 AND pm.name = $3`,
    [TEACHER_ID, tenantId, permission],
  );

  if (before.length === 0) {
    console.log(`  (skipping revoke check: teacher does not currently have "${permission}")`);
    return;
  }
  const { role_id: roleId, permission_id: permissionId } = before[0]!;

  await admin.query(
    `DELETE FROM public.role_permissions WHERE role_id = $1 AND permission_id = $2`,
    [roleId, permissionId],
  );

  try {
    const stillHasIt = await asUser(teacher, TEACHER_ID, async () => {
      const { rows } = await teacher.query<{ user_has_permission: boolean }>(
        `SELECT public.user_has_permission($1, $2, $3) AS user_has_permission`,
        [TEACHER_ID, permission, tenantId],
      );
      return rows[0]?.user_has_permission ?? false;
    });

    if (stillHasIt) {
      t.report(
        `PRIVILEGE ESCALATION: revoking "${permission}" from role_permissions had no effect — ` +
          'user_has_permission() still returns true. The role-level default is overriding the database.',
      );
    } else {
      t.ok(`Revoking "${permission}" from role_permissions is honored immediately by user_has_permission()`);
    }
  } finally {
    await admin.query(
      `INSERT INTO public.role_permissions (role_id, permission_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [roleId, permissionId],
    );
  }
}

async function main() {
  const admin = await connect();
  const teacher = await connect();
  const t = new BreachTracker();

  try {
    const { rows } = await admin.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM public.users WHERE id = $1`,
      [TEACHER_ID],
    );
    if (rows.length === 0) throw new Error(`Seed data missing: no user ${TEACHER_ID}`);
    const tenantId = rows[0]!.tenant_id;

    await testExhaustivePermissionMatrix(admin, teacher, tenantId, t);
    await testRevokedPermissionIsHonored(admin, teacher, tenantId, t);
  } finally {
    await admin.end();
    await teacher.end();
  }

  t.finish('Exhaustive permission tests');
}

main().catch((err) => {
  console.error('\n❌ Permission tests crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
