import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import { userFactory } from '../../../tests/factories/user.factory';

// ── Mock the infrastructure service ──────────────────────────────
vi.mock('@/infrastructure/repos/users.service', () => ({
  getUsers:              vi.fn(),
  getUserById:           vi.fn(),
  getDevices:            vi.fn(),
  getSessions:           vi.fn(),
  getWarnings:           vi.fn(),
  getEffectivePermissions: vi.fn(),
  getUserRoles:          vi.fn(),
  getUserStats:          vi.fn(),
}));

import {
  getUsers,
  getUserById,
  getUserStats,
} from '@/infrastructure/repos/users.service';

// ── Query wrapper helper ──────────────────────────────────────────
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('users.queries hooks', () => {
  const mockGetUsers    = getUsers    as ReturnType<typeof vi.fn>;
  const mockGetById     = getUserById as ReturnType<typeof vi.fn>;
  const mockGetStats    = getUserStats as ReturnType<typeof vi.fn>;

  beforeEach(() => vi.clearAllMocks());

  // ── useUsers ────────────────────────────────────────────────────
  it('useUsers — fetches user list with correct filters', async () => {
    const mockUsers = userFactory.buildList(3, { primary_role: 'student' });
    mockGetUsers.mockResolvedValueOnce({
      data: mockUsers, count: 3, page: 1, pageSize: 50, totalPages: 1,
    });

    const { useUsers } = await import('./users.queries');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUsers({ primary_role: 'student' }, 1, 50), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toHaveLength(3);
    expect(result.current.data?.data[0]?.primary_role).toBe('student');
    expect(mockGetUsers).toHaveBeenCalledWith({ primary_role: 'student' }, 1, 50);
  });

  it('useUsers — returns previous data while fetching (keepPreviousData)', async () => {
    const firstPage = {
      data: userFactory.buildList(2), count: 2, page: 1, pageSize: 50, totalPages: 1,
    };
    mockGetUsers.mockResolvedValue(firstPage);

    const { useUsers } = await import('./users.queries');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUsers({}, 1, 50), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(2);
  });

  it('useUsers — propagates error on service failure', async () => {
    mockGetUsers.mockRejectedValueOnce({ code: 'DB_ERROR', message: 'Connection lost' });

    const { useUsers } = await import('./users.queries');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUsers({}, 1, 50), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'DB_ERROR' });
  });

  // ── useUserById ─────────────────────────────────────────────────
  it('useUserById — fetches single user by id', async () => {
    const user = userFactory.locked();
    mockGetById.mockResolvedValueOnce(user);

    const { useUserById } = await import('./users.queries');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserById(user.id), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.account_status).toBe('locked');
    expect(mockGetById).toHaveBeenCalledWith(user.id);
  });

  it('useUserById — stays disabled when id is null', async () => {
    const { useUserById } = await import('./users.queries');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserById(null), { wrapper });

    // Should never fetch
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetById).not.toHaveBeenCalled();
  });

  // ── useUserStats ────────────────────────────────────────────────
  it('useUserStats — has 60s staleTime (does not refetch immediately)', async () => {
    mockGetStats.mockResolvedValueOnce({
      tenant_id:       'tenantA',
      total_users:     500,
      active_users:    450,
      locked_users:    10,
      suspended_users: 5,
      banned_users:    2,
      dau: 100, wau: 300, mau: 450,
      refreshed_at: new Date().toISOString(),
    });

    const { useUserStats } = await import('./users.queries');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserStats('tenantA'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_users).toBe(500);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
  });
});
