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

describe('Notifications Service', () => {
  const mockSupabase = container.supabase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should fetch notifications with correct range and order', async () => {
      const mockData = [{ id: '1', title: 'Test' }];
      const mockSelect = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockRange = vi.fn().mockResolvedValue({ data: mockData, error: null, count: 1 } as any);

      vi.mocked(mockSupabase.from).mockReturnValue({
        select: mockSelect,
        order: mockOrder,
        range: mockRange,
      } as any);

      // Service uses 1-indexed pages: page=1 → from=0, to=9
      const result = await getNotifications(1, 10);

      expect(mockSupabase.from).toHaveBeenCalledWith('notifications');
      expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockRange).toHaveBeenCalledWith(0, 9);
      expect(result).toEqual({ data: mockData, count: 1 });
    });

    it('should throw error if supabase fails', async () => {
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'DB Error' } } as any),
      } as any);

      await expect(getNotifications(0, 10)).rejects.toThrow('DB Error');
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
