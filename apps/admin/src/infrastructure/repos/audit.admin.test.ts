import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getActivityLogsAdmin, getQueuedActivities } from './audit.admin';

// P1 (server/client boundary): privileged audit reads live in the
// server-only `./audit.admin` module. These tests pin the tenant-scoping
// contract the action boundary depends on.

const mockAdminFrom = vi.fn();
vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
  }),
}));

describe('audit.admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      then: vi.fn().mockImplementation((cb) => cb(resolvedValue)),
    };
    return mockQuery;
  };

  it('getActivityLogsAdmin prefers explicit tenantScope over caller filters', async () => {
    const q = setupQuery({ data: [], count: 0, error: null });
    mockAdminFrom.mockReturnValue(q);

    await getActivityLogsAdmin({ tenant_id: 'tenant-evil' } as never, 1, 20, 'tenant-a');

    expect(mockAdminFrom).toHaveBeenCalledWith('activity_logs');
    expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
  });

  it('getQueuedActivities queries activity_log_queue via admin client', async () => {
    const rows = [{ id: 'q1' }];
    const q = setupQuery({ data: rows, error: null });
    mockAdminFrom.mockReturnValue(q);

    const res = await getQueuedActivities(50);
    expect(mockAdminFrom).toHaveBeenCalledWith('activity_log_queue');
    expect(q.limit).toHaveBeenCalledWith(50);
    expect(q.eq).not.toHaveBeenCalled();
    expect(res).toEqual(rows);
  });

  it('getQueuedActivities filters by tenant_id when provided (IDOR guard)', async () => {
    const rows = [{ id: 'q1', tenant_id: 'tenant-a' }];
    const q = setupQuery({ data: rows, error: null });
    mockAdminFrom.mockReturnValue(q);

    await getQueuedActivities(50, 'tenant-a');

    expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
  });

  it('getQueuedActivities does not filter when tenantId is omitted (super_admin path)', async () => {
    const q = setupQuery({ data: [], error: null });
    mockAdminFrom.mockReturnValue(q);

    await getQueuedActivities(50);

    expect(q.eq).not.toHaveBeenCalled();
  });
});
