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

  it('addRoleOverride resolves tenant from the caller session when no explicit tenant is cached', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return chain({ data: { tenant_id: 't1' }, error: null });
      return chain({ error: null });
    });
    await addRoleOverride('f1', 'r1');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockFrom).toHaveBeenCalledWith('feature_flag_roles');
  });

  it('removeRoleOverride deletes the matching flag/role pair via container.supabase', async () => {
    const q = chain({ error: null });
    mockFrom.mockReturnValue(q);
    await removeRoleOverride('f1', 'r1');
    expect(q.eq).toHaveBeenCalledWith('flag_id', 'f1');
    expect(q.eq).toHaveBeenCalledWith('role_id', 'r1');
  });

  it('addUserOverride resolves tenant from the target user first', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return chain({ data: { tenant_id: 'user-tenant' }, error: null });
      return chain({ error: null });
    });
    await addUserOverride('f1', 'u1');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockFrom).toHaveBeenCalledWith('feature_flag_users');
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

  it('getAllFeatureFlagsAdmin queries via createAdminClient (bypasses RLS)', async () => {
    mockAdminFrom.mockReturnValue(
      chain({ data: [{ id: 'f1', key: 'dark_mode', is_enabled: true, metadata: {} }], error: null }),
    );
    const result = await getAllFeatureFlagsAdmin();
    expect(mockAdminFrom).toHaveBeenCalledWith('feature_flags');
    // The RLS-scoped mock must never be hit by the Admin variant.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('createFeatureFlagAdmin maps a unique-constraint violation (23505) to ConflictError', async () => {
    mockAdminFrom.mockReturnValue(chain({ data: null, error: { code: '23505', message: 'dup' } }));
    await expect(createFeatureFlagAdmin({ key: 'existing' } as any)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('addRoleOverrideAdmin uses the passed-in tenantId directly (no extra lookup)', async () => {
    const q = chain({ error: null });
    mockAdminFrom.mockReturnValue(q);
    await addRoleOverrideAdmin('f1', 'r1', 't1');
    expect(mockAdminFrom).toHaveBeenCalledWith('feature_flag_roles');
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
    expect(q.upsert).toHaveBeenCalledWith(
      { tenant_id: 't1', flag_id: 'f1', role_id: 'r1' },
      { onConflict: 'tenant_id,flag_id,role_id' },
    );
  });
});
