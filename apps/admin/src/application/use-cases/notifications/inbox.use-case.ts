import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import type { MyNotificationsResult } from '@/domain/types/notification.types';

/**
 * Per-user inbox use cases (NotificationBell).
 *
 * Business rules (moved verbatim from the former fat actions):
 *  - Every query/mutation is scoped to the caller's own user_id.
 *  - Inbox read failures degrade gracefully to an empty inbox / zero
 *    unread count (never break the shell UI) — logged server-side.
 *  - Unread count is always the is_read=false total, independent of the
 *    list filter.
 */
export class GetMyNotificationsUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

  async execute(userId: string, limit: number, unreadOnly: boolean): Promise<MyNotificationsResult> {
    try {
      const data = await this.notifications.listMine(userId, limit, unreadOnly);
      const unreadCount = await this.notifications.countMine(userId, true);
      return { data, unreadCount };
    } catch (error) {
      console.error('[getMyNotificationsAction]', error);
      return { data: [], unreadCount: 0 };
    }
  }
}

export class MarkNotificationReadUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    return this.notifications.markRead(userId, id);
  }
}

export class MarkAllNotificationsReadUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

  async execute(userId: string): Promise<void> {
    return this.notifications.markAllRead(userId);
  }
}

export class GetUnreadNotificationCountUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

  async execute(userId: string): Promise<number> {
    try {
      return await this.notifications.countMine(userId, true);
    } catch (error) {
      console.error('[getUnreadNotificationCountAction]', error);
      return 0;
    }
  }
}
