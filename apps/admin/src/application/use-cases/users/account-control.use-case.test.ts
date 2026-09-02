import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ControlUserAccountUseCase,
  IssueWarningUseCase,
  TerminateUserSessionsUseCase,
} from './account-control.use-case';

import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';


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

describe('ControlUserAccountUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the RPC payload { status, until } into the result', async () => {
    const repo = makeRepo({
      controlAccount: vi
        .fn()
        .mockResolvedValue({ status: 'suspended', until: '2026-01-01T00:00:00Z' }),
    });

    const result = await new ControlUserAccountUseCase(repo).execute('u1', 'suspend', 'cheating', 24);

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
  });

  it('returns success:false with the DB message when the RPC fails', async () => {
    const repo = makeRepo({
      controlAccount: vi.fn().mockRejectedValue({ message: 'PERMISSION_DENIED' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new ControlUserAccountUseCase(repo).execute('u1', 'ban', 'spam');

    expect(result).toEqual({ success: false, error: 'PERMISSION_DENIED' });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[controlUserAccountAction] ban on u1 failed:',
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});

describe('TerminateUserSessionsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults the reason and returns the terminated count', async () => {
    const repo = makeRepo({ terminateSessions: vi.fn().mockResolvedValue(4) });

    const result = await new TerminateUserSessionsUseCase(repo).execute('u1');

    expect(repo.terminateSessions).toHaveBeenCalledWith('u1', 'admin_terminated');
    expect(result).toEqual({ success: true, count: 4 });
  });

  it('passes the caller-provided reason through', async () => {
    const repo = makeRepo({ terminateSessions: vi.fn().mockResolvedValue(1) });

    await new TerminateUserSessionsUseCase(repo).execute('u1', 'security incident');

    expect(repo.terminateSessions).toHaveBeenCalledWith('u1', 'security incident');
  });

  it('returns success:false when the RPC fails', async () => {
    const repo = makeRepo({
      terminateSessions: vi.fn().mockRejectedValue({ message: 'rpc failed' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new TerminateUserSessionsUseCase(repo).execute('u1');

    expect(result).toEqual({ success: false, error: 'rpc failed' });
    consoleSpy.mockRestore();
  });
});

describe('IssueWarningUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a warning and returns the warning id', async () => {
    const repo = makeRepo({ issueWarning: vi.fn().mockResolvedValue('w-1') });

    const result = await new IssueWarningUseCase(repo).execute('u1', 'Late submissions', 2, 'none');

    expect(repo.issueWarning).toHaveBeenCalledWith({
      userId: 'u1',
      reason: 'Late submissions',
      severity: 2,
      note: null,
    });
    expect(result).toEqual({ success: true, warningId: 'w-1' });
  });

  it('maps the action field to the RPC note when provided', async () => {
    const repo = makeRepo();

    await new IssueWarningUseCase(repo).execute('u1', 'Cheating attempt', 3, 'suspend_account');

    expect(repo.issueWarning).toHaveBeenCalledWith({
      userId: 'u1',
      reason: 'Cheating attempt',
      severity: 3,
      note: 'suspend_account',
    });
  });

  it('returns success:false when the RPC fails', async () => {
    const repo = makeRepo({
      issueWarning: vi.fn().mockRejectedValue({ message: 'TOO_MANY_WARNINGS' }),
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new IssueWarningUseCase(repo).execute('u1', 'Spamming', 1, 'none');

    expect(result).toEqual({ success: false, error: 'TOO_MANY_WARNINGS' });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[issueWarningAction] warning for u1 failed:',
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});
