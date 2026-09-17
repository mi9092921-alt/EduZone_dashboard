import { describe, expect, it, vi } from 'vitest';

import { processCourseNotifyJobs } from './jobs-rpc.service';

describe('jobs-rpc.service course notifications', () => {
  it('calls the batched course notification RPC with worker and limit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 8, error: null });
    const admin = { rpc } as never;

    await expect(processCourseNotifyJobs(admin, 'worker-1', 50)).resolves.toBe(8);
    expect(rpc).toHaveBeenCalledWith('process_course_notify_jobs', {
      p_worker_id: 'worker-1',
      p_limit: 50,
    });
  });

  it('maps RPC failures instead of swallowing them', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'worker failed', details: '', hint: '' },
    });
    const admin = { rpc } as never;

    await expect(processCourseNotifyJobs(admin, 'worker-1', 50)).rejects.toBeInstanceOf(Error);
  });
});
