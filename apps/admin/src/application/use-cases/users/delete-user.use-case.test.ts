import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DeleteUserUseCase } from './delete-user.use-case';

import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';


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

function makeAudit(): IAuditLogger {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

const ctx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['users.write'],
  requestId: 'req_test_1',
});

describe('DeleteUserUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the auth user, applies the soft-delete fallback, and audits success', async () => {
    const repo = makeRepo();
    const audit = makeAudit();

    const result = await new DeleteUserUseCase(repo, audit).execute(ctx, 'user-1');

    expect(result).toEqual({ success: true });
    expect(repo.deleteAuthUser).toHaveBeenCalledWith('user-1');
    expect(repo.softDeleteProfile).toHaveBeenCalledWith('user-1');
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: 'user_deleted',
        riskLevel: 'high',
        targetUserId: 'user-1',
      }),
    );
  });

  it('M13: the audit event carries the requestId correlation id', async () => {
    const audit = makeAudit();

    await new DeleteUserUseCase(makeRepo(), audit).execute(ctx, 'user-1');

    // operation → audit entry → correlation id
    expect(audit.record).toHaveBeenCalledWith(ctx, expect.anything());
    // ctx (frozen RequestContext) is the event's attribution source and
    // already carries requestId — asserted via the exact ctx match above.
  });

  it('tolerates auth deletion when the user was not found (soft delete still applied)', async () => {
    const repo = makeRepo({
      deleteAuthUser: vi
        .fn()
        .mockResolvedValue({ ok: false, message: 'User not found in auth' }),
    });
    const audit = makeAudit();

    const result = await new DeleteUserUseCase(repo, audit).execute(ctx, 'user-1');

    expect(result).toEqual({ success: true });
    expect(repo.softDeleteProfile).toHaveBeenCalledWith('user-1');
    // "not found" is the retry path — still recorded as a successful delete.
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: 'user_deleted' }),
    );
  });

  it('fails, audits the failure, when auth deletion fails for any other reason', async () => {
    const repo = makeRepo({
      deleteAuthUser: vi
        .fn()
        .mockResolvedValue({ ok: false, message: 'Database connection lost' }),
    });
    const audit = makeAudit();

    const result = await new DeleteUserUseCase(repo, audit).execute(ctx, 'user-1');

    expect(result).toEqual({ success: false, error: 'Database connection lost' });
    // The soft-delete fallback still runs (belt & braces) — same as before.
    expect(repo.softDeleteProfile).toHaveBeenCalledWith('user-1');
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ outcome: 'failure', targetUserId: 'user-1' }),
    );
  });
});
