/** Permission names derived from the schema permissions matrix */
export type PermissionName =
  | 'users.read'
  | 'users.write'
  | 'users.lock'
  | 'users.delete'
  | 'courses.read'
  | 'courses.write'
  | 'courses.delete'
  | 'courses.manage'
  | 'reports.read'
  | 'settings.read'
  | 'settings.write'
  | 'warnings.write'
  | 'devices.manage'
  | 'sessions.manage'
  | 'audit.read'
  | 'feature_flags.manage'
  | 'tenants.manage';

/** Permission cache entry from user_permission_cache table */
export interface PermissionCacheEntry {
  permission_name: PermissionName;
  cached_at: string;
  expires_at: string | null;
}
