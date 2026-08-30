import {
  Dashboard,
  People,
  School,
  Settings,
  Flag,
  Warning,
  PieChart,
  Security,
  WorkOutline,
  Business,
  History,
} from '@mui/icons-material';
import type { ElementType } from 'react';

import type { PrimaryRole } from '@/adapters/stores/auth.store';

export interface NavItem {
  id: string;
  /** Translation key in the 'common' namespace */
  label: string;
  icon: ElementType;
  path: string;
  /** Roles that can access this route */
  roles: PrimaryRole[];
}

/**
 * Single source of truth for navigation items and role-based access.
 * Used by both Sidebar (rendering) and AdminShell (route guard).
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'dashboard', icon: Dashboard, path: '/', roles: ['super_admin', 'admin', 'teacher'] },
  { id: 'courses', label: 'courses', icon: School, path: '/courses', roles: ['super_admin', 'admin', 'teacher'] },
  { id: 'users', label: 'users', icon: People, path: '/users', roles: ['super_admin', 'admin'] },
  { id: 'analytics', label: 'analytics', icon: PieChart, path: '/analytics', roles: ['super_admin', 'admin'] },
  { id: 'activities', label: 'activities', icon: History, path: '/activities', roles: ['super_admin', 'admin'] },
  { id: 'audit', label: 'audit', icon: Security, path: '/audit', roles: ['super_admin'] },
  { id: 'jobs', label: 'jobs', icon: WorkOutline, path: '/jobs', roles: ['super_admin'] },
  { id: 'tenants', label: 'tenants', icon: Business, path: '/tenants', roles: ['super_admin'] },
  { id: 'warnings', label: 'warnings', icon: Warning, path: '/warnings', roles: ['super_admin', 'admin', 'teacher'] },
  { id: 'flags', label: 'flags', icon: Flag, path: '/flags', roles: ['super_admin'] },
  { id: 'settings', label: 'settings', icon: Settings, path: '/settings', roles: ['super_admin', 'admin'] },
];

/**
 * Returns true if the role is allowed to access the given pathname.
 * Used in AdminShell for the client-side route guard.
 */
export function isRouteAllowed(role: PrimaryRole, pathname: string): boolean {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path + '/')),
  );
  // If no nav item matches the path, allow access (e.g. sub-pages not listed)
  if (!match) return true;
  return match.roles.includes(role);
}
