import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { usePermission, useRole } from './usePermission';

import { useAuthPermissions, useIsAdmin, useAuthStore } from '@/adapters/stores/auth.store';

vi.mock('@/adapters/stores/auth.store', () => ({
  useAuthPermissions: vi.fn(),
  useIsAdmin: vi.fn(),
  useAuthStore: vi.fn(),
}));

describe('usePermission', () => {
  it('returns true if the user has the permission', () => {
    (useAuthPermissions as any).mockReturnValue(['users_view', 'courses_edit']);
    (useIsAdmin as any).mockReturnValue(false);

    const { result } = renderHook(() => usePermission('users_view' as any));
    expect(result.current.hasPermission).toBe(true);
  });

  it('returns false if the user lacks the permission', () => {
    (useAuthPermissions as any).mockReturnValue(['courses_view']);
    (useIsAdmin as any).mockReturnValue(false);

    const { result } = renderHook(() => usePermission('users_view' as any));
    expect(result.current.hasPermission).toBe(false);
  });

  it('returns true if the user is an admin (bypass)', () => {
    (useAuthPermissions as any).mockReturnValue([]);
    (useIsAdmin as any).mockReturnValue(true);

    const { result } = renderHook(() => usePermission('any_perm' as any));
    expect(result.current.hasPermission).toBe(true);
  });
});

describe('useRole', () => {
  it('returns true if user role matches one of the allowed roles', () => {
    (useAuthStore as any).mockImplementation((selector: any) => 
      selector({ user: { primary_role: 'admin' } })
    );

    const { result } = renderHook(() => useRole(['admin', 'super_admin']));
    expect(result.current.hasRole).toBe(true);
  });

  it('returns false if user role does not match', () => {
    (useAuthStore as any).mockImplementation((selector: any) => 
      selector({ user: { primary_role: 'student' } })
    );

    const { result } = renderHook(() => useRole(['admin', 'teacher']));
    expect(result.current.hasRole).toBe(false);
  });

  it('returns false if no user is authenticated', () => {
    (useAuthStore as any).mockImplementation((selector: any) => 
      selector({ user: null })
    );

    const { result } = renderHook(() => useRole(['admin']));
    expect(result.current.hasRole).toBe(false);
  });
});
