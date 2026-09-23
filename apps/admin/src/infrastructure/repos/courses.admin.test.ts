import { describe, it, expect, vi, beforeEach } from 'vitest';

import { deleteCourse, getCourseStats, getCourseTenantId } from './courses.admin';

// P1 (server/client boundary): privileged course reads/writes live in the
// server-only `./courses.admin` module. These tests pin their fail-closed
// contracts — the action boundary's IDOR guard depends on them.

const mockAdminFrom = vi.fn();
vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
  }),
}));

describe('courses.admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      update: vi.fn().mockReturnThis(),
    };
    return mockQuery;
  };

  it('deleteCourse updates deleted_at using admin client', async () => {
    const q = setupQuery({ data: null, error: null });
    mockAdminFrom.mockReturnValue(q);
    await deleteCourse('c1');
    expect(mockAdminFrom).toHaveBeenCalledWith('courses');
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(q.eq).toHaveBeenCalledWith('id', 'c1');
  });

  describe('getCourseTenantId (cross-tenant IDOR guard support)', () => {
    it('returns the owning tenant_id for an existing course', async () => {
      mockAdminFrom.mockReturnValue(setupQuery({ data: { tenant_id: 't-1' }, error: null }));
      const result = await getCourseTenantId('c1');
      expect(mockAdminFrom).toHaveBeenCalledWith('courses');
      expect(result).toBe('t-1');
    });

    it('returns null when the course does not exist', async () => {
      mockAdminFrom.mockReturnValue(setupQuery({ data: null, error: null }));
      const result = await getCourseTenantId('missing');
      expect(result).toBeNull();
    });

    it('returns null on query error (fails closed)', async () => {
      mockAdminFrom.mockReturnValue(setupQuery({ data: null, error: { message: 'db down' } }));
      const result = await getCourseTenantId('c1');
      expect(result).toBeNull();
    });
  });

  it('getCourseStats handles success and catch block', async () => {
    const qSuccess = setupQuery({ data: { course_id: 'c1' }, error: null });
    mockAdminFrom.mockReturnValueOnce(qSuccess);
    const stats = await getCourseStats('c1');
    expect(stats!.course_id).toBe('c1');

    const qFail = setupQuery({ data: null, error: new Error('fail') });
    mockAdminFrom.mockReturnValueOnce(qFail);
    const stats2 = await getCourseStats('c1');
    expect(stats2).toBeNull();
  });
});
