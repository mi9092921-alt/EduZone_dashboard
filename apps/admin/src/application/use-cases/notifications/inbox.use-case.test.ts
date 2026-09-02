import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  GetMyNotificationsUseCase,
  GetUnreadNotificationCountUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from './inbox.use-case';

import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import type { UserNotification } from '@/domain/types/notification.types';


function makeRepo(overrides: Partial<INotificationAdminRepository> = {}): INotificationAdminRepository {
  return {
    resolveTargetUserIds: vi.fn(),
    insertNotification: vi.fn(),
    attachNotificationTargets: vi.fn(),
    fanoutToUsers: vi.fn(),
    triggerInstantPush: vi.fn(),
    listForAdmin: vi.fn(),
    softDelete: vi.fn(),
    listMine: vi.fn().mockResolvedValue([]),
    countMine: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as INotificationAdminRepository;
}

describe('inbox use cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GetMyNotificationsUseCase', () => {
    it('returns rows and unread count for the caller only', async () => {
      const repo = makeRepo();
      const rows = [{ id: 'n1', is_read: false }] as unknown as UserNotification[];
      (repo.listMine as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
      (repo.countMine as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await new GetMyNotificationsUseCase(repo).execute('user-1', 20, false);

      expect(repo.listMine).toHaveBeenCalledWith('user-1', 20, false);
      expect(repo.countMine).toHaveBeenCalledWith('user-1', true);
      expect(result).toEqual({ data: rows, unreadCount: 3 });
    });

    it('degrades to an empty inbox when the read fails', async () => {
      const repo = makeRepo({
        listMine: vi.fn().mockRejectedValue(new Error('RLS denied')),
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await new GetMyNotificationsUseCase(repo).execute('user-1', 20, true);

      expect(result).toEqual({ data: [], unreadCount: 0 });
      expect(consoleSpy).toHaveBeenCalledWith('[getMyNotificationsAction]', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('MarkNotificationReadUseCase', () => {
    it('marks a single row read scoped to the owner', async () => {
      const repo = makeRepo();

      await new MarkNotificationReadUseCase(repo).execute('user-1', 'n1');

      expect(repo.markRead).toHaveBeenCalledWith('user-1', 'n1');
    });
  });

  describe('MarkAllNotificationsReadUseCase', () => {
    it('marks all rows read for the owner', async () => {
      const repo = makeRepo();

      await new MarkAllNotificationsReadUseCase(repo).execute('user-1');

      expect(repo.markAllRead).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GetUnreadNotificationCountUseCase', () => {
    it('returns the unread count', async () => {
      const repo = makeRepo();
      (repo.countMine as ReturnType<typeof vi.fn>).mockResolvedValue(7);

      const result = await new GetUnreadNotificationCountUseCase(repo).execute('user-1');

      expect(repo.countMine).toHaveBeenCalledWith('user-1', true);
      expect(result).toBe(7);
    });

    it('returns 0 when the count fails', async () => {
      const repo = makeRepo({
        countMine: vi.fn().mockRejectedValue(new Error('boom')),
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await new GetUnreadNotificationCountUseCase(repo).execute('user-1');

      expect(result).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('[getUnreadNotificationCountAction]', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
