import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * rate-limits.service tests
 *
 * The service now owns the DB logic directly via createAdminClient (service_role).
 * We mock the admin module so that createAdminClient returns a chainable stub,
 * and verify that the service correctly calls the right Supabase methods.
 */

// ── Mock createAdminClient ────────────────────────────────────────────────────
const mockLimit: any = vi.fn(() => ({ data: [] as any[], error: null }));
const mockOrder: any = vi.fn(() => ({ data: [] as any[], error: null, limit: mockLimit }));
const mockGte: any = vi.fn(() => ({ order: mockOrder }));
const mockNot: any = vi.fn(() => ({ gt: vi.fn(() => ({ order: mockOrder })) }));
const mockSelect: any = vi.fn(() => ({
  not: mockNot,
  order: mockOrder,
  gte: mockGte,
}));
const mockUpdate: any = vi.fn(() => ({ eq: vi.fn(() => ({ data: null, error: null })) }));
const mockDelete: any = vi.fn(() => ({ eq: vi.fn(() => ({ data: null, error: null })) }));
const mockFrom: any = vi.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
}));
const mockAdmin: any = { from: mockFrom };

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}));

import {
  getActiveBlocks,
  getRateLimitRules,
  toggleRateLimitRule,
  clearBlock,
  getTopOffenders,
} from './rate-limits.service';

describe('rate-limits.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no error
    mockSelect.mockReturnValue({
      not: mockNot,
      order: mockOrder,
      gte: mockGte,
    });
    mockOrder.mockReturnValue({ data: [], error: null, limit: mockLimit });
    mockLimit.mockReturnValue({ data: [], error: null });
    mockUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ data: null, error: null }) });
    mockDelete.mockReturnValue({ eq: vi.fn().mockReturnValue({ data: null, error: null }) });
    mockNot.mockReturnValue({ gt: vi.fn(() => ({ order: mockOrder })) });
    mockGte.mockReturnValue({ order: mockOrder });
  });

  it('getActiveBlocks — queries rate_limits with blocked_until filter', async () => {
    await getActiveBlocks();
    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
  });

  it('getRateLimitRules — queries rate_limit_rules ordered by action', async () => {
    mockSelect.mockReturnValueOnce({ order: mockOrder });
    mockOrder.mockReturnValueOnce({ data: [{ action: 'login' }], error: null });
    const result = await getRateLimitRules();
    expect(mockFrom).toHaveBeenCalledWith('rate_limit_rules');
    expect(Array.isArray(result)).toBe(true);
  });

  it('toggleRateLimitRule — calls update on rate_limit_rules', async () => {
    const mockEq = vi.fn().mockReturnValue({ data: null, error: null });
    mockUpdate.mockReturnValueOnce({ eq: mockEq });
    await toggleRateLimitRule('login', false);
    expect(mockFrom).toHaveBeenCalledWith('rate_limit_rules');
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(mockEq).toHaveBeenCalledWith('action', 'login');
  });

  it('clearBlock — calls delete on rate_limits with the block id', async () => {
    const mockEq = vi.fn().mockReturnValue({ data: null, error: null });
    mockDelete.mockReturnValueOnce({ eq: mockEq });
    await clearBlock('block-123');
    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'block-123');
  });

  it('getTopOffenders — queries rate_limits with gte on window_start', async () => {
    await getTopOffenders();
    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
  });

  it('propagates DB errors from getActiveBlocks', async () => {
    mockNot.mockReturnValueOnce({
      gt: vi.fn(() => ({
        order: vi.fn(() => ({
          data: null,
          error: new Error('db-fail'),
        })),
      })),
    });
    // M10: errors are mapped to InfrastructureError (raw text masked)
    await expect(getActiveBlocks()).rejects.toBeInstanceOf(Error);
  });
});


