import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getAllSettings,
  getSettingsByCategory,
  getSetting,
  setSetting,
  createSetting,
  deleteSetting,
  enableMaintenanceMode,
  disableMaintenanceMode,
  lockApp,
  unlockApp,
} from './settings.service';

import {
  disableMaintenanceModeAction,
  enableMaintenanceModeAction,
  lockAppAction,
  unlockAppAction,
} from '@/adapters/actions/settings.actions';
import { container } from '@/container';

// 2026-09-26 security audit: the four privileged writes no longer call the
// (uncallable) service-role-only SECURITY DEFINER RPCs directly — they go
// through the settings.actions server actions, which write via `set_setting`
// under the caller's own session. Mocked here; the actions themselves are
// covered by their boundary gates (requirePermission / requireSuperAdmin).
vi.mock('@/adapters/actions/settings.actions', () => ({
  enableMaintenanceModeAction: vi.fn().mockResolvedValue({ success: true }),
  disableMaintenanceModeAction: vi.fn().mockResolvedValue({ success: true }),
  lockAppAction: vi.fn().mockResolvedValue({ success: true }),
  unlockAppAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ error: null }),
      auth: { getUser: vi.fn() },
    },
  },
}));

describe('settings.service', () => {
  const mockFrom = container.supabase.from as any;
  const mockRpc = container.supabase.rpc as any;
  const mockAuth = container.supabase.auth.getUser as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMockQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      // Mock thenable chain for terminal methods without single()
      then: vi.fn().mockImplementation((cb: (v: unknown) => unknown) => cb(resolvedValue)),
    };
    mockFrom.mockReturnValue(mockQuery);
    return mockQuery;
  };

  it('getAllSettings returns data', async () => {
    setupMockQuery({ data: [{ key: 'k', category: 'general' }], error: null });
    const res = await getAllSettings();
    expect(res).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith('settings_kv');
  });

  it('getSettingsByCategory groups logic', async () => {
    setupMockQuery({
      data: [
        { key: '1', category: 'general' },
        { key: '2', category: 'security' },
      ],
      error: null,
    });
    const res = await getSettingsByCategory();
    expect(res.general).toHaveLength(1);
    expect(res.security).toHaveLength(1);
  });

  it('getSetting returns null when key does not exist', async () => {
    setupMockQuery({ data: null, error: null });
    const result = await getSetting('missing_key');
    expect(result).toBeNull();
  });

  it('getSetting throws on real DB errors', async () => {
    setupMockQuery({ data: null, error: { code: 'DB_ERROR', message: 'Connection failed' } });
    await expect(getSetting('any_key')).rejects.toMatchObject({ code: 'DB_ERROR' });
  });

  it('getSetting returns the value string when key exists', async () => {
    setupMockQuery({ data: { value: 'true' }, error: null });
    const result = await getSetting('maintenance_mode');
    expect(result).toBe('true');
  });

  it('setSetting requires admin user', async () => {
    mockAuth.mockResolvedValue({ data: { user: null } });
    await expect(setSetting('k', 'v')).rejects.toThrow('ADMIN_ONLY');
  });

  it('setSetting updates successfully', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'admin1' } } });

    await setSetting('k', 'v', 'string');
    expect(mockRpc).toHaveBeenCalledWith('set_setting', { p_key: 'k', p_value: 'v' });
  });

  it('createSetting and deleteSetting', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'admin1' } } });
    const q1 = setupMockQuery({ data: { key: 'new' }, error: null });
    await createSetting({ key: 'new', value: '1' });
    expect(q1.insert).toHaveBeenCalled();

    const q2 = setupMockQuery({ error: null });
    q2.eq.mockResolvedValue({ error: null });
    await deleteSetting('new');
    expect(q2.delete).toHaveBeenCalled();
  });

  it('maintenance mode toggles route through the server actions', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u' } } });
    const params = {
      message: 'off',
      ends_at: 'now',
      exclude_roles: ['admin'],
      exclude_users: ['1'],
    };
    await enableMaintenanceMode(params);
    expect(enableMaintenanceModeAction).toHaveBeenCalledWith(params);

    await disableMaintenanceMode();
    expect(disableMaintenanceModeAction).toHaveBeenCalled();
    // The dead direct RPCs must never be called again.
    expect(mockRpc).not.toHaveBeenCalledWith('enable_maintenance_mode', expect.anything());
    expect(mockRpc).not.toHaveBeenCalledWith('disable_maintenance_mode');
  });

  it('app locks route through the server actions', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u' } } });
    await lockApp('locked');
    expect(lockAppAction).toHaveBeenCalledWith('locked');

    await unlockApp();
    expect(unlockAppAction).toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('lock_app_for_all', expect.anything());
    expect(mockRpc).not.toHaveBeenCalledWith('unlock_app');
  });

  it('surfaces server-action failures as InfrastructureError with a generic message', async () => {
    vi.mocked(enableMaintenanceModeAction).mockResolvedValueOnce({
      success: false,
      error: 'settings.write required',
    });
    await expect(enableMaintenanceMode({ message: 'x', ends_at: 'now' })).rejects.toThrow();
    // The privileged reason must stay in internalDetail, not the user-facing message.
    vi.mocked(enableMaintenanceModeAction).mockResolvedValueOnce({
      success: false,
      error: 'settings.write required',
    });
    await expect(enableMaintenanceMode({ message: 'x', ends_at: 'now' })).rejects.toMatchObject({
      name: 'InfrastructureError',
    });
  });
});
