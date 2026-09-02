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

import {
  getAllFeatureFlagsAction,
  getFeatureFlagByIdAction,
  createFeatureFlagAction,
  updateFeatureFlagAction,
  deleteFeatureFlagAction,
  toggleFeatureFlagAction,
  addRoleOverrideAction,
  removeRoleOverrideAction,
  addUserOverrideAction,
  removeUserOverrideAction,
  getAllRolesAction,
} from '@/application/actions/admin.actions';

// feature-flags.service is a thin delegator to the admin server actions,
// which run the privileged, service-role Supabase calls behind an
// auth/permission check (see admin.actions.ts). These tests verify the
// delegation contract: correct action called with correct args, and the
// result/error passed through unchanged. The query/mapping logic itself
// lives in admin.actions.ts and is covered by admin.actions.test.ts.
vi.mock('@/application/actions/admin.actions', () => ({
  getAllFeatureFlagsAction: vi.fn(),
  getFeatureFlagByIdAction: vi.fn(),
  createFeatureFlagAction: vi.fn(),
  updateFeatureFlagAction: vi.fn(),
  deleteFeatureFlagAction: vi.fn(),
  toggleFeatureFlagAction: vi.fn(),
  addRoleOverrideAction: vi.fn(),
  removeRoleOverrideAction: vi.fn(),
  addUserOverrideAction: vi.fn(),
  removeUserOverrideAction: vi.fn(),
  getAllRolesAction: vi.fn(),
}));

describe('feature-flags.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAllFeatureFlags delegates to getAllFeatureFlagsAction', async () => {
    const flags = [{ id: 'f1', key: 'dark_mode' }];
    (getAllFeatureFlagsAction as any).mockResolvedValue(flags);

    const result = await getAllFeatureFlags();
    expect(getAllFeatureFlagsAction).toHaveBeenCalledWith();
    expect(result).toBe(flags);
  });

  it('getFeatureFlagById delegates to getFeatureFlagByIdAction with id', async () => {
    const flag = { id: 'f1', key: 'test_flag' };
    (getFeatureFlagByIdAction as any).mockResolvedValue(flag);

    const result = await getFeatureFlagById('f1');
    expect(getFeatureFlagByIdAction).toHaveBeenCalledWith('f1');
    expect(result).toBe(flag);
  });

  it('createFeatureFlag delegates to createFeatureFlagAction with input', async () => {
    const input = { key: 'new_feature', label: 'New Feature' } as any;
    const created = { id: 'f-new', ...input };
    (createFeatureFlagAction as any).mockResolvedValue(created);

    const result = await createFeatureFlag(input);
    expect(createFeatureFlagAction).toHaveBeenCalledWith(input);
    expect(result).toBe(created);
  });

  it('createFeatureFlag propagates FLAG_KEY_EXISTS from the action', async () => {
    (createFeatureFlagAction as any).mockRejectedValue(new Error('FLAG_KEY_EXISTS'));

    await expect(createFeatureFlag({ key: 'existing' } as any)).rejects.toThrow(
      'FLAG_KEY_EXISTS',
    );
  });

  it('updateFeatureFlag delegates to updateFeatureFlagAction with id/input', async () => {
    const updated = { id: 'f1', is_enabled: true };
    (updateFeatureFlagAction as any).mockResolvedValue(updated);

    const result = await updateFeatureFlag('f1', { is_enabled: true });
    expect(updateFeatureFlagAction).toHaveBeenCalledWith('f1', { is_enabled: true });
    expect(result).toBe(updated);
  });

  it('deleteFeatureFlag delegates to deleteFeatureFlagAction with id', async () => {
    (deleteFeatureFlagAction as any).mockResolvedValue(undefined);

    await deleteFeatureFlag('f1');
    expect(deleteFeatureFlagAction).toHaveBeenCalledWith('f1');
  });

  it('toggleFeatureFlag delegates to toggleFeatureFlagAction with id/enabled', async () => {
    (toggleFeatureFlagAction as any).mockResolvedValue(undefined);

    await toggleFeatureFlag('f1', true);
    expect(toggleFeatureFlagAction).toHaveBeenCalledWith('f1', true);
  });

  it('addRoleOverride delegates to addRoleOverrideAction with flagId/roleId/isExclude', async () => {
    (addRoleOverrideAction as any).mockResolvedValue(undefined);

    await addRoleOverride('f1', 'r1', true);
    expect(addRoleOverrideAction).toHaveBeenCalledWith('f1', 'r1', true);
  });

  it('removeRoleOverride delegates to removeRoleOverrideAction with flagId/roleId', async () => {
    (removeRoleOverrideAction as any).mockResolvedValue(undefined);

    await removeRoleOverride('f1', 'r1');
    expect(removeRoleOverrideAction).toHaveBeenCalledWith('f1', 'r1');
  });

  it('addUserOverride delegates to addUserOverrideAction with flagId/userId/isExclude', async () => {
    (addUserOverrideAction as any).mockResolvedValue(undefined);

    await addUserOverride('f1', 'u1', false);
    expect(addUserOverrideAction).toHaveBeenCalledWith('f1', 'u1', false);
  });

  it('removeUserOverride delegates to removeUserOverrideAction with flagId/userId', async () => {
    (removeUserOverrideAction as any).mockResolvedValue(undefined);

    await removeUserOverride('f1', 'u1');
    expect(removeUserOverrideAction).toHaveBeenCalledWith('f1', 'u1');
  });

  it('getAllRoles delegates to getAllRolesAction', async () => {
    const roles = [{ id: 'r1', name: 'Administrator', key: 'admin' }];
    (getAllRolesAction as any).mockResolvedValue(roles);

    const result = await getAllRoles();
    expect(getAllRolesAction).toHaveBeenCalledWith();
    expect(result).toBe(roles);
  });
});
