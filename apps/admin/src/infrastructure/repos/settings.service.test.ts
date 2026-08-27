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
import { container } from '@/container';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
      auth: { getUser: vi.fn() },
    },
  },
}));

describe('settings.service', () => {
  const mockFrom = container.supabase.from as any;
  const mockAuth = container.supabase.auth.getUser as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMockQuery = (resolvedValue: any) => {
    const mockQuery = {
      select:      vi.fn().mockReturnThis(),
      order:       vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      single:      vi.fn().mockResolvedValue(resolvedValue),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      update:      vi.fn().mockReturnThis(),
      insert:      vi.fn().mockReturnThis(),
      delete:      vi.fn().mockReturnThis(),
      upsert:      vi.fn().mockReturnThis(),
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
    setupMockQuery({ data: [{ key: '1', category: 'general' }, { key: '2', category: 'security' }], error: null });
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
    const q = setupMockQuery({ data: null, error: null });
    q.eq.mockResolvedValue({ error: null });

    await setSetting('k', 'v', 'string');
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ value: 'v', value_type: 'string', updated_by: 'admin1' }));
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

  it('maintenance mode toggles', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u' } } });
    const q = setupMockQuery({ error: null });
    await enableMaintenanceMode({ message: 'off', ends_at: 'now', exclude_roles: ['admin'], exclude_users: ['1'] });
    expect(q.upsert).toHaveBeenCalledTimes(5);

    await disableMaintenanceMode();
    expect(q.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'maintenance_mode', value: 'false' }), { onConflict: 'key' });
  });

  it('app locks', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u' } } });
    const q = setupMockQuery({ error: null });
    await lockApp('locked');
    expect(q.upsert).toHaveBeenCalledTimes(2);

    await unlockApp();
    expect(q.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'app_locked', value: 'false' }), { onConflict: 'key' });
  });
});
