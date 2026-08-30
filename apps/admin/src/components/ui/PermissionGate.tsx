'use client';

import { PermissionName } from '@eduzone/types';
import React from 'react';

import { usePermission } from '@/adapters/hooks/usePermission';
import { useAuthUser } from '@/adapters/stores/auth.store';

interface PermissionGateProps {
  permission: PermissionName;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Higher-order component to declaratively gate UI by permission.
 */
export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const { hasPermission } = usePermission(permission);

  if (!hasPermission) return <>{fallback}</>;

  return <>{children}</>;
}

interface RoleGateProps {
  roles: ('super_admin' | 'admin' | 'teacher' | 'student')[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Gating component based on user's primary role.
 */
export function RoleGate({ roles, fallback = null, children }: RoleGateProps) {
  const user = useAuthUser();

  if (!user || !roles.includes(user.primary_role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
