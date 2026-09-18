import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SupabaseAuditLogger } from './audit-logger.service';

import type { RequestContext } from '@/domain/types/context.types';
import { logActivityAsync } from '@/infrastructure/repos/jobs-rpc.service';
import { createAdminClient } from '@/infrastructure/supabase/admin';

// Mock the RPC wrapper + admin client factory (both are infrastructure).
vi.mock('@/infrastructure/repos/jobs-rpc.service', () => ({
  logActivityAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

const mockLogActivityAsync = logActivityAsync as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

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
    // No explicit tenant override: log_activity_internal derives the
    // actor's home tenant server-side (FK-safe by construct).
    expect(payload.tenantId).toBeNull();
    // Correlation id: operation → audit entry → correlation id
    expect(payload.details.request_id).toBe('req_abc123');
    expect(payload.details.target_user_id).toBe('user-9');
    expect(payload.details.outcome).toBe('success');
    // Non-switched ctx: no acting-tenant stamp
    expect(payload.details.acting_tenant_id).toBeUndefined();
  });

  it('records the acting tenant in details (not as override) for a switched super_admin', async () => {
    const logger = new SupabaseAuditLogger();

    const switchedCtx: RequestContext = {
      userId: 'super-1',
      tenantId: 'tenant-acting', // the tenant they switched to
      homeTenantId: 'tenant-home', // their real home tenant
      role: 'super_admin',
      permissions: ['*'],
      requestId: 'req_switched',
    };

    await logger.record(switchedCtx, { type: 'user_suspended' });

    const [, payload] = mockLogActivityAsync.mock.calls[0] as [
      unknown,
      {
        userId: string;
        details: Record<string, unknown>;
        tenantId: string | null;
      },
    ];
    // The acting tenant must never become the log_activity_async override:
    // the (actor, acting tenant) pair does not exist in users(id, tenant_id),
    // so flushing it would violate activity_logs_user_tenant_fkey (23503).
    expect(payload.tenantId).toBeNull();
    expect(payload.details.acting_tenant_id).toBe('tenant-acting');
    expect(payload.details.request_id).toBe('req_switched');
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

  it('never throws when the admin client cannot be created', async () => {
    mockCreateAdminClient.mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new SupabaseAuditLogger();

    await expect(
      logger.record(ctx, { type: 'course_deleted', riskLevel: 'high' }),
    ).resolves.toBeUndefined();

    expect(mockLogActivityAsync).not.toHaveBeenCalled();
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
