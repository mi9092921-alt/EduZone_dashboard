import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getActiveBlocks,
  getRateLimitRules,
  toggleRateLimitRule,
  clearBlock,
  getTopOffenders,
} from './rate-limits.service';

import {
  getActiveBlocksAction,
  getRateLimitRulesAction,
  toggleRateLimitRuleAction,
  clearRateLimitBlockAction,
  getTopOffendersAction,
} from '@/application/actions/admin.actions';

// rate-limits.service is a thin delegator to the admin server actions.
// These tests verify the delegation contract only; the RPC/query logic
// itself lives in admin.actions.ts.
vi.mock('@/application/actions/admin.actions', () => ({
  getActiveBlocksAction: vi.fn(),
  getRateLimitRulesAction: vi.fn(),
  toggleRateLimitRuleAction: vi.fn(),
  clearRateLimitBlockAction: vi.fn(),
  getTopOffendersAction: vi.fn(),
}));

describe('rate-limits.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getActiveBlocks delegates to getActiveBlocksAction', async () => {
    const blocks = [{ id: 'b1', email: 'a@a.com' }];
    (getActiveBlocksAction as any).mockResolvedValue(blocks);

    const result = await getActiveBlocks();
    expect(getActiveBlocksAction).toHaveBeenCalledWith();
    expect(result).toBe(blocks);
  });

  it('getRateLimitRules delegates to getRateLimitRulesAction', async () => {
    const rules = [{ action: 'login', is_active: true }];
    (getRateLimitRulesAction as any).mockResolvedValue(rules);

    const result = await getRateLimitRules();
    expect(getRateLimitRulesAction).toHaveBeenCalledWith();
    expect(result).toBe(rules);
  });

  it('toggleRateLimitRule delegates with action and isActive', async () => {
    (toggleRateLimitRuleAction as any).mockResolvedValue(undefined);
    await toggleRateLimitRule('login', false);
    expect(toggleRateLimitRuleAction).toHaveBeenCalledWith('login', false);
  });

  it('clearBlock delegates with the block id', async () => {
    (clearRateLimitBlockAction as any).mockResolvedValue(undefined);
    await clearBlock('b1');
    expect(clearRateLimitBlockAction).toHaveBeenCalledWith('b1');
  });

  it('getTopOffenders delegates to getTopOffendersAction', async () => {
    const offenders = [{ user_id: 'u1', hits: 10 }];
    (getTopOffendersAction as any).mockResolvedValue(offenders);

    const result = await getTopOffenders();
    expect(getTopOffendersAction).toHaveBeenCalledWith();
    expect(result).toBe(offenders);
  });

  it('propagates errors from the action', async () => {
    (getActiveBlocksAction as any).mockRejectedValue(new Error('fail'));
    await expect(getActiveBlocks()).rejects.toThrow('fail');
  });
});
