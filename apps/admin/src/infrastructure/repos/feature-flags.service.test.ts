import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAllFeatureFlags,
  getFeatureFlagById,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  toggleFeatureFlag,
  addRoleOverride,
  removeRoleOverride,
  addUserOverride,
  removeUserOverride,
  getAllRoles,
} from './feature-flags.service';
import { container } from '@/container';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
    },
  },
}));

describe('feature-flags.service', () => {
  const mockFrom = container.supabase.from as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue(resolvedValue),
    };
    return mockQuery;
  };

  // ── getAllFeatureFlags ──────────────────────────────────────
  describe('getAllFeatureFlags', () => {
    it('returns all flags ordered by key', async () => {
      const flags = [
        { id: 'f1', key: 'dark_mode', is_enabled: true },
        { id: 'f2', key: 'new_dashboard', is_enabled: false },
      ];
      const q = setupQuery({});
      q.order.mockResolvedValue({ data: flags, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getAllFeatureFlags();
      expect(result).toHaveLength(2);
      expect(mockFrom).toHaveBeenCalledWith('feature_flags');
    });

    it('returns empty array when no flags', async () => {
      const q = setupQuery({});
      q.order.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getAllFeatureFlags();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      const q = setupQuery({});
      q.order.mockResolvedValue({ data: null, error: { message: 'fail' } });
      mockFrom.mockReturnValue(q);

      await expect(getAllFeatureFlags()).rejects.toEqual({ message: 'fail' });
    });
  });

  // ── getFeatureFlagById ─────────────────────────────────────
  describe('getFeatureFlagById', () => {
    it('returns flag with role and user overrides', async () => {
      const flag = { id: 'f1', key: 'test_flag', is_enabled: true };
      const roleOverrides = [
        { flag_id: 'f1', role_id: 'r1', is_exclude: false, roles: { name: 'admin', label: 'Admin' } },
      ];
      const userOverrides = [
        { flag_id: 'f1', user_id: 'u1', is_exclude: true, users: { email: 'test@test.com', first_name: 'Test', last_name: 'User' } },
      ];

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // feature_flags query
          return setupQuery({ data: flag, error: null });
        } else if (callCount === 2) {
          // feature_flag_roles query
          const q = setupQuery({});
          q.eq.mockResolvedValue({ data: roleOverrides, error: null });
          return q;
        } else {
          // feature_flag_users query
          const q = setupQuery({});
          q.eq.mockResolvedValue({ data: userOverrides, error: null });
          return q;
        }
      });

      const result = await getFeatureFlagById('f1');
      expect(result.key).toBe('test_flag');
      expect(result.role_overrides).toHaveLength(1);
      expect(result.role_overrides?.[0]?.role_name).toBe('Admin');
      expect(result.user_overrides).toHaveLength(1);
      expect(result.user_overrides?.[0]?.user_email).toBe('test@test.com');
      expect(result.user_overrides?.[0]?.user_name).toBe('Test User');
    });
  });

  // ── createFeatureFlag ──────────────────────────────────────
  describe('createFeatureFlag', () => {
    it('creates a new flag', async () => {
      const newFlag = { id: 'f-new', key: 'new_feature', is_enabled: false };
      const q = setupQuery({ data: newFlag, error: null });
      mockFrom.mockReturnValue(q);

      const result = await createFeatureFlag({ key: 'new_feature', label: 'New Feature' } as any);
      expect(result.key).toBe('new_feature');
      expect(mockFrom).toHaveBeenCalledWith('feature_flags');
    });

    it('throws FLAG_KEY_EXISTS on duplicate key', async () => {
      const q = setupQuery({ data: null, error: { code: '23505', message: 'unique violation' } });
      mockFrom.mockReturnValue(q);

      await expect(
        createFeatureFlag({ key: 'existing' } as any),
      ).rejects.toThrow('FLAG_KEY_EXISTS');
    });

    it('rethrows non-duplicate errors', async () => {
      const q = setupQuery({ data: null, error: { code: '42P01', message: 'table not found' } });
      mockFrom.mockReturnValue(q);

      await expect(
        createFeatureFlag({ key: 'test' } as any),
      ).rejects.toEqual({ code: '42P01', message: 'table not found' });
    });
  });

  // ── updateFeatureFlag ──────────────────────────────────────
  describe('updateFeatureFlag', () => {
    it('updates flag with timestamp', async () => {
      const q = setupQuery({ data: { id: 'f1', key: 'test', is_enabled: true }, error: null });
      mockFrom.mockReturnValue(q);

      const result = await updateFeatureFlag('f1', { is_enabled: true });
      expect(result.is_enabled).toBe(true);
      expect(q.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_enabled: true, updated_at: expect.any(String) }),
      );
    });
  });

  // ── deleteFeatureFlag ──────────────────────────────────────
  describe('deleteFeatureFlag', () => {
    it('deletes the flag', async () => {
      const q = setupQuery({});
      q.eq.mockResolvedValue({ error: null });
      mockFrom.mockReturnValue(q);

      await deleteFeatureFlag('f1');
      expect(mockFrom).toHaveBeenCalledWith('feature_flags');
      expect(q.delete).toHaveBeenCalled();
    });
  });

  // ── toggleFeatureFlag ──────────────────────────────────────
  describe('toggleFeatureFlag', () => {
    it('toggles flag on', async () => {
      const q = setupQuery({});
      q.eq.mockResolvedValue({ error: null });
      mockFrom.mockReturnValue(q);

      await toggleFeatureFlag('f1', true);
      expect(q.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_enabled: true }),
      );
    });

    it('toggles flag off', async () => {
      const q = setupQuery({});
      q.eq.mockResolvedValue({ error: null });
      mockFrom.mockReturnValue(q);

      await toggleFeatureFlag('f1', false);
      expect(q.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_enabled: false }),
      );
    });
  });

  // ── Role overrides ─────────────────────────────────────────
  describe('addRoleOverride', () => {
    it('upserts a role override (include)', async () => {
      const q = setupQuery({ error: null });
      mockFrom.mockReturnValue(q);

      await addRoleOverride('f1', 'r1', false);
      expect(mockFrom).toHaveBeenCalledWith('feature_flag_roles');
      expect(q.upsert).toHaveBeenCalledWith(
        { flag_id: 'f1', role_id: 'r1', is_exclude: false },
        { onConflict: 'flag_id,role_id' },
      );
    });

    it('upserts a role override (exclude)', async () => {
      const q = setupQuery({ error: null });
      mockFrom.mockReturnValue(q);

      await addRoleOverride('f1', 'r1', true);
      expect(q.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ is_exclude: true }),
        expect.any(Object),
      );
    });
  });

  describe('removeRoleOverride', () => {
    it('deletes role override', async () => {
      const q = setupQuery({});
      q.eq.mockReturnThis();
      // The second .eq() should resolve
      let eqCallCount = 0;
      q.eq.mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) return Promise.resolve({ error: null });
        return q;
      });
      mockFrom.mockReturnValue(q);

      await removeRoleOverride('f1', 'r1');
      expect(q.delete).toHaveBeenCalled();
    });
  });

  // ── User overrides ─────────────────────────────────────────
  describe('addUserOverride', () => {
    it('upserts a user override', async () => {
      const q = setupQuery({ error: null });
      mockFrom.mockReturnValue(q);

      await addUserOverride('f1', 'u1', false);
      expect(mockFrom).toHaveBeenCalledWith('feature_flag_users');
      expect(q.upsert).toHaveBeenCalledWith(
        { flag_id: 'f1', user_id: 'u1', is_exclude: false },
        { onConflict: 'flag_id,user_id' },
      );
    });
  });

  describe('removeUserOverride', () => {
    it('deletes user override', async () => {
      const q = setupQuery({});
      q.eq.mockReturnThis();
      let eqCallCount = 0;
      q.eq.mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) return Promise.resolve({ error: null });
        return q;
      });
      mockFrom.mockReturnValue(q);

      await removeUserOverride('f1', 'u1');
      expect(q.delete).toHaveBeenCalled();
    });
  });

  // ── getAllRoles ─────────────────────────────────────────────
  describe('getAllRoles', () => {
    it('returns mapped roles list', async () => {
      const roles = [
        { id: 'r1', name: 'admin', label: 'Administrator' },
        { id: 'r2', name: 'teacher', label: null },
      ];
      const q = setupQuery({});
      q.order.mockResolvedValue({ data: roles, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getAllRoles();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'r1', name: 'Administrator', key: 'admin' });
      expect(result[1]).toEqual({ id: 'r2', name: 'teacher', key: 'teacher' });
    });

    it('returns empty array when no roles', async () => {
      const q = setupQuery({});
      q.order.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getAllRoles();
      expect(result).toEqual([]);
    });
  });
});
