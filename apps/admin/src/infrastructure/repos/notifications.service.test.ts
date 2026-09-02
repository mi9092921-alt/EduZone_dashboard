import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getNotifications,
  sendNotification,
  deleteNotification,
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
} from './notifications.service';

import {
  getNotificationsAction,
  sendNotificationAction,
  deleteNotificationAction,
  getMyNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
  getUnreadNotificationCountAction,
} from '@/adapters/actions/admin.actions';

// notifications.service is a thin delegator to the admin server actions,
// which run the privileged, service-role Supabase calls behind an
// auth/permission check and scope every per-user query/mutation to the
// caller's own user_id (see admin.actions.ts). These tests verify the
// delegation contract: correct action called with correct args, and the
// result/error passed through unchanged. The query logic itself lives in
// admin.actions.ts and is covered by admin.actions.test.ts.
vi.mock('@/adapters/actions/admin.actions', () => ({
  getNotificationsAction: vi.fn(),
  sendNotificationAction: vi.fn(),
  deleteNotificationAction: vi.fn(),
  getMyNotificationsAction: vi.fn(),
  markNotificationAsReadAction: vi.fn(),
  markAllNotificationsAsReadAction: vi.fn(),
  getUnreadNotificationCountAction: vi.fn(),
}));

describe('notifications.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getNotifications delegates to getNotificationsAction with page/pageSize/audience', async () => {
    const payload = { data: [{ id: '1' }], count: 1, stats: { all: 1, students: 1, teachers: 0, admins: 0 } };
    (getNotificationsAction as any).mockResolvedValue(payload);

    const result = await getNotifications(1, 10, 'students');
    expect(getNotificationsAction).toHaveBeenCalledWith(1, 10, 'students');
    expect(result).toBe(payload);
  });

  it('getNotifications propagates errors from the action', async () => {
    (getNotificationsAction as any).mockRejectedValue(new Error('DB Error'));

    await expect(getNotifications(1, 10)).rejects.toThrow('DB Error');
  });

  it('sendNotification delegates to sendNotificationAction with input', async () => {
    const input = { title: 'Alert', body: 'System update tomorrow', target_audience: 'students' as const };
    (sendNotificationAction as any).mockResolvedValue('new-id');

    const result = await sendNotification(input);
    expect(sendNotificationAction).toHaveBeenCalledWith(input);
    expect(result).toBe('new-id');
  });

  it('deleteNotification delegates to deleteNotificationAction with id', async () => {
    (deleteNotificationAction as any).mockResolvedValue(undefined);

    await deleteNotification('notif-123');
    expect(deleteNotificationAction).toHaveBeenCalledWith('notif-123');
  });

  it('getMyNotifications delegates to getMyNotificationsAction with limit/unreadOnly', async () => {
    const payload = { data: [{ id: 'n1' }], unreadCount: 1 };
    (getMyNotificationsAction as any).mockResolvedValue(payload);

    const result = await getMyNotifications(20, true);
    expect(getMyNotificationsAction).toHaveBeenCalledWith(20, true);
    expect(result).toBe(payload);
  });

  it('markNotificationAsRead delegates to markNotificationAsReadAction with id', async () => {
    (markNotificationAsReadAction as any).mockResolvedValue(undefined);

    await markNotificationAsRead('n1');
    expect(markNotificationAsReadAction).toHaveBeenCalledWith('n1');
  });

  it('markAllNotificationsAsRead delegates to markAllNotificationsAsReadAction', async () => {
    (markAllNotificationsAsReadAction as any).mockResolvedValue(undefined);

    await markAllNotificationsAsRead();
    expect(markAllNotificationsAsReadAction).toHaveBeenCalledWith();
  });

  it('getUnreadNotificationCount delegates to getUnreadNotificationCountAction', async () => {
    (getUnreadNotificationCountAction as any).mockResolvedValue(3);

    const result = await getUnreadNotificationCount();
    expect(getUnreadNotificationCountAction).toHaveBeenCalledWith();
    expect(result).toBe(3);
  });
});
