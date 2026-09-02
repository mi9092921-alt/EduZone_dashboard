import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { userFactory } from '../../../tests/factories/user.factory';

// ── Mock the repository functions ─────────────────────────────────
vi.mock('@/infrastructure/repos/users.service', () => ({
  // controlUserAccount, terminateUserSessions, and issueWarning are no
  // longer called directly; the mutations now route through Server Actions (v13).
  resetUserDevices: vi.fn(),
}));

// Mock Server Actions (application layer)
vi.mock('@/adapters/actions/user.actions', () => ({
  createUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
  controlUserAccountAction: vi.fn(),
  terminateUserSessionsAction: vi.fn(),
  issueWarningAction: vi.fn(),
}));

import { controlUserAccountAction, issueWarningAction } from '@/adapters/actions/user.actions';

// ── Wrapper factory ───────────────────────────────────────────────
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('users.mutations hooks', () => {
  const mockControl = controlUserAccountAction as ReturnType<typeof vi.fn>;
  const mockIssueWarning = issueWarningAction as ReturnType<typeof vi.fn>;

  beforeEach(() => vi.clearAllMocks());

  // ── useMutateUserAccount ────────────────────────────────────────
  it('useMutateUserAccount — lock: calls Server Action with correct args', async () => {
    const user = userFactory.build();
    // v13: mutation routes through controlUserAccountAction Server Action
    mockControl.mockResolvedValueOnce({ success: true, accountStatus: 'locked' });

    const { useMutateUserAccount } = await import('./users.mutations');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMutateUserAccount(), { wrapper });

    await act(async () => {
      result.current.mutate({ userId: user.id, action: 'lock', reason: 'Suspicious activity' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockControl).toHaveBeenCalledWith(user.id, 'lock', 'Suspicious activity', undefined);
  });

  it('useMutateUserAccount — suspend: includes suspendHours', async () => {
    const user = userFactory.build();
    mockControl.mockResolvedValueOnce({ success: true, accountStatus: 'suspended' });

    const { useMutateUserAccount } = await import('./users.mutations');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMutateUserAccount(), { wrapper });

    await act(async () => {
      result.current.mutate({
        userId: user.id,
        action: 'suspend',
        reason: 'Policy violation',
        suspendHours: 48,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockControl).toHaveBeenCalledWith(user.id, 'suspend', 'Policy violation', 48);
  });

  it('useMutateUserAccount — propagates error from Server Action', async () => {
    // v13: Server Action returns { success: false, error } rather than throwing directly.
    // The mutation fn converts this to a thrown Error.
    mockControl.mockResolvedValueOnce({ success: false, error: 'Permission denied.' });

    const { useMutateUserAccount } = await import('./users.mutations');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMutateUserAccount(), { wrapper });

    await act(async () => {
      result.current.mutate({ userId: 'u1', action: 'ban', reason: 'Abusive behavior' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Permission denied.');
  });

  // ── useMutateWarning ────────────────────────────────────────────
  it('useMutateWarning — issues warning with severity and action', async () => {
    mockIssueWarning.mockResolvedValueOnce({ success: true, warningId: 'warning-uuid-001' });

    const { useMutateWarning } = await import('./users.mutations');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMutateWarning(), { wrapper });

    await act(async () => {
      result.current.mutate({
        userId: 'user-1',
        reason: 'Repeatedly violating community guidelines',
        severity: 2,
        action: 'none',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockIssueWarning).toHaveBeenCalledWith(
      'user-1',
      'Repeatedly violating community guidelines',
      2,
      'none',
    );
  });

  it('useMutateWarning — isPending true while in flight', async () => {
    let resolve: (v: unknown) => void;
    mockIssueWarning.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { useMutateWarning } = await import('./users.mutations');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMutateWarning(), { wrapper });

    act(() => {
      result.current.mutate({ userId: 'u1', reason: 'Some valid long reason here', severity: 1 });
    });

    // While pending
    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Resolve the promise
    act(() => resolve!({ success: true, warningId: 'done' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
