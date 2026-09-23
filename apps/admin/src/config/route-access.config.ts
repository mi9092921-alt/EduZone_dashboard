import type { UserRole } from '@eduzone/types';

/**
 * Server-side route→role matrix (PHASE 2.4/2.5 — G1 fix).
 *
 * Before this module, the role matrix lived only in `config/nav.config.ts`
 * and was enforced exclusively client-side (`AdminShell`/Sidebar). A signed-in
 * user with a lower role could open any privileged page shell by direct URL —
 * data stayed protected by RLS/server-action boundaries, but the shell and its
 * client bundle were served. This matrix is enforced by
 * `infrastructure/auth/page-guard.ts` at the server boundary.
 *
 * MUST stay in lockstep with `NAV_ITEMS.roles` — enforced by
 * `route-access.lockstep.test.ts`. Students never appear here: they are
 * rejected at login by `check_dashboard_access()` and again by this guard.
 */
export const STAFF_ROLES = ['super_admin', 'admin', 'teacher'] as const satisfies readonly UserRole[];
export const ADMIN_ROLES = ['super_admin', 'admin'] as const satisfies readonly UserRole[];

export const SEGMENT_ROLES = {
  dashboard: STAFF_ROLES,
  courses: STAFF_ROLES,
  warnings: STAFF_ROLES,
  inbox: STAFF_ROLES,
  notifications: STAFF_ROLES,
  users: ADMIN_ROLES,
  analytics: ADMIN_ROLES,
  activities: ADMIN_ROLES,
  audit: ADMIN_ROLES,
  settings: ADMIN_ROLES,
  jobs: ['super_admin'],
  tenants: ['super_admin'],
  flags: ['super_admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type ProtectedSegment = keyof typeof SEGMENT_ROLES;
