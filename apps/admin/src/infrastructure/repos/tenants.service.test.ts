import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getTenants,
  getTenantById,
  getTenantAuditLogs,
} from './tenants.service';

import { container } from '@/container';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  },
}));

describe('tenants.service', () => {
  const mockFrom = container.supabase.from as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };
    return mockQuery;
  };

  // ── getTenants ─────────────────────────────────────────────
  describe('getTenants', () => {
    it('returns paginated tenants', async () => {
      const q = setupQuery({ data: [{ id: 't1', name: 'Tenant 1' }], count: 1, error: null });
      q.range.mockResolvedValue({ data: [{ id: 't1', name: 'Tenant 1' }], count: 1, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getTenants({}, 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(mockFrom).toHaveBeenCalledWith('tenants');
      expect(q.is).toHaveBeenCalledWith('deleted_at', null);
    });

    it('applies search filter', async () => {
      const q = setupQuery({ data: [], count: 0, error: null });
      mockFrom.mockReturnValue(q);

      await getTenants({ search: 'academy' }, 1, 10);
      expect(q.or).toHaveBeenCalledWith(expect.stringContaining('name.ilike.%academy%'));
    });

    it('applies plan filter', async () => {
      const q = setupQuery({ data: [], count: 0, error: null });
      mockFrom.mockReturnValue(q);

      await getTenants({ plan: 'pro' }, 1, 10);
      expect(q.eq).toHaveBeenCalledWith('plan', 'pro');
    });

    it('applies status filter', async () => {
      const q = setupQuery({ data: [], count: 0, error: null });
      mockFrom.mockReturnValue(q);

      await getTenants({ status: 'active' }, 1, 10);
      expect(q.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('applies region_id filter', async () => {
      const q = setupQuery({ data: [], count: 0, error: null });
      mockFrom.mockReturnValue(q);

      await getTenants({ region_id: 'me-south-1' }, 1, 10);
      expect(q.eq).toHaveBeenCalledWith('region_id', 'me-south-1');
    });

    it('calculates correct pagination range', async () => {
      const q = setupQuery({ data: [], count: 0, error: null });
      mockFrom.mockReturnValue(q);

      await getTenants({}, 3, 20);
      expect(q.range).toHaveBeenCalledWith(40, 59);
    });

    it('throws on Supabase error', async () => {
      const q = setupQuery({ data: null, count: null, error: { message: 'DB error' } });
      mockFrom.mockReturnValue(q);

      // range() is terminal in our chain, so we mock the final resolution
      q.range.mockResolvedValue({ data: null, count: null, error: { message: 'DB error' } });
      // M10: errors are mapped to InfrastructureError (raw text masked)
      await expect(getTenants({}, 1, 10)).rejects.toBeInstanceOf(Error);
    });
  });

  // ── getTenantById ──────────────────────────────────────────
  describe('getTenantById', () => {
    it('returns a single tenant', async () => {
      const q = setupQuery({ data: { id: 't1', name: 'Test' }, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getTenantById('t1');
      expect(result.id).toBe('t1');
      expect(q.eq).toHaveBeenCalledWith('id', 't1');
    });

    it('throws on not found', async () => {
      const q = setupQuery({ data: null, error: { message: 'Not found', code: 'PGRST116' } });
      mockFrom.mockReturnValue(q);

      await expect(getTenantById('missing')).rejects.toBeDefined();
    });
  });

  // ── getTenantAuditLogs ─────────────────────────────────────
  describe('getTenantAuditLogs', () => {
    it('returns paginated audit logs for tenant', async () => {
      const q = setupQuery({ data: [{ id: 'log1' }], count: 1, error: null });
      q.range.mockResolvedValue({ data: [{ id: 'log1' }], count: 1, error: null });
      mockFrom.mockReturnValue(q);

      const result = await getTenantAuditLogs('t1', {}, 1, 10);
      expect(result.data).toHaveLength(1);
      expect(mockFrom).toHaveBeenCalledWith('activity_logs');
      expect(q.eq).toHaveBeenCalledWith('tenant_id', 't1');
    });

    it('applies audit filters', async () => {
      const q = setupQuery({ data: [], count: 0, error: null });
      mockFrom.mockReturnValue(q);

      await getTenantAuditLogs(
        't1',
        {
          activity_type: ['login'],
          risk_level: ['high'],
          dateFrom: '2026-01-01',
          dateTo: '2026-12-31',
        },
        1,
        10,
      );

      // Service uses .in() for array filters (single-element arrays are still passed as arrays)
      expect(q.in).toHaveBeenCalledWith('activity_type', ['login']);
      expect(q.in).toHaveBeenCalledWith('risk_level', ['high']);
      expect(q.gte).toHaveBeenCalledWith('created_at', '2026-01-01');
      expect(q.lte).toHaveBeenCalledWith('created_at', '2026-12-31');
    });
  });
});
