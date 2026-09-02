import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  bindDevice,
  getUsers,
  getUserById,
  controlUserAccount,
  terminateUserSessions,
  resetUserDevices,
  issueWarning,
  getDevices,
  getSessions,
  getWarnings,
  getUserStats,
  searchUsers,
} from './users.service';

import { container } from '@/container';

// Mock the container
vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  },
}));

vi.mock('@/adapters/actions/user.actions', () => ({
  issueWarningAction: vi.fn(),
}));

describe('users.service', () => {
  const mockFrom = container.supabase.from as any;
  const mockRpc = container.supabase.rpc as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb(resolvedValue)),
    };
    return mockQuery;
  };

  it('getUsers applies all filters', async () => {
    const q = setupQuery({ data: [{ id: 'u1' }], count: 1, error: null });
    mockFrom.mockReturnValue(q);

    await getUsers(
      {
        search: 'test',
        primary_role: 'student',
        account_status: 'active',
        tenant_id: 't1',
        region_id: 'US',
        warning_count_gte: 2,
        last_login_from: '2020',
        last_login_to: '2021',
      },
      1,
      10,
    );

    expect(q.or).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('primary_role', 'student');
    expect(q.eq).toHaveBeenCalledWith('account_status', 'active');
    expect(q.gte).toHaveBeenCalledWith('warning_count', 2);
  });

  it('getUserById returns a user', async () => {
    const q = setupQuery({ data: { id: 'u1' }, error: null });
    mockFrom.mockReturnValue(q);
    const res = await getUserById('u1');
    expect(res.id).toBe('u1');
  });

  it('controlUserAccount handles all actions', async () => {
    mockRpc.mockReturnValue(setupQuery({ error: null }));

    await controlUserAccount('u1', 'lock', 'reason');
    expect(mockRpc).toHaveBeenCalledWith('control_user_account', {
      p_user_id: 'u1',
      p_action: 'lock',
      p_reason: 'reason',
      p_suspend_hours: null,
    });

    await controlUserAccount('u1', 'suspend', 'reason', 24);
    expect(mockRpc).toHaveBeenCalledWith('control_user_account', {
      p_user_id: 'u1',
      p_action: 'suspend',
      p_reason: 'reason',
      p_suspend_hours: 24,
    });
  });

  it('terminateUserSessions and resetDevices', async () => {
    mockRpc.mockReturnValue(setupQuery({ data: 1, error: null }));
    await terminateUserSessions('u1');
    expect(mockRpc).toHaveBeenCalledWith('terminate_user_sessions', {
      p_user_id: 'u1',
      p_reason: 'admin_terminated',
    });

    await resetUserDevices('u1');
    expect(mockRpc).toHaveBeenCalledWith('reset_user_device', {
      p_user_id: 'u1',
    });
  });

  it('issueWarning delegates to issueWarningAction', async () => {
    const { issueWarningAction } = await import('@/adapters/actions/user.actions');
    (issueWarningAction as any).mockResolvedValue({ success: true, warningId: 'w1' });

    const id = await issueWarning('u1', 'r', 1);
    expect(id).toBe('w1');
    expect(issueWarningAction).toHaveBeenCalledWith('u1', 'r', 1, 'none');
  });

  it('issueWarning throws when the action reports failure', async () => {
    const { issueWarningAction } = await import('@/adapters/actions/user.actions');
    (issueWarningAction as any).mockResolvedValue({ success: false, error: 'PERMISSION_DENIED' });

    await expect(issueWarning('u1', 'r', 1)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('bindDevice calls RPC correctly', async () => {
    mockRpc.mockReturnValue(setupQuery({ error: null }));
    const res = await bindDevice('d1', {}, 'ios');
    expect(res.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('bind_device_for_current_user', {
      p_device_id: 'd1',
      p_device_info: {},
      p_platform: 'ios',
    });
  });

  it('getUserStats uses get_user_stats_summary RPC', async () => {
    // v13: getUserStats uses RPC instead of mv_user_stats view
    mockRpc.mockResolvedValue({
      data: {
        total_users: 10,
        active_users: 8,
        locked_users: 1,
        suspended_users: 1,
        banned_users: 0,
        student_count: 7,
        teacher_count: 2,
        admin_count: 1,
        dau: 5,
        wau: 8,
        mau: 10,
      },
      error: null,
    });

    const stats = await getUserStats('t1');
    expect(stats!.total_users).toBe(10);
    expect(mockRpc).toHaveBeenCalledWith('get_user_stats_summary', { p_tenant_id: 't1' });
  });

  it('getDevices, getSessions, getWarnings, searchUsers', async () => {
    const q = setupQuery({ data: [], error: null });
    mockFrom.mockReturnValue(q);

    await getDevices('u1');
    await getSessions('u1');
    await getWarnings('u1');
    await searchUsers('query');

    // v13: sessions uses sessions base table; searchUsers uses users base table
    expect(mockFrom).toHaveBeenCalledWith('devices');
    expect(mockFrom).toHaveBeenCalledWith('sessions');
    expect(mockFrom).toHaveBeenCalledWith('warnings');
    expect(mockFrom).toHaveBeenCalledWith('users');
  });

  it('handles RATE_LIMITED error correctly', async () => {
    const mockRpc = container.supabase.rpc as any;
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts' },
    });

    const result = await bindDevice('dev-foo', {}, '0.0.0.0');
    expect(result).toEqual({ success: false, error: 'RATE_LIMITED' });
  });

  it('throws for other Supabase errors', async () => {
    const mockRpc = container.supabase.rpc as any;
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'UNKNOWN', message: 'Something went wrong' },
    });

    await expect(bindDevice('dev', {}, 'ip')).rejects.toEqual({
      code: 'UNKNOWN',
      message: 'Something went wrong',
    });
  });
});
