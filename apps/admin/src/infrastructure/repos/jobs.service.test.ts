import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * jobs.service tests
 *
 * The service now owns the admin DB logic directly via createAdminClient.
 * We mock the admin module to return a chainable RPC stub and verify
 * that the service calls the correct RPC functions with the correct arguments.
 */

// ── Mock createAdminClient ────────────────────────────────────────────────────
const mockRpcSingle = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAdmin = { rpc: mockRpc, from: mockFrom };

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}));

import { getJobs, getJobStatusCounts, retryJob, cancelJob, releaseStaleJobs } from './jobs.service';

describe('jobs.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: successful RPC with empty data
    mockRpcSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockReturnValue({ single: mockRpcSingle, data: [], error: null });
  });

  describe('getJobs', () => {
    it('calls admin_get_jobs RPC with correct parameters', async () => {
      const mockRows = [{ full_count: '2', id: 'j1', tenant_id: null, job_type: 'email', payload: {}, status: 'pending', priority: 5, attempts: 0, max_attempts: 3, locked_by: null, locked_at: null, lock_expires_at: null, run_at: '2026-01-01', started_at: null, completed_at: null, error_msg: null, created_at: '2026-01-01' }, { full_count: '2', id: 'j2', tenant_id: null, job_type: 'email', payload: {}, status: 'done', priority: 5, attempts: 1, max_attempts: 3, locked_by: null, locked_at: null, lock_expires_at: null, run_at: '2026-01-01', started_at: null, completed_at: null, error_msg: null, created_at: '2026-01-01' }];
      mockRpc.mockReturnValueOnce({ data: mockRows, error: null });

      const result = await getJobs({ status: 'pending' }, 1, 10);
      expect(mockRpc).toHaveBeenCalledWith('admin_get_jobs', {
        p_page: 1,
        p_page_size: 10,
        p_status: 'pending',
        p_job_type: null,
        p_date_from: null,
      });
      expect(result.count).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('returns empty paginated result when RPC returns empty array', async () => {
      mockRpc.mockReturnValueOnce({ data: [], error: null });
      const result = await getJobs({}, 1, 20);
      expect(result.count).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('propagates RPC errors', async () => {
      mockRpc.mockReturnValueOnce({ data: null, error: new Error('fail') });
      // M10: errors are mapped to InfrastructureError (raw text masked)
      await expect(getJobs({}, 1, 10)).rejects.toBeInstanceOf(Error);
    });
  });

  describe('getJobStatusCounts', () => {
    it('calls admin_get_job_counts RPC', async () => {
      const counts = { pending: 5, processing: 2, done: 100, failed: 3, dead: 1 };
      mockRpcSingle.mockResolvedValueOnce({ data: counts, error: null });
      const result = await getJobStatusCounts();
      expect(mockRpc).toHaveBeenCalledWith('admin_get_job_counts');
      expect(result).toEqual(counts);
    });
  });

  describe('retryJob', () => {
    it('calls admin_retry_job RPC with the job id', async () => {
      mockRpc.mockReturnValueOnce({ data: null, error: null });
      await retryJob('j1');
      expect(mockRpc).toHaveBeenCalledWith('admin_retry_job', { p_id: 'j1' });
    });

    it('propagates errors', async () => {
      mockRpc.mockReturnValueOnce({ data: null, error: new Error('fail') });
      // M10: errors are mapped to InfrastructureError (raw text masked)
      await expect(retryJob('j1')).rejects.toBeInstanceOf(Error);
    });
  });

  describe('cancelJob', () => {
    it('calls admin_cancel_job RPC with the job id', async () => {
      mockRpc.mockReturnValueOnce({ data: null, error: null });
      await cancelJob('j1');
      expect(mockRpc).toHaveBeenCalledWith('admin_cancel_job', { p_id: 'j1' });
    });

    it('propagates errors', async () => {
      mockRpc.mockReturnValueOnce({ data: null, error: new Error('cancelled') });
      // M10: errors are mapped to InfrastructureError (raw text masked)
      await expect(cancelJob('j1')).rejects.toBeInstanceOf(Error);
    });
  });

  describe('releaseStaleJobs', () => {
    it('calls release_stale_job_locks RPC and returns released count', async () => {
      mockRpcSingle.mockResolvedValueOnce({ data: 7, error: null });
      const result = await releaseStaleJobs();
      expect(mockRpc).toHaveBeenCalledWith('release_stale_job_locks');
      expect(result).toBe(7);
    });

    it('returns 0 when no stale jobs', async () => {
      mockRpcSingle.mockResolvedValueOnce({ data: 0, error: null });
      const result = await releaseStaleJobs();
      expect(result).toBe(0);
    });

    it('propagates RPC errors', async () => {
      mockRpcSingle.mockResolvedValueOnce({ data: null, error: new Error('RPC failed') });
      // M10: errors are mapped to InfrastructureError (raw text masked)
      await expect(releaseStaleJobs()).rejects.toBeInstanceOf(Error);
    });
  });
});

