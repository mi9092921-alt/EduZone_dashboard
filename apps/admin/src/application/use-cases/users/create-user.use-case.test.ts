import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CreateUserUseCase } from './create-user.use-case';

import type {
  IUserAdminRepository,
  UpsertProfileInput,
} from '@/application/ports/IUserAdminRepository';
import type { CreateUserInput } from '@/domain/schemas/user.schema';
import { createRequestContext } from '@/domain/types/context.types';


function makeRepo(overrides: Partial<IUserAdminRepository> = {}): IUserAdminRepository {
  return {
    createAuthUser: vi.fn().mockResolvedValue({ ok: true, userId: 'new-user-1' }),
    upsertProfile: vi.fn().mockResolvedValue({ ok: true }),
    findRoleIdByName: vi.fn().mockResolvedValue('role-1'),
    assignRole: vi.fn().mockResolvedValue({ ok: true }),
    deleteAuthUser: vi.fn().mockResolvedValue({ ok: true }),
    softDeleteProfile: vi.fn().mockResolvedValue(undefined),
    controlAccount: vi.fn(),
    terminateSessions: vi.fn(),
    issueWarning: vi.fn(),
    ...overrides,
  } as unknown as IUserAdminRepository;
}

const ctx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['users.write'],
});

const input: CreateUserInput = {
  email: 'new@student.com',
  first_name: 'New',
  last_name: 'Student',
  primary_role: 'student',
};

describe('CreateUserUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates auth user, syncs profile to the caller tenant, and assigns the role', async () => {
    const repo = makeRepo();

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result).toEqual({ success: true, userId: 'new-user-1' });
    expect(repo.createAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: input.email, password: 'Temp1234!' }),
    );
    const profileArg = (repo.upsertProfile as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as UpsertProfileInput;
    expect(profileArg).toMatchObject({ id: 'new-user-1', tenant_id: 'tenant-1' });
    expect(repo.assignRole).toHaveBeenCalledWith({
      user_id: 'new-user-1',
      role_id: 'role-1',
      tenant_id: 'tenant-1',
      granted_by: 'admin-1',
    });
  });

  it('compensates by deleting the auth user when profile sync fails', async () => {
    const repo = makeRepo({
      upsertProfile: vi.fn().mockResolvedValue({ ok: false, message: 'upsert broke' }),
    });

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result).toEqual({
      success: false,
      error: 'User created but profile sync failed: upsert broke',
    });
    expect(repo.deleteAuthUser).toHaveBeenCalledWith('new-user-1');
    expect(repo.assignRole).not.toHaveBeenCalled();
  });

  it('compensates when the role does not exist', async () => {
    const repo = makeRepo({ findRoleIdByName: vi.fn().mockResolvedValue(null) });

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result).toEqual({
      success: false,
      error: 'User created but role sync failed: role student was not found',
    });
    expect(repo.deleteAuthUser).toHaveBeenCalledWith('new-user-1');
  });

  it('compensates when role assignment fails', async () => {
    const repo = makeRepo({
      assignRole: vi.fn().mockResolvedValue({ ok: false, message: 'dup key' }),
    });

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result).toEqual({
      success: false,
      error: 'User created but role sync failed: dup key',
    });
    expect(repo.deleteAuthUser).toHaveBeenCalledWith('new-user-1');
  });

  it('M16 (F16-5): surfaces a failed compensation instead of silently dropping it', async () => {
    const repo = makeRepo({
      upsertProfile: vi.fn().mockResolvedValue({ ok: false, message: 'upsert broke' }),
      deleteAuthUser: vi.fn().mockResolvedValue({ ok: false, message: 'auth api down' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error).toContain('profile sync failed');
    expect(result.error).toContain('cleanup failed');
    expect(result.error).toContain('new-user-1');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CREATE_USER_COMPENSATION_FAILED]'),
    );
    consoleSpy.mockRestore();
  });

  it('M16 (F16-5): treats an already-gone auth user during compensation as success (retry path)', async () => {
    const repo = makeRepo({
      upsertProfile: vi.fn().mockResolvedValue({ ok: false, message: 'upsert broke' }),
      deleteAuthUser: vi.fn().mockResolvedValue({ ok: false, message: 'User not found' }),
    });

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result).toEqual({
      success: false,
      error: 'User created but profile sync failed: upsert broke',
    });
  });

  it('fails without touching the repository when the caller has no tenant', async () => {
    const repo = makeRepo();
    const noTenantCtx = createRequestContext({
      userId: 'admin-1',
      tenantId: '',
      role: 'admin',
      permissions: ['users.write'],
    });

    const result = await new CreateUserUseCase(repo).execute(noTenantCtx, input);

    expect(result).toEqual({ success: false, error: 'Could not determine admin tenant ID' });
    expect(repo.createAuthUser).not.toHaveBeenCalled();
  });

  it('surfaces the raw auth error message when auth creation fails', async () => {
    const repo = makeRepo({
      createAuthUser: vi
        .fn()
        .mockResolvedValue({ ok: false, message: 'Email already registered' }),
    });

    const result = await new CreateUserUseCase(repo).execute(ctx, input);

    expect(result).toEqual({ success: false, error: 'Email already registered' });
    expect(repo.upsertProfile).not.toHaveBeenCalled();
  });
});
