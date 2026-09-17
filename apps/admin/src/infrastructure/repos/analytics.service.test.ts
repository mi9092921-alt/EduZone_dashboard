import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getUserStats,
  getCourseStats,
  getDailyActivity,
  getUserRegistrationTrend,
  getGeographicDistribution,
} from './analytics.service';

import { container } from '@/container';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  },
}));

const mockFrom = container.supabase.from as any;
const mockRpc = container.supabase.rpc as any;

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

describe('analytics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      then: vi.fn().mockImplementation((cb) => cb(resolvedValue)),
    };
    return mockQuery;
  };

  it('getUserStats returns MV data', async () => {
    mockRpc.mockResolvedValue({ data: { total_users: 100 }, error: null });
    const res = await getUserStats();
    expect(res.total_users).toBe(100);
  });

  it('getUserStats uses fallback on empty MV', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });

    const res = await getUserStats('t1');
    expect(res.total_users).toBe(0);
    expect(res.active_users).toBe(0);
  });

  it('getCourseStats returns mapped stats with course titles', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'vw_course_stats') {
        return setupQuery({ data: [{ course_id: 'c1', enrolled: 50 }], error: null });
      }
      if (table === 'courses') {
        return setupQuery({ data: [{ id: 'c1', title: 'React' }], error: null });
      }
      return setupQuery({ data: [], error: null });
    });

    const res = await getCourseStats('t1');
    expect(res).toEqual([{ course_id: 'c1', enrolled: 50, title: 'React' }]);
  });

  it('getCourseStats returns empty when the query fails', async () => {
    mockFrom.mockReturnValue(setupQuery({ data: null, error: new Error('unavailable') }));

    const res = await getCourseStats('t1');
    expect(res).toEqual([]);
  });

  it('getCourseStats queries through the injected server client, not the browser client', async () => {
    // The server action passes a cookie-bound server client: the browser
    // client carries no session server-side, so the security_invoker view
    // would return zero rows. The override must be the client actually used.
    const overrideFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'vw_course_stats') {
        return setupQuery({ data: [{ course_id: 'c2', enrolled: 3 }], error: null });
      }
      if (table === 'courses') {
        return setupQuery({ data: [{ id: 'c2', title: 'Vue' }], error: null });
      }
      return setupQuery({ data: [], error: null });
    });

    const res = await getCourseStats('t1', { from: overrideFrom } as any);

    expect(overrideFrom).toHaveBeenCalledWith('vw_course_stats');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(res).toEqual([{ course_id: 'c2', enrolled: 3, title: 'Vue' }]);
  });


  it('getDailyActivity', async () => {
    // v13: getDailyActivity delegates to get_daily_activity RPC which returns { date, count }
    mockRpc.mockResolvedValue({ data: [{ date: '2023-01-01', count: 5 }], error: null });
    const res = await getDailyActivity('t1');
    expect(res[0]!.enrollment_date).toBe('2023-01-01');
    expect(res[0]!.new_enrollments).toBe(5);
  });

  it('getUserRegistrationTrend groups dates', async () => {
    const today = new Date().toISOString().split('T')[0]!;
    mockFrom.mockReturnValue(setupQuery({ data: [{ created_at: today + 'T12:00:00Z' }] }));
    const res = await getUserRegistrationTrend(1);
    expect(res.find((r) => r.date === today)?.count).toBe(1);
  });

  it('getGeographicDistribution sorts counts and resolves region labels', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return setupQuery({
          data: [
            { region_id: 'us-east-1' },
            { region_id: 'us-east-1' },
            { region_id: 'me-south-1' },
          ],
        });
      }
      if (table === 'regions') {
        return setupQuery({
          data: [
            { id: 'us-east-1', label: 'US East (Virginia)' },
            { id: 'me-south-1', label: 'Middle East (Bahrain)' },
          ],
        });
      }
      return setupQuery({ data: [], error: null });
    });
    const res = await getGeographicDistribution('t1');
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({
      country_code: 'us-east-1',
      label: 'US East (Virginia)',
      user_count: 2,
    });
    expect(res[1]).toEqual({
      country_code: 'me-south-1',
      label: 'Middle East (Bahrain)',
      user_count: 1,
    });
  });
});
