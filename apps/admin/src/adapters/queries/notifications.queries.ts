import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { queryKeys } from './keys';

import {
  getNotifications,
  getMyNotifications,
  getUnreadNotificationCount,
} from '@/infrastructure/repos/notifications.service';
import { createBrowserClient } from '@/infrastructure/supabase/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TargetAudience = 'all' | 'students' | 'teachers' | 'admins';

/** Admin broadcast notification as stored in the `notifications` table */
export interface Notification {
  id: string;
  tenant_id: string;
  created_by: string | null;
  title: string;
  body: string;
  target_audience: TargetAudience;
  target_permission: string | null;
  target_user_ids: string[] | null;
  is_deleted: boolean;
  created_at: string;
}

/** Per-user notification row as stored in `user_notifications` */
export interface UserNotification {
  id: string;
  user_id: string;
  notification_id: string;
  title: string;
  body: string;
  type: 'account_action' | 'warning_issued' | 'course_update' | 'system_alert' | string;
  link_to: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Admin Query Hooks ─────────────────────────────────────────────────────────

/** Paginated admin broadcast list */
export function useNotifications(page: number, pageSize: number, audience?: TargetAudience | 'all') {
  return useQuery({
    queryKey: queryKeys.notifications.list(page, pageSize, audience),
    queryFn: () => getNotifications(page, pageSize, audience),
  });
}

// ─── Per-User Inbox Hooks ──────────────────────────────────────────────────────

/**
 * P11-NOTIFY-001: Fetch the current user's personal notification inbox.
 * Used by NotificationBell dropdown.
 * staleTime: 30s (per acceptance criteria).
 */
export function useMyNotifications(limit = 20, unreadOnly = false) {
  return useQuery({
    queryKey: queryKeys.notifications.mine(limit, unreadOnly),
    queryFn: () => getMyNotifications(limit, unreadOnly),
    staleTime: 30_000,
  });
}

/**
 * Lightweight unread count for the badge — refetches every 60s.
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: getUnreadNotificationCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * P11-NOTIFY-001: Realtime hook — subscribes to `user_notifications` INSERT events
 * and automatically prepends new rows in to the React Query cache.
 *
 * Designed to be mounted once inside AdminShell (or Topbar).
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createBrowserClient();

    const channel = supabase
      .channel('user_notifications:realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
        },
        () => {
          if (!isMounted) return;
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.allMine });
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notifications',
        },
        () => {
          if (!isMounted) return;
          // On any update (markAsRead), invalidate to re-sync
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.allMine });
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      isMounted = false;
      // Guard against React StrictMode double-invoke: only remove if the
      // channel reference is still the one we created in this effect cycle.
      if (channelRef.current === channel) {
        channelRef.current = null;
        supabase.removeChannel(channel).catch(() => {
          // Swallow errors from removing a channel that was never fully connected
          // (happens during StrictMode's effect cleanup → re-run cycle).
        });
      }
    };
  }, [queryClient]);
}
