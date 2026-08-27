import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getJobs,
  getJobStatusCounts,
  retryJob,
  cancelJob,
  releaseStaleJobs,
} from './jobs.service';
import { container } from '@/container';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
    },
  },
}));

describe('jobs.service', () => {
  const mockRpc = container.supabase.rpc as any;
  const mockFrom = container.supabase.from as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getJobs ────────────────────────────────────────────────
  describe('getJobs', () => {
    it('returns paginated jobs', async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: 'j1', job_type: 'bulk_lock', full_count: 5 }],
        error: null,
      });

      const result = await getJobs({}, 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.count).toBe(5);
      expect(result.totalPages).toBe(1);
      expect(mockRpc).toHaveBeenCalledWith('admin_get_jobs', expect.objectContaining({
        p_page: 1,
        p_page_size: 10,
      }));
    });

    it('applies status filter', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await getJobs({ status: 'failed' }, 1, 10);
      expect(mockRpc).toHaveBeenCalledWith('admin_get_jobs', expect.objectContaining({
        p_status: 'failed',
      }));
    });

    it('applies job_type filter', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await getJobs({ job_type: 'bulk_export' }, 1, 10);
      expect(mockRpc).toHaveBeenCalledWith('admin_get_jobs', expect.objectContaining({
        p_job_type: 'bulk_export',
      }));
    });

    it('applies dateFrom filter', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await getJobs({ dateFrom: '2026-01-01' }, 1, 10);
      expect(mockRpc).toHaveBeenCalledWith('admin_get_jobs', expect.objectContaining({
        p_date_from: '2026-01-01',
      }));
    });

    it('calculates pagination correctly', async () => {
      // 45 total results across 3 pages of 20
      const rows = Array.from({ length: 20 }, (_, i) => ({ id: `j${i}`, full_count: 45 }));
      mockRpc.mockResolvedValue({ data: rows, error: null });

      const result = await getJobs({}, 2, 20);
      expect(result.totalPages).toBe(3);
      expect(result.count).toBe(45);
    });

    it('throws on error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });

      await expect(getJobs({}, 1, 10)).rejects.toBeDefined();
    });
  });

  // ── getJobStatusCounts ─────────────────────────────────────
  describe('getJobStatusCounts', () => {
    it('returns counts for all statuses', async () => {
      mockRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { pending: 5, processing: 2, done: 100, failed: 3, dead: 1 },
          error: null,
        }),
      });

      const result = await getJobStatusCounts();
      expect(result.pending).toBeDefined();
      expect(result.processing).toBeDefined();
      expect(result.done).toBeDefined();
      expect(result.failed).toBeDefined();
      expect(result.dead).toBeDefined();
      expect(mockRpc).toHaveBeenCalledWith('admin_get_job_counts');
    });
  });

  // ── retryJob ───────────────────────────────────────────────
  describe('retryJob', () => {
    it('calls admin_retry_job RPC', async () => {
      mockRpc.mockResolvedValue({ error: null });

      await retryJob('j1');
      expect(mockRpc).toHaveBeenCalledWith('admin_retry_job', { p_id: 'j1' });
    });

    it('throws on RPC error', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'fail' } });
      await expect(retryJob('j1')).rejects.toBeDefined();
    });
  });

  // ── cancelJob ──────────────────────────────────────────────
  describe('cancelJob', () => {
    it('calls admin_cancel_job RPC', async () => {
      mockRpc.mockResolvedValue({ error: null });

      await cancelJob('j1');
      expect(mockRpc).toHaveBeenCalledWith('admin_cancel_job', { p_id: 'j1' });
    });

    it('throws on RPC error', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'cancelled' } });
      await expect(cancelJob('j1')).rejects.toBeDefined();
    });
  });

  // ── releaseStaleJobs ───────────────────────────────────────
  describe('releaseStaleJobs', () => {
    it('calls RPC and returns released count', async () => {
      mockRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: 7, error: null }),
      });

      const result = await releaseStaleJobs();
      expect(result).toBe(7);
      expect(mockRpc).toHaveBeenCalledWith('release_stale_job_locks');
    });

    it('returns 0 when no stale jobs', async () => {
      mockRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await releaseStaleJobs();
      expect(result).toBe(0);
    });

    it('throws on RPC error', async () => {
      mockRpc.mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC failed' } }),
      });

      await expect(releaseStaleJobs()).rejects.toEqual({ message: 'RPC failed' });
    });
  });
});
