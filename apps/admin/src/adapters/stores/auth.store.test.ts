import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  useAuthStore,
  useAuthUser,
  useIsAuthenticated,
  useIsAdmin,
  useIsSuperAdmin,
  useIsTeacher,
  useAuthLoading,
  useActingTenantId,
} from './auth.store';
import type { AuthUser } from './auth.store';

const makeUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: '1',
  email: 'test@test.com',
  primary_role: 'admin',
  tenant_id: 'tenant-1',
  token_version: 1,
  permissions: [],
  ...overrides,
});

describe('auth.store', () => {
  const initialStore = useAuthStore.getState();

  beforeEach(() => {
    useAuthStore.setState(initialStore, true);
  });

  // ── Core actions ────────────────────────────────────────────────
  it('setUser — stores user and sets isLoading to false', () => {
    const user = makeUser();
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('setUser(null) — clears the user', () => {
    useAuthStore.getState().setUser(makeUser());
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('logout — clears user and sets isLoading to false', () => {
    useAuthStore.getState().setUser(makeUser());
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('setInitialized — marks init as complete', () => {
    expect(useAuthStore.getState().isInitialized).toBe(false);
    useAuthStore.getState().setInitialized();
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it('setLoading — updates loading flag', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });

  // ── Derived selectors (branches coverage) ───────────────────────
  it('useIsAuthenticated — false when no user, true when user set', () => {
    const { result, rerender } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(false);

    useAuthStore.getState().setUser(makeUser());
    rerender();
    expect(result.current).toBe(true);
  });

  it('useIsAdmin — true for admin role', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'admin' }));
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(true);
  });

  it('useIsAdmin — true for super_admin role', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'super_admin' }));
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(true);
  });

  it('useIsAdmin — false for teacher role', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'teacher' }));
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });

  it('useIsAdmin — false when no user (null branch)', () => {
    // user is null — optional chaining returns undefined → cast to false
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });

  it('useIsSuperAdmin — true only for super_admin', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'super_admin' }));
    const { result } = renderHook(() => useIsSuperAdmin());
    expect(result.current).toBe(true);
  });

  it('useIsSuperAdmin — false for admin', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'admin' }));
    const { result } = renderHook(() => useIsSuperAdmin());
    expect(result.current).toBe(false);
  });

  it('useIsTeacher — true only for teacher role', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'teacher' }));
    const { result } = renderHook(() => useIsTeacher());
    expect(result.current).toBe(true);
  });

  it('useIsTeacher — false for other roles', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'student' }));
    const { result } = renderHook(() => useIsTeacher());
    expect(result.current).toBe(false);
  });

  it('useAuthLoading — true while loading or not initialized', () => {
    // Initial state: isLoading=true, isInitialized=false → both conditions true
    const { result, rerender } = renderHook(() => useAuthLoading());
    expect(result.current).toBe(true);

    // After init + loading false → false
    useAuthStore.getState().setInitialized();
    useAuthStore.getState().setLoading(false);
    rerender();
    expect(result.current).toBe(false);

    // Loading again but initialized → true
    useAuthStore.getState().setLoading(true);
    rerender();
    expect(result.current).toBe(true);
  });

  it('useAuthUser — returns null initially, then user after setUser', () => {
    const { result, rerender } = renderHook(() => useAuthUser());
    expect(result.current).toBeNull();

    const user = makeUser({ primary_role: 'student' });
    useAuthStore.getState().setUser(user);
    rerender();
    expect(result.current?.primary_role).toBe('student');
  });

  // ── Tenant Switcher (Wave 3) ────────────────────────────────────
  it('setActingTenantId — updates acting_tenant_id on the current user', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'super_admin' }));
    useAuthStore.getState().setActingTenantId('tenant-2');
    expect(useAuthStore.getState().user?.acting_tenant_id).toBe('tenant-2');
  });

  it('setActingTenantId(null) — clears acting_tenant_id', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'super_admin', acting_tenant_id: 'tenant-2' }));
    useAuthStore.getState().setActingTenantId(null);
    expect(useAuthStore.getState().user?.acting_tenant_id).toBeNull();
  });

  it('setActingTenantId — no-op (stays null) when there is no current user', () => {
    useAuthStore.getState().setActingTenantId('tenant-2');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('useActingTenantId — null when acting_tenant_id is unset', () => {
    useAuthStore.getState().setUser(makeUser({ primary_role: 'super_admin' }));
    const { result } = renderHook(() => useActingTenantId());
    expect(result.current).toBeNull();
  });

  it('useActingTenantId — null when acting_tenant_id equals the home tenant_id (not actually switched)', () => {
    useAuthStore.getState().setUser(
      makeUser({ primary_role: 'super_admin', tenant_id: 'tenant-1', acting_tenant_id: 'tenant-1' }),
    );
    const { result } = renderHook(() => useActingTenantId());
    expect(result.current).toBeNull();
  });

  it('useActingTenantId — returns the acting tenant when genuinely switched', () => {
    useAuthStore.getState().setUser(
      makeUser({ primary_role: 'super_admin', tenant_id: 'tenant-1', acting_tenant_id: 'tenant-2' }),
    );
    const { result } = renderHook(() => useActingTenantId());
    expect(result.current).toBe('tenant-2');
  });
});
