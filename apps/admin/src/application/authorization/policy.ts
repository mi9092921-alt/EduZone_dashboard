// P1-SEC-005 (partial): single source of truth for the role -> permission
// fast-path allowlist. This logic used to be copy-pasted, byte-for-byte
// identical in intent, in three places (bulk-action/route.ts,
// application/actions/user.actions.ts, application/actions/admin.actions.ts),
// which meant a change to one copy silently would not propagate to the
// others. See PRODUCTION_READINESS_PLAN.md P1-SEC-005 for the remaining
// (unresolved) larger goal of a fully centralized, deny-by-default policy
// port with explicit tenant context across all mutations — this extraction
// only removes the duplication that already existed; it does not change
// any role's effective permissions.
//
// `super_admin` is intentionally NOT handled here: every call site already
// short-circuits super_admin before consulting this allowlist, and callers
// still fall back to the `user_has_permission` RPC (tenant-scoped, DB-backed)
// for anything this allowlist doesn't cover.
export function roleAllowsPermission(
  role: string | undefined,
  permission: string | string[],
): boolean {
  const permissions = Array.isArray(permission) ? permission : [permission];

  if (role === 'admin') {
    return permissions.some((p) => p !== 'tenants.manage');
  }

  if (role === 'teacher') {
    const allowed = new Set([
      'courses.read',
      'courses.write',
      'courses.manage',
      'users.read',
      'warnings.write',
      'reports.read',
      'notifications.send',
      'notifications.delete',
    ]);
    return permissions.some((p) => allowed.has(p));
  }

  if (role === 'student') {
    return permissions.some((p) => p === 'courses.read' || p === 'reports.read');
  }

  return false;
}
