import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecordCurrentSessionUseCase } from './record-current-session.use-case';

import type {
  ISessionRepository,
  SessionProfileRow,
} from '@/application/ports/ISessionRepository';


const activeProfile: SessionProfileRow = {
  tenant_id: 'tenant-1',
  region_id: 'me-south-1',
  deleted_at: null,
  account_status: 'active',
  login_count: 5,
};

function makeRepo(overrides: Partial<ISessionRepository> = {}): ISessionRepository {
  return {
    getProfile: vi.fn().mockResolvedValue(activeProfile),
    findSession: vi.fn().mockResolvedValue(null),
    touchSession: vi.fn().mockResolvedValue(undefined),
    bumpLastLogin: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue(undefined),
    recordLogin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ISessionRepository;
}

const params = {
  userId: 'user-1',
  sessionId: '11111111-2222-4333-8444-555555555555',
  clientIp: '10.0.0.1',
  userAgent: 'vitest',
};

describe('RecordCurrentSessionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects inactive / deleted accounts', async () => {
    const repo = makeRepo({
      getProfile: vi.fn().mockResolvedValue({ ...activeProfile, account_status: 'banned' }),
    });

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    expect(result).toEqual({ success: false, active: false, error: 'User is not active' });
    expect(repo.findSession).not.toHaveBeenCalled();
  });

  it('treats profile lookup failure as an inactive account', async () => {
    const repo = makeRepo({
      getProfile: vi.fn().mockRejectedValue(new Error('db down')),
    });

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    expect(result).toEqual({ success: false, active: false, error: 'User is not active' });
  });

  it('touches an existing active session and bumps last_login without incrementing count', async () => {
    const repo = makeRepo({
      findSession: vi
        .fn()
        .mockResolvedValue({ id: params.sessionId, is_active: true, deleted_at: null }),
    });

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    expect(result).toEqual({ success: true, active: true });
    expect(repo.touchSession).toHaveBeenCalledWith(params.sessionId, 'user-1', expect.any(String));
    expect(repo.bumpLastLogin).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(repo.createSession).not.toHaveBeenCalled();
    expect(repo.recordLogin).not.toHaveBeenCalled();
  });

  it('fails the heartbeat when the existing session is inactive', async () => {
    const repo = makeRepo({
      findSession: vi
        .fn()
        .mockResolvedValue({ id: params.sessionId, is_active: false, deleted_at: null }),
    });

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    expect(result).toEqual({ success: false, active: false, error: 'Session is inactive' });
    expect(repo.touchSession).not.toHaveBeenCalled();
  });

  it('creates a new session with client metadata and records login stats', async () => {
    const repo = makeRepo();

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    expect(result).toEqual({ success: true, active: true });
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: params.sessionId,
        user_id: 'user-1',
        tenant_id: 'tenant-1',
        region_id: 'me-south-1',
        ip_address: '10.0.0.1',
        user_agent: 'vitest',
      }),
    );
    expect(repo.recordLogin).toHaveBeenCalledWith('user-1', expect.any(String), 5);
  });

  it('returns a masked error (never the raw DB message) when the session insert fails', async () => {
    const repo = makeRepo({
      createSession: vi.fn().mockRejectedValue({ message: 'duplicate key' }),
    });

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    // M10: raw DB text must not reach the client-facing result
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('duplicate key');
    expect(repo.recordLogin).not.toHaveBeenCalled();
  });

  it('survives a failing last_login bump on the touch path', async () => {
    const repo = makeRepo({
      findSession: vi
        .fn()
        .mockResolvedValue({ id: params.sessionId, is_active: true, deleted_at: null }),
      bumpLastLogin: vi.fn().mockRejectedValue(new Error('users table busy')),
    });

    const result = await new RecordCurrentSessionUseCase(repo).execute(params);

    expect(result).toEqual({ success: true, active: true });
  });
});
