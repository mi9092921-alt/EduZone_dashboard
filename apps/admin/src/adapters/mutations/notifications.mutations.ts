import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queries/keys';
import type { TargetAudience, UserNotification } from '../queries/notifications.queries';

import {
  sendNotification,
  deleteNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/infrastructure/repos/notifications.service';

export interface SendNotificationInput {
  title: string;
  body: string;
  target_audience?: TargetAudience;
  target_permission?: string | null;
  target_user_ids?: string[] | null;
}

export function useSendNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendNotificationInput) => sendNotification(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

// ─── Per-user inbox mutations ──────────────────────────────────────────────────

/**
 * P11-NOTIFY-001: Mark a single notification as read.
 * Optimistically updates the cached inbox immediately.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    // Optimistic update — flip is_read immediately, no loading flicker
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.allMine });

      const previous = queryClient.getQueryData(queryKeys.notifications.mine(20, false));

      queryClient.setQueryData(
        queryKeys.notifications.mine(20, false),
        (old: { data: UserNotification[]; unreadCount: number } | undefined) => {
          if (!old) return old;
          const wasUnread = old.data.find((n) => n.id === id && !n.is_read);
          return {
            data: old.data.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
            unreadCount: wasUnread ? Math.max(0, old.unreadCount - 1) : old.unreadCount,
          };
        },
      );

      // Also decrement the standalone unread count key
      queryClient.setQueryData(
        queryKeys.notifications.unreadCount,
        (old: number | undefined) => Math.max(0, (old ?? 1) - 1),
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      // Roll back on failure
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.mine(20, false), context.previous);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
    },
  });
}

/**
 * P11-NOTIFY-001: Mark ALL notifications as read.
 * Optimistically zeros the unread count immediately.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsAsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.allMine });

      queryClient.setQueryData(
        queryKeys.notifications.mine(20, false),
        (old: { data: UserNotification[]; unreadCount: number } | undefined) => {
          if (!old) return old;
          return {
            data: old.data.map((n) => ({ ...n, is_read: true })),
            unreadCount: 0,
          };
        },
      );

      queryClient.setQueryData(queryKeys.notifications.unreadCount, 0);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.allMine });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
    },
  });
}
