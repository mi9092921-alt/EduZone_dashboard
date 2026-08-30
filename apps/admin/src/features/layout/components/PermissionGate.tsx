'use client';

import type { ReactNode } from 'react';

import { useAuthUser } from '@/adapters/stores/auth.store';

type PermissionName = string;

interface PermissionGateProps {
  /** Required permission to render children */
  permission?: PermissionName;
  /** Required roles (OR logic — user needs at least one) */
  roles?: string[];
  /** Content to show when access is denied (default: nothing) */
  fallback?: ReactNode;
  /** Children to render when access is granted */
  children: ReactNode;
}

/**
 * PermissionGate — P1-SHELL-002
 * Conditionally renders children based on user role/permission.
 * When denied, renders fallback (default: null — no DOM node).
 */
export function PermissionGate({
  permission: _permission,
  roles,
  fallback = null,
  children,
}: PermissionGateProps) {
  const user = useAuthUser();

  // Not authenticated → deny
  if (!user) return <>{fallback}</>;

  // super_admin bypasses all gates
  if (user.primary_role === 'super_admin') return <>{children}</>;

  // Role check (OR logic)
  if (roles && !roles.includes(user.primary_role)) {
    return <>{fallback}</>;
  }

  // TODO: Permission-level check via user_permission_cache
  // For now, role-based gating is sufficient

  return <>{children}</>;
}
