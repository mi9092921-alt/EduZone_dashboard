import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SupabaseAuditLogger } from './audit-logger.service';

import type { RequestContext } from '@/domain/types/context.types';
import { logActivityAsync } from '@/infrastructure/repos/jobs-rpc.service';

// Mock the RPC wrapper + admin client factory (both are infrastructure).
vi.mock('@/infrastructure/repos/jobs-rpc.service', () => ({
  logActivityAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

const mockLogActivityAsync = logActivityAsync as ReturnType<typeof vi.fn>;

const ctx: RequestContext = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['users.write'],
  requestId: 'req_abc123',
};

describe('SupabaseAuditLogger (M13 — §17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes the event through log_activity_async with the correlation id', async () => {
    const logger = new SupabaseAuditLogger();

    await logger.record(ctx, {
      type: 'user_deleted',
      summary: 'User permanently deleted',
      riskLevel: 'high',
      targetUserId: 'user-9',
    });

    expect(mockLogActivityAsync).toHaveBeenCalledTimes(1);
    const [client, payload] = mockLogActivityAsync.mock.calls[0] as [
      unknown,
      {
        userId: string;
        type: string;
        details: Record<string, unknown>;
        riskLevel: string;
        tenantId: string | null;
      },
    ];
    expect(client).toBeDefined();
    expect(payload.userId).toBe('admin-1');
    expect(payload.type).toBe('user_deleted');
    expect(payload.riskLevel).toBe('high');
    expect(payload.tenantId).toBe('tenant-1');
    // Correlation id: operation → audit entry → correlation id
    expect(payload.details.request_id).toBe('req_abc123');
    expect(payload.details.target_user_id).toBe('user-9');
    expect(payload.details.outcome).toBe('success');
  });

  it('defaults riskLevel to low and outcome to success', async () => {
    const logger = new SupabaseAuditLogger();

    await logger.record(ctx, { type: 'feature_flag_toggled' });

    const [, payload] = mockLogActivityAsync.mock.calls[0] as [
      unknown,
      { riskLevel: string; details: Record<string, unknown> },
    ];
    expect(payload.riskLevel).toBe('low');
    expect(payload.details.outcome).toBe('success');
  });

  it('never throws when the audit transport fails (best-effort contract)', async () => {
    mockLogActivityAsync.mockRejectedValueOnce(new Error('queue down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new SupabaseAuditLogger();

    await expect(
      logger.record(ctx, { type: 'user_deleted', outcome: 'failure' }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit-logger] log_activity_async failed:',
      expect.objectContaining({ type: 'user_deleted', request_id: 'req_abc123' }),
    );
    consoleSpy.mockRestore();
  });

  it('omits request_id from details when the ctx has none', async () => {
    const logger = new SupabaseAuditLogger();

    await logger.record(
      { userId: 'u1', tenantId: 't1', role: 'admin', permissions: [] },
      { type: 'tenant_suspended' },
    );

    const [, payload] = mockLogActivityAsync.mock.calls[0] as [
      unknown,
      { details: Record<string, unknown> },
    ];
    expect(payload.details.request_id).toBeNull();
  });
});
