'use client';

import { PermissionName } from '@eduzone/types';

import { useAuthPermissions, useIsAdmin, useAuthStore } from '@/adapters/stores/auth.store';

/**
 * Hook to check if the current user has a specific permission.
 * Super-admins always have access.
 * Admins are checked against their specific permissions.
 */
export function usePermission(permission: PermissionName) {
  const permissions = useAuthPermissions();
  const isAdmin = useIsAdmin();

  // Logic: super_admin often bypasses, but PRD says they see all nav.
  // For action-level permissions, we check the list.
  const hasPermission = permissions.includes(permission);

  return {
    hasPermission: isAdmin || hasPermission,
    isLoading: false, // In this version, hydration happened in AuthProvider
  };
}

/**
 * Hook to check if the user has any of the listed roles.
 */
export function useRole(roles: string[]) {
  const user = useAuthStore((state) => state.user);

  const hasRole = user ? roles.includes(user.primary_role) : false;

  return {
    hasRole,
  };
}
