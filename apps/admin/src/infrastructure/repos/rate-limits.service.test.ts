import { describe, it, expect, vi, beforeEach } from 'vitest';
import { container } from '@/container';

// ── Mock the container ────────────────────────────────────────────
vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc:  vi.fn(),
      from: vi.fn(),
      auth: { getUser: vi.fn() },
    },
  },
}));

// ── Helper: build a chainable query-builder mock ──────────────────
function setupQuery(resolved: unknown) {
  const q: Record<string, unknown> = {};
  const chain = [
    'select', 'eq', 'neq', 'is', 'in', 'or', 'not',
    'order', 'range', 'limit', 'gte', 'lte', 'gt', 'lt',
    'update', 'insert', 'delete',
  ];
  chain.forEach((fn) => { q[fn] = vi.fn().mockReturnValue(q); });
  q['single']      = vi.fn().mockResolvedValue(resolved);
  q['maybeSingle'] = vi.fn().mockResolvedValue(resolved);
  q['then']        = vi.fn().mockImplementation((cb: (v: unknown) => unknown) => cb(resolved));
  return q;
}

describe('rate-limits.service', () => {
  const mockFrom = container.supabase.from as ReturnType<typeof vi.fn>;

  beforeEach(() => vi.clearAllMocks());

  // ── Lazy import so vi.mock takes effect ─────────────────────────
  async function importService() {
    return await import('./rate-limits.service');
  }

  it('getActiveBlocks — returns blocks with joined email', async () => {
    const q = setupQuery({
      data: [
        { id: 'rl-1', user_id: 'u1', blocked_until: '2099-01-01T00:00:00Z',
          users: { email: 'test@example.com' } },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(q);

    const { getActiveBlocks } = await importService();
    const result = await getActiveBlocks();

    expect(result).toHaveLength(1);
    expect(result[0]?.user_email).toBe('test@example.com');
  });

  it('getActiveBlocks — falls back gracefully when join fails', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: with join → simulate FK error
        return setupQuery({ data: null, error: { message: 'FK not found' } });
      }
      // Second call: fallback without join
      return setupQuery({ data: [{ id: 'rl-1', blocked_until: '2099-01-01T00:00:00Z' }], error: null });
    });

    const { getActiveBlocks } = await importService();
    const result = await getActiveBlocks();

    expect(result).toHaveLength(1);
    expect(callCount).toBe(2); // fallback was triggered
  });

  it('getRateLimitRules — returns rules ordered by action', async () => {
    const q = setupQuery({
      data: [
        { action: 'login', limit_count: 5, window_seconds: 300, is_active: true },
        { action: 'bind_device', limit_count: 3, window_seconds: 60, is_active: true },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(q);

    const { getRateLimitRules } = await importService();
    const rules = await getRateLimitRules();

    expect(rules).toHaveLength(2);
    expect(rules[0]?.action).toBe('login');
  });

  it('toggleRateLimitRule — calls update with correct fields', async () => {
    const q = setupQuery({ error: null });
    mockFrom.mockReturnValue(q);

    const { toggleRateLimitRule } = await importService();
    await toggleRateLimitRule('login', false);

    expect((q.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ is_active: false });
    expect((q.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('action', 'login');
  });

  it('clearBlock — deletes by id', async () => {
    const q = setupQuery({ error: null });
    mockFrom.mockReturnValue(q);

    const { clearBlock } = await importService();
    await clearBlock('rl-99');

    expect(mockFrom).toHaveBeenCalledWith('rate_limits');
    expect((q.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('id', 'rl-99');
  });

  it('getTopOffenders — aggregates hits by user_id across multiple rows', async () => {
    const q = setupQuery({
      data: [
        { user_id: 'u1', ip_address: '1.1.1.1', action: 'login',       hit_count: 10, users: { email: 'a@b.com' } },
        { user_id: 'u1', ip_address: '1.1.1.1', action: 'bind_device', hit_count: 5,  users: { email: 'a@b.com' } },
        { user_id: 'u2', ip_address: '2.2.2.2', action: 'login',       hit_count: 8,  users: { email: 'c@d.com' } },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(q);

    const { getTopOffenders } = await importService();
    const offenders = await getTopOffenders();

    // u1 should be first (15 total hits) and have both actions
    expect(offenders[0]?.user_id).toBe('u1');
    expect(offenders[0]?.total_hits).toBe(15);
    expect(offenders[0]?.actions).toEqual(expect.arrayContaining(['login', 'bind_device']));

    // u2 second
    expect(offenders[1]?.user_id).toBe('u2');
    expect(offenders[1]?.total_hits).toBe(8);
  });

  it('getTopOffenders — falls back gracefully when join fails', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return setupQuery({ data: null, error: { message: 'FK error' } });
      return setupQuery({
        data: [{ user_id: 'u1', ip_address: null, action: 'login', hit_count: 7 }],
        error: null,
      });
    });

    const { getTopOffenders } = await importService();
    const result = await getTopOffenders();

    expect(result).toHaveLength(1);
    expect(result[0]?.total_hits).toBe(7);
  });

  it('returns empty rules on unavailable table', async () => {
    const q = setupQuery({ data: null, error: { code: 'DB_ERROR', message: 'Connection failed' } });
    mockFrom.mockReturnValue(q);

    const { getRateLimitRules } = await importService();
    await expect(getRateLimitRules()).resolves.toEqual([]);
  });
});
