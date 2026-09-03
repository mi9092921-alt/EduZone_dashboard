import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ControlUserAccountUseCase,
  IssueWarningUseCase,
  TerminateUserSessionsUseCase,
} from './account-control.use-case';

import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';


function makeRepo(overrides: Partial<IUserAdminRepository> = {}): IUserAdminRepository {
  return {
    createAuthUser: vi.fn(),
    upsertProfile: vi.fn(),
    findRoleIdByName: vi.fn(),
    assignRole: vi.fn(),
    deleteAuthUser: vi.fn(),
    softDeleteProfile: vi.fn(),
    controlAccount: vi.fn().mockResolvedValue(null),
    terminateSessions: vi.fn().mockResolvedValue(0),
    issueWarning: vi.fn().mockResolvedValue('warning-1'),
    ...overrides,
  } as unknown as IUserAdminRepository;
}

const ctx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['users.lock'],
  requestId: 'req_test_ctrl',
});

describe('ControlUserAccountUseCase', () => {
  let audit: IAuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('maps the RPC payload { status, until } into the result and audits the action', async () => {
    const repo = makeRepo({
      controlAccount: vi
        .fn()
        .mockResolvedValue({ status: 'suspended', until: '2026-01-01T00:00:00Z' }),
    });

    const result = await new ControlUserAccountUseCase(repo, audit).execute(
      ctx,
      'u1',
      'suspend',
      'cheating',
      24,
    );

    expect(repo.controlAccount).toHaveBeenCalledWith({
      userId: 'u1',
      action: 'suspend',
      reason: 'cheating',
      suspendHours: 24,
    });
    expect(result).toEqual({
      success: true,
      accountStatus: 'suspended',
      until: '2026-01-01T00:00:00Z',
    });
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: 'account_controlled',
        targetUserId: 'u1',
        riskLevel: 'high',
      }),
    );
  });

  it('returns success:false with a masked, client-safe error when the RPC fails', async () => {
    const repo = makeRepo({
      controlAccount: vi.fn().mockRejectedValue({ message: 'PERMISSION_DENIED' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new ControlUserAccountUseCase(repo, audit).execute(ctx, 'u1', 'ban', 'spam');

    // M10: raw RPC text stays in server logs; the client gets a generic message.
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('PERMISSION_DENIED');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[controlUserAccountAction] ban on u1 failed:',
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: 'account_controlled', outcome: 'failure' }),
    );
    consoleSpy.mockRestore();
  });
});

describe('TerminateUserSessionsUseCase', () => {
  let audit: IAuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('defaults the reason, returns the terminated count, and audits', async () => {
    const repo = makeRepo({ terminateSessions: vi.fn().mockResolvedValue(4) });

    const result = await new TerminateUserSessionsUseCase(repo, audit).execute(ctx, 'u1');

    expect(repo.terminateSessions).toHaveBeenCalledWith('u1', 'admin_terminated');
    expect(result).toEqual({ success: true, count: 4 });
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: 'sessions_terminated',
        targetUserId: 'u1',
        details: expect.objectContaining({ terminated: 4 }),
      }),
    );
  });

  it('passes the caller-provided reason through', async () => {
    const repo = makeRepo({ terminateSessions: vi.fn().mockResolvedValue(1) });

    await new TerminateUserSessionsUseCase(repo, audit).execute(ctx, 'u1', 'security incident');

    expect(repo.terminateSessions).toHaveBeenCalledWith('u1', 'security incident');
  });

  it('returns success:false with a masked error when the RPC fails', async () => {
    const repo = makeRepo({
      terminateSessions: vi.fn().mockRejectedValue({ message: 'rpc failed' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new TerminateUserSessionsUseCase(repo, audit).execute(ctx, 'u1');

    // M10: raw RPC text must not reach the client-facing result.
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('rpc failed');
    consoleSpy.mockRestore();
  });
});

describe('IssueWarningUseCase', () => {
  let audit: IAuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('issues a warning, returns the warning id, and audits', async () => {
    const repo = makeRepo({ issueWarning: vi.fn().mockResolvedValue('w-1') });

    const result = await new IssueWarningUseCase(repo, audit).execute(
      ctx,
      'u1',
      'Late submissions',
      2,
      'none',
    );

    expect(repo.issueWarning).toHaveBeenCalledWith({
      userId: 'u1',
      reason: 'Late submissions',
      severity: 2,
      note: null,
    });
    expect(result).toEqual({ success: true, warningId: 'w-1' });
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: 'warning_issued', targetUserId: 'u1', riskLevel: 'medium' }),
    );
  });

  it('maps the action field to the RPC note when provided', async () => {
    const repo = makeRepo();

    await new IssueWarningUseCase(repo, audit).execute(
      ctx,
      'u1',
      'Cheating attempt',
      3,
      'suspend_account',
    );

    expect(repo.issueWarning).toHaveBeenCalledWith({
      userId: 'u1',
      reason: 'Cheating attempt',
      severity: 3,
      note: 'suspend_account',
    });
  });

  it('escalates risk level to high for severity 3', async () => {
    const repo = makeRepo();

    await new IssueWarningUseCase(repo, audit).execute(ctx, 'u1', 'Cheating attempt', 3, 'none');

    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: 'warning_issued', riskLevel: 'high' }),
    );
  });

  it('returns success:false with a masked error when the RPC fails', async () => {
    const repo = makeRepo({
      issueWarning: vi.fn().mockRejectedValue({ message: 'TOO_MANY_WARNINGS' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new IssueWarningUseCase(repo, audit).execute(
      ctx,
      'u1',
      'Spamming',
      1,
      'none',
    );

    // M10: raw RPC text must not reach the client-facing result.
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('TOO_MANY_WARNINGS');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[issueWarningAction] warning for u1 failed:',
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});
