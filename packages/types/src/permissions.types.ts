/**
 * Permission catalog — MUST stay in lockstep with the canonical DB seed
 * (`supabase/schema/11_seed_reference.sql`, "System Permissions" insert).
 *
 * Enforced by `apps/admin/src/config/permission-catalog.lockstep.test.ts`,
 * which parses the seed file and fails when the two catalogs diverge.
 *
 * PHASE 2 security audit: the previous union drifted from the DB — it was
 * missing `notifications.send`, `feature_flags.tenant_manage` and
 * `course_announcements.send` (all present in the seed) and listed
 * `users.delete`, which no DB row backs (only super_admin's `'*'` wildcard
 * could ever satisfy a gate on it). Server-action permission gates are now
 * typed as `PermissionName`, so a nonexistent key is a compile error instead
 * of a silently dead OR-branch.
 */
export const PERMISSION_NAMES = [
  'users.read',
  'users.write',
  'users.lock',
  'courses.read',
  'courses.write',
  'courses.delete',
  'courses.manage',
  'reports.read',
  'settings.read',
  'settings.write',
  'warnings.write',
  'devices.manage',
  'sessions.manage',
  'audit.read',
  'feature_flags.manage',
  'feature_flags.tenant_manage',
  'tenants.manage',
  'notifications.send',
  'notifications.delete',
  'course_announcements.send',
] as const;

export type PermissionName = (typeof PERMISSION_NAMES)[number];

/** Permission cache entry from user_permission_cache table */
export interface PermissionCacheEntry {
  permission_name: PermissionName;
  cached_at: string;
  expires_at: string | null;
}
