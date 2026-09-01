import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getActivityLogs,
  getActivityLogsForVerification,
  getPrecedingLogEntryHash,
  getAuditChainState,
  flushActivityLogs,
  getQueuedActivities,
} from './audit.service';

import { container } from '@/container';

// Mock the container
vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
    },
  },
}));

vi.mock('@/application/actions/admin.actions', () => ({
  getQueuedActivitiesAction: vi.fn(),
}));

describe('audit.service', () => {
  const mockFrom = container.supabase.from as any;
  const mockRpc = container.supabase.rpc as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      then: vi.fn().mockImplementation((cb) => cb(resolvedValue)),
    };
    return mockQuery;
  };

  it('getActivityLogs filters and paginates', async () => {
    const q = setupQuery({ data: [{ id: 'l1' }], count: 1, error: null });
    mockFrom.mockReturnValue(q);

    const res = await getActivityLogs({}, 1, 10);
    expect(res.data).toHaveLength(1);
    expect(q.range).toHaveBeenCalledWith(0, 9);
  });

  it('flushActivityLogs handles success', async () => {
    const mockQuery = {
      single: vi.fn().mockResolvedValue({ data: 42, error: null }),
    };
    mockRpc.mockReturnValue(mockQuery);

    const flushed = await flushActivityLogs(100);
    expect(mockRpc).toHaveBeenCalledWith('flush_activity_logs', { p_batch_size: 100 });
    expect(flushed).toBe(42);
  });

  it('getActivityLogsForVerification', async () => {
    const q = setupQuery({ data: [{ id: 'l1' }], error: null });
    mockFrom.mockReturnValue(q);
    const res = await getActivityLogsForVerification('2023-01-01', '2023-12-31');
    expect(res).toHaveLength(1);
    expect(q.gte).toHaveBeenCalledWith('created_at', '2023-01-01');
    expect(q.lte).toHaveBeenCalledWith('created_at', '2023-12-31');
    expect(mockFrom).toHaveBeenCalledWith('activity_logs');
  });

  it('getAuditChainState returns single row', async () => {
    const q = setupQuery({ data: { last_seq: 100 }, error: null });
    mockFrom.mockReturnValue(q);
    const res = await getAuditChainState();
    expect(res.last_seq).toBe(100);
    expect(mockFrom).toHaveBeenCalledWith('audit_chain_state');
    expect(q.eq).toHaveBeenCalledWith('id', 1);
  });

  describe('getPrecedingLogEntryHash', () => {
    it('returns null for seq 1 without querying (no predecessor exists)', async () => {
      const res = await getPrecedingLogEntryHash(1);
      expect(res).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('returns null for seq <= 0 without querying', async () => {
      const res = await getPrecedingLogEntryHash(0);
      expect(res).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('fetches the entry_hash of seq - 1 independently', async () => {
      const q = setupQuery({ data: { entry_hash: 'abc123' }, error: null });
      mockFrom.mockReturnValue(q);

      const res = await getPrecedingLogEntryHash(42);
      expect(mockFrom).toHaveBeenCalledWith('activity_logs');
      expect(q.eq).toHaveBeenCalledWith('seq', 41);
      expect(res).toBe('abc123');
    });

    it('returns null when the predecessor row is not found', async () => {
      const q = setupQuery({ data: null, error: null });
      mockFrom.mockReturnValue(q);

      const res = await getPrecedingLogEntryHash(42);
      expect(res).toBeNull();
    });

    it('propagates query errors', async () => {
      const q = setupQuery({ data: null, error: { message: 'RLS denied' } });
      mockFrom.mockReturnValue(q);

      await expect(getPrecedingLogEntryHash(42)).rejects.toBeTruthy();
    });
  });

  it('flushActivityLogs handles lock contention', async () => {
    const mockQuery = {
      single: vi
        .fn()
        .mockResolvedValue({ error: { message: 'could not obtain lock', code: '55P03' } }),
    };
    mockRpc.mockReturnValue(mockQuery);

    let errorThrown = false;
    try {
      await flushActivityLogs();
    } catch (err: any) {
      errorThrown = true;
      expect(err.code).toBe('LOCK_CONTENTION');
    }
    expect(errorThrown).toBe(true);
  });

  it('getQueuedActivities delegates to getQueuedActivitiesAction', async () => {
    const { getQueuedActivitiesAction } = await import('@/application/actions/admin.actions');
    const rows = [{ id: 'q1' }];
    (getQueuedActivitiesAction as any).mockResolvedValue(rows);

    const res = await getQueuedActivities(50);
    expect(getQueuedActivitiesAction).toHaveBeenCalledWith(50);
    expect(res).toBe(rows);
  });
});
