// @vitest-environment node
//
// notifications.service.ts is isomorphic (typeof window !== 'undefined' picks
// the server-action branch); these tests target the container.supabase
// branch, which requires no global `window` (jsdom, the default unit-test
// environment, defines one).
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getNotifications, sendNotification, deleteNotification } from './notifications.service';

import { container } from '@/container';

// Mock the container and supabase client
vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  },
}));

/**
 * Supabase's real query builder is "thenable" — you can `await` it after any
 * number of chained filter/order calls, not just after a fixed final method.
 * This mock mirrors that so it doesn't need to hard-code an exact call
 * sequence (select -> is -> eq? -> order -> range).
 */
function createThenableChain(result: unknown) {
  const chain: any = {};
  const methods = ['select', 'eq', 'is', 'order', 'range', 'limit', 'update'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

describe('Notifications Service', () => {
  const mockSupabase = container.supabase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should fetch notifications with correct range and order', async () => {
      const mockData = [{ id: '1', title: 'Test', target_audience: 'students' }];
      let paginatedChain: any;
      // First call: the paginated `notifications` query. Second call: the
      // unpaginated stats query (getNotifications fetches both).
      vi.mocked(mockSupabase.from).mockImplementationOnce(() => {
        paginatedChain = createThenableChain({ data: mockData, error: null, count: 1 });
        return paginatedChain;
      }).mockImplementationOnce(() =>
        createThenableChain({ data: mockData, error: null }),
      );

      // Service uses 1-indexed pages: page=1 → from=0, to=9
      const result = await getNotifications(1, 10);

      expect(mockSupabase.from).toHaveBeenCalledWith('notifications');
      expect(paginatedChain.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(paginatedChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(paginatedChain.range).toHaveBeenCalledWith(0, 9);
      expect(result.data).toEqual(mockData);
      expect(result.count).toBe(1);
      expect(result.stats).toEqual({ all: 1, students: 1, teachers: 0, admins: 0 });
    });

    it('should throw error if supabase fails', async () => {
      vi.mocked(mockSupabase.from).mockReturnValue(
        createThenableChain({ data: null, error: { code: 'PGRST116', message: 'DB Error' } }),
      );

      await expect(getNotifications(1, 10)).rejects.toThrow('DB Error');
    });
  });

  describe('sendNotification', () => {
    it('should call send_notification RPC with correct arguments', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: 'new-id', error: null } as any);

      const input = {
        title: 'Alert',
        body: 'System update tomorrow',
        target_audience: 'students' as const,
      };

      const result = await sendNotification(input);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('send_notification', {
        p_title: 'Alert',
        p_body: 'System update tomorrow',
        p_target_audience: 'students',
      });
      expect(result).toBe('new-id');
    });

    it('should use target_user_ids and omit target_permission when both provided', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: 'id-2', error: null } as any);

      const input = {
        title: 'Private',
        body: 'Secret message',
        target_permission: 'admin.super', // this should be ignored when target_user_ids is set
        target_user_ids: ['u1', 'u2'],
      };

      await sendNotification(input);

      // Service logic: when target_user_ids is present, omit p_target_audience & p_target_permission
      // to avoid triggering the role-based permission gate in the DB function.
      expect(mockSupabase.rpc).toHaveBeenCalledWith('send_notification', {
        p_title: 'Private',
        p_body: 'Secret message',
        p_target_user_ids: ['u1', 'u2'],
        // p_target_permission is intentionally absent
      });
    });

    it('should throw error if RPC fails', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST204', message: 'RPC Error' } } as any);

      await expect(sendNotification({ title: 'T', body: 'B' })).rejects.toThrow('RPC Error');
    });
  });

  describe('deleteNotification', () => {
    it('should call delete_notification RPC', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ error: null } as any);

      await deleteNotification('notif-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_notification', {
        p_notification_id: 'notif-123',
      });
    });

    it('should throw error if delete RPC fails', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ error: { code: 'PGRST205', message: 'Delete Failed' } } as any);

      await expect(deleteNotification('id')).rejects.toThrow('Delete Failed');
    });
  });
});
