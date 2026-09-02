import type { PermissionName } from '@eduzone/types';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { usePermission, useRole } from './usePermission';

import { useAuthPermissions, useIsAdmin, useAuthStore } from '@/adapters/stores/auth.store';

vi.mock('@/adapters/stores/auth.store', () => ({
  useAuthPermissions: vi.fn(),
  useIsAdmin: vi.fn(),
  useAuthStore: vi.fn(),
}));

// M9: typed mock handles instead of blind casts on the mocked hooks.
const mockPermissions = vi.mocked(useAuthPermissions);
const mockIsAdmin = vi.mocked(useIsAdmin);
const mockAuthStore = vi.mocked(useAuthStore);

const USER_READ: PermissionName = 'users.read';
const USER_WRITE: PermissionName = 'users.write';

describe('usePermission', () => {
  it('returns true if the user has the permission', () => {
    mockPermissions.mockReturnValue([USER_READ, USER_WRITE]);
    mockIsAdmin.mockReturnValue(false);

    const { result } = renderHook(() => usePermission(USER_READ));
    expect(result.current.hasPermission).toBe(true);
  });

  it('returns false if the user lacks the permission', () => {
    mockPermissions.mockReturnValue(['courses.read']);
    mockIsAdmin.mockReturnValue(false);

    const { result } = renderHook(() => usePermission(USER_READ));
    expect(result.current.hasPermission).toBe(false);
  });

  it('returns true if the user is an admin (bypass)', () => {
    mockPermissions.mockReturnValue([]);
    mockIsAdmin.mockReturnValue(true);

    const { result } = renderHook(() => usePermission(USER_READ));
    expect(result.current.hasPermission).toBe(true);
  });
});

describe('useRole', () => {
  it('returns true if user role matches one of the allowed roles', () => {
    mockAuthStore.mockImplementation(((selector: (state: unknown) => unknown) =>
      selector({ user: { primary_role: 'admin' } })) as never);

    const { result } = renderHook(() => useRole(['admin', 'super_admin']));
    expect(result.current.hasRole).toBe(true);
  });

  it('returns false if user role does not match', () => {
    mockAuthStore.mockImplementation(((selector: (state: unknown) => unknown) =>
      selector({ user: { primary_role: 'student' } })) as never);

    const { result } = renderHook(() => useRole(['admin', 'teacher']));
    expect(result.current.hasRole).toBe(false);
  });

  it('returns false if no user is authenticated', () => {
    mockAuthStore.mockImplementation(((selector: (state: unknown) => unknown) =>
      selector({ user: null })) as never);

    const { result } = renderHook(() => useRole(['admin']));
    expect(result.current.hasRole).toBe(false);
  });
});
