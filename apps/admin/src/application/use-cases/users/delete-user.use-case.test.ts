import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DeleteUserUseCase } from './delete-user.use-case';

import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';


function makeRepo(overrides: Partial<IUserAdminRepository> = {}): IUserAdminRepository {
  return {
    createAuthUser: vi.fn(),
    upsertProfile: vi.fn(),
    findRoleIdByName: vi.fn(),
    assignRole: vi.fn(),
    deleteAuthUser: vi.fn().mockResolvedValue({ ok: true }),
    softDeleteProfile: vi.fn().mockResolvedValue(undefined),
    controlAccount: vi.fn(),
    terminateSessions: vi.fn(),
    issueWarning: vi.fn(),
    ...overrides,
  } as unknown as IUserAdminRepository;
}

describe('DeleteUserUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the auth user and always applies the soft-delete fallback', async () => {
    const repo = makeRepo();

    const result = await new DeleteUserUseCase(repo).execute('user-1');

    expect(result).toEqual({ success: true });
    expect(repo.deleteAuthUser).toHaveBeenCalledWith('user-1');
    expect(repo.softDeleteProfile).toHaveBeenCalledWith('user-1');
  });

  it('tolerates auth deletion when the user was not found (soft delete still applied)', async () => {
    const repo = makeRepo({
      deleteAuthUser: vi
        .fn()
        .mockResolvedValue({ ok: false, message: 'User not found in auth' }),
    });

    const result = await new DeleteUserUseCase(repo).execute('user-1');

    expect(result).toEqual({ success: true });
    expect(repo.softDeleteProfile).toHaveBeenCalledWith('user-1');
  });

  it('fails when auth deletion fails for any other reason', async () => {
    const repo = makeRepo({
      deleteAuthUser: vi
        .fn()
        .mockResolvedValue({ ok: false, message: 'Database connection lost' }),
    });

    const result = await new DeleteUserUseCase(repo).execute('user-1');

    expect(result).toEqual({ success: false, error: 'Database connection lost' });
    // The soft-delete fallback still runs (belt & braces) — same as before.
    expect(repo.softDeleteProfile).toHaveBeenCalledWith('user-1');
  });
});
