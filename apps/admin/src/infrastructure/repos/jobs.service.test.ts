import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getJobs,
  getJobStatusCounts,
  retryJob,
  cancelJob,
  releaseStaleJobs,
} from './jobs.service';

import {
  getJobsAction,
  getJobStatusCountsAction,
  retryJobAction,
  cancelJobAction,
  releaseStaleJobsAction,
} from '@/application/actions/admin.actions';

// jobs.service is a thin delegator to the admin server actions (which run the
// privileged, service-role RPC calls behind an auth/permission check). These
// tests verify the delegation contract: correct action called with correct
// args, and the result/error passed through unchanged. The RPC/pagination
// logic itself lives in admin.actions.ts.
vi.mock('@/application/actions/admin.actions', () => ({
  getJobsAction: vi.fn(),
  getJobStatusCountsAction: vi.fn(),
  retryJobAction: vi.fn(),
  cancelJobAction: vi.fn(),
  releaseStaleJobsAction: vi.fn(),
}));

describe('jobs.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getJobs', () => {
    it('delegates to getJobsAction with filters/page/pageSize', async () => {
      const paginated = { data: [{ id: 'j1' }], count: 1, page: 1, pageSize: 10, totalPages: 1 };
      (getJobsAction as any).mockResolvedValue(paginated);

      const result = await getJobs({ status: 'failed' }, 1, 10);
      expect(getJobsAction).toHaveBeenCalledWith({ status: 'failed' }, 1, 10);
      expect(result).toBe(paginated);
    });

    it('propagates errors from the action', async () => {
      (getJobsAction as any).mockRejectedValue(new Error('fail'));
      await expect(getJobs({}, 1, 10)).rejects.toThrow('fail');
    });
  });

  describe('getJobStatusCounts', () => {
    it('delegates to getJobStatusCountsAction', async () => {
      const counts = { pending: 5, processing: 2, done: 100, failed: 3, dead: 1 };
      (getJobStatusCountsAction as any).mockResolvedValue(counts);

      const result = await getJobStatusCounts();
      expect(getJobStatusCountsAction).toHaveBeenCalledWith();
      expect(result).toBe(counts);
    });
  });

  describe('retryJob', () => {
    it('delegates to retryJobAction with the job id', async () => {
      (retryJobAction as any).mockResolvedValue(undefined);
      await retryJob('j1');
      expect(retryJobAction).toHaveBeenCalledWith('j1');
    });

    it('propagates errors from the action', async () => {
      (retryJobAction as any).mockRejectedValue(new Error('fail'));
      await expect(retryJob('j1')).rejects.toThrow('fail');
    });
  });

  describe('cancelJob', () => {
    it('delegates to cancelJobAction with the job id', async () => {
      (cancelJobAction as any).mockResolvedValue(undefined);
      await cancelJob('j1');
      expect(cancelJobAction).toHaveBeenCalledWith('j1');
    });

    it('propagates errors from the action', async () => {
      (cancelJobAction as any).mockRejectedValue(new Error('cancelled'));
      await expect(cancelJob('j1')).rejects.toThrow('cancelled');
    });
  });

  describe('releaseStaleJobs', () => {
    it('delegates to releaseStaleJobsAction and returns the released count', async () => {
      (releaseStaleJobsAction as any).mockResolvedValue(7);
      const result = await releaseStaleJobs();
      expect(releaseStaleJobsAction).toHaveBeenCalledWith();
      expect(result).toBe(7);
    });

    it('returns 0 when no stale jobs', async () => {
      (releaseStaleJobsAction as any).mockResolvedValue(0);
      const result = await releaseStaleJobs();
      expect(result).toBe(0);
    });

    it('propagates errors from the action', async () => {
      (releaseStaleJobsAction as any).mockRejectedValue(new Error('RPC failed'));
      await expect(releaseStaleJobs()).rejects.toThrow('RPC failed');
    });
  });
});
