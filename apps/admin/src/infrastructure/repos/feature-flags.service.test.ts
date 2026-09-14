import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getAllFeatureFlags,
  getAllFeatureFlagsAdmin,
  createFeatureFlag,
  createFeatureFlagAdmin,
  updateFeatureFlag,
  deleteFeatureFlag,
  toggleFeatureFlag,
  addRoleOverride,
  addRoleOverrideAdmin,
  removeRoleOverride,
  addUserOverride,
  removeUserOverride,
  getAllRoles,
} from './feature-flags.service';

import { container } from '@/container';
import { ConflictError } from '@/domain/errors';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
      auth: { getUser: vi.fn() },
    },
  },
}));

const mockAdminFrom = vi.fn();
vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
  }),
}));

function chain(result: unknown) {
  const q: any = {};
  for (const m of ['select', 'eq', 'order', 'insert', 'upsert', 'delete', 'update', 'limit']) {
    q[m] = vi.fn(() => q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.maybeSingle = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

describe('feature-flags.service', () => {
  const mockFrom = container.supabase.from as any;
  const mockAuth = container.supabase.auth.getUser as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Client-facing (RLS, container.supabase) variants ──────────────────────

  it('getAllFeatureFlags queries via container.supabase (RLS-scoped)', async () => {
    mockFrom.mockReturnValue(
      chain({ data: [{ id: 'f1', key: 'dark_mode', is_enabled: true, metadata: {} }], error: null }),
    );
    const result = await getAllFeatureFlags();
    expect(mockFrom).toHaveBeenCalledWith('feature_flags');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('f1');
  });

  it('createFeatureFlag maps a unique-constraint violation (23505) to ConflictError', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { code: '23505', message: 'dup' } }));
    await expect(createFeatureFlag({ key: 'existing' } as any)).rejects.toBeInstanceOf(ConflictError);
  });

  it('updateFeatureFlag merges existing metadata before writing', async () => {
    const q = chain({ data: { id: 'f1', key: 'dark_mode', is_enabled: true, metadata: {} }, error: null });
    mockFrom.mockReturnValue(q);
    await updateFeatureFlag('f1', { is_enabled: true });
    expect(q.update).toHaveBeenCalled();
  });

  it('deleteFeatureFlag deletes by id via container.supabase', async () => {
    const q = chain({ error: null });
    mockFrom.mockReturnValue(q);
    await deleteFeatureFlag('f1');
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'f1');
  });

  it('toggleFeatureFlag updates is_enabled via container.supabase', async () => {
    const q = chain({ error: null });
    mockFrom.mockReturnValue(q);
    await toggleFeatureFlag('f1', true);
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_enabled: true }),
    );
  });

  it('addRoleOverride sets is_enabled to true when isExclude is false', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const q = chain({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return chain({ data: { tenant_id: 't1' }, error: null });
      return q;
    });
    await addRoleOverride('f1', 'r1', false);
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockFrom).toHaveBeenCalledWith('feature_flag_roles');
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_enabled: true }),
      expect.anything(),
    );
  });

  it('addRoleOverride sets is_enabled to false when isExclude is true', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const q = chain({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return chain({ data: { tenant_id: 't1' }, error: null });
      return q;
    });
    await addRoleOverride('f1', 'r1', true);
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_enabled: false }),
      expect.anything(),
    );
  });

  it('removeRoleOverride deletes the matching flag/role pair via container.supabase', async () => {
    const q = chain({ error: null });
    mockFrom.mockReturnValue(q);
    await removeRoleOverride('f1', 'r1');
    expect(q.eq).toHaveBeenCalledWith('flag_id', 'f1');
    expect(q.eq).toHaveBeenCalledWith('role_id', 'r1');
  });

  it('addUserOverride resolves tenant and sets is_enabled correctly', async () => {
    const q = chain({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return chain({ data: { tenant_id: 'user-tenant' }, error: null });
      return q;
    });
    await addUserOverride('f1', 'u1', true);
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockFrom).toHaveBeenCalledWith('feature_flag_users');
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_enabled: false, user_id: 'u1', flag_id: 'f1' }),
      expect.anything(),
    );
  });

  it('removeUserOverride deletes the matching flag/user pair via container.supabase', async () => {
    const q = chain({ error: null });
    mockFrom.mockReturnValue(q);
    await removeUserOverride('f1', 'u1');
    expect(q.eq).toHaveBeenCalledWith('flag_id', 'f1');
    expect(q.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('getAllRoles returns roles ordered by name via container.supabase', async () => {
    const q = chain({ data: [{ id: 'r1', name: 'admin', label: 'Administrator' }], error: null });
    mockFrom.mockReturnValue(q);
    const result = await getAllRoles();
    expect(q.order).toHaveBeenCalledWith('name');
    expect(result).toEqual([{ id: 'r1', name: 'Administrator', key: 'admin' }]);
  });

  // ── Server-action (service-role, createAdminClient) variants ──────────────

  it('getAllFeatureFlagsAdmin normalizes basis points (10000 -> 100) and maps status', async () => {
    mockAdminFrom.mockReturnValue(
      chain({
        data: [{ id: 'f1', key: 'dark_mode', is_enabled: true, rollout_pct: 10000, status: 'active', metadata: {} }],
        error: null,
      }),
    );
    const result = await getAllFeatureFlagsAdmin();
    expect(mockAdminFrom).toHaveBeenCalledWith('feature_flags');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]!.rollout_pct).toBe(100);
    expect(result[0]!.status).toBe('active');
  });

  it('createFeatureFlagAdmin maps a unique-constraint violation (23505) to ConflictError', async () => {
    mockAdminFrom.mockReturnValue(chain({ data: null, error: { code: '23505', message: 'dup' } }));
    await expect(createFeatureFlagAdmin({ key: 'existing' } as any)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('addRoleOverrideAdmin uses the passed-in tenantId directly and passes is_enabled', async () => {
    const q = chain({ error: null });
    mockAdminFrom.mockReturnValue(q);
    await addRoleOverrideAdmin('f1', 'r1', 't1', true);
    expect(mockAdminFrom).toHaveBeenCalledWith('feature_flag_roles');
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
    expect(q.upsert).toHaveBeenCalledWith(
      { tenant_id: 't1', flag_id: 'f1', role_id: 'r1', is_enabled: false },
      { onConflict: 'tenant_id,flag_id,role_id' },
    );
  });
});
