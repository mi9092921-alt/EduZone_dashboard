/**
 * User domain types — synced with Eduzone Schema v13.9.0 `users` table + related tables.
 */

import type {
  User as BaseUser,
  AccountStatus,
  UserRole,
  Device as BaseDevice,
  Session as BaseSession,
  UserRoleAssignment as BaseUserRoleAssignment,
  UserPermissionCacheEntry as BaseUserPermissionCacheEntry,
  Warning as BaseWarning,
  PaginatedResult as BasePaginatedResult,
  UserStats as BaseUserStats,
} from '@eduzone/types';

export type { AccountStatus, UserRole };
/** @deprecated Use UserRole — PrimaryRole is an alias kept for backward compatibility */
export type PrimaryRole = UserRole;
export type AccountAction = 'lock' | 'unlock' | 'suspend' | 'ban';

// Add any admin-specific UI fields here if needed
export type User = BaseUser;

/** Paginated result wrapper */
export type PaginatedResult<T> = BasePaginatedResult<T>;

/** Computed display name helper */
export function getUserDisplayName(user: Pick<User, 'first_name' | 'last_name' | 'email'>): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return full || user.email || 'Unknown';
}

/** Initials for avatar fallback */
export function getUserInitials(user: Pick<User, 'first_name' | 'last_name' | 'email'>): string {
  if (user.first_name && user.last_name) {
    return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  }
  return (user.email?.charAt(0) || '?').toUpperCase();
}

// ── Filters ──────────────────────────────────────────────────────
export interface UserFilters {
  search?: string;
  primary_role?: UserRole;
  account_status?: AccountStatus;
  tenant_id?: string;
  region_id?: string;
  warning_count_gte?: number;
  last_login_from?: string;
  last_login_to?: string;
}

// ── Control result ───────────────────────────────────────────────
export interface ControlResult {
  success: boolean;
  message?: string | undefined;
  auto_suspended?: boolean | undefined;
}

// ── Device ───────────────────────────────────────────────────────
export interface Device extends BaseDevice {
  // Joined extensions if any
  device_name?: string;
}

// ── Session ──────────────────────────────────────────────────────
// Joined extensions if any
export type Session = BaseSession;

// ── Warning ──────────────────────────────────────────────────────
export interface Warning extends BaseWarning {
  // Joined fields
  action_taken?: string;
  notes?: string | null;
  expires_at?: string | null;
}

// ── Permission cache entry ───────────────────────────────────────
// No extensions
export type PermissionCacheEntry = BaseUserPermissionCacheEntry;

// ── User role assignment ─────────────────────────────────────────
export interface UserRoleAssignment extends BaseUserRoleAssignment {
  // Joined fields
  role_name?: string | undefined;
  role_label?: string | undefined;
}

// ── User stats (from get_user_stats_summary) ──────────────────────
export type UserStats = BaseUserStats;
