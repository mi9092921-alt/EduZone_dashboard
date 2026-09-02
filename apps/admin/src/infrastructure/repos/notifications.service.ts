import {
  getNotificationsAction,
  sendNotificationAction,
  deleteNotificationAction,
  getMyNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
  getUnreadNotificationCountAction,
} from '@/adapters/actions/admin.actions';
import type { SendNotificationInput } from '@/adapters/mutations/notifications.mutations';
import type {
  Notification,
  UserNotification,
  TargetAudience,
} from '@/adapters/queries/notifications.queries';

/**
 * Notifications service — the notifications domain.
 *
 * Two layers:
 *  - Admin view  : getNotifications()     — broadcast management (admin/super_admin)
 *  - User view   : getMyNotifications()   — per-user inbox used by NotificationBell
 *
 * notifications / user_notifications are service-role (RLS-bypassing) admin
 * resources. All reads/writes MUST go through the `admin.actions` Server
 * Actions, which are the only place service-role Supabase access
 * (`createAdminClient`) is permitted — see infrastructure/supabase/admin.ts.
 *
 * This wrapper intentionally has no browser/server branching. It previously
 * duplicated every query here using the browser (anon-key) Supabase client
 * whenever `typeof window === 'undefined'`. That duplicate implementation
 * was not just architecturally wrong (a server-context call using a
 * browser-scoped client with no session/cookies) but security-relevant:
 * unlike the admin.actions versions, `markAllNotificationsAsRead()` and
 * `getMyNotifications()`/`getUnreadNotificationCount()` never scoped the
 * query to the calling user's own `user_id`, so if that code path were ever
 * reached it would read or mutate every user's notifications rather than
 * only the caller's own. It has been removed in favor of a single source of
 * truth in admin.actions.ts, where every mutation is scoped to
 * `.eq('user_id', userId)`.
 */

// ─── Admin broadcast management ───────────────────────────────────────────────

export async function getNotifications(
  page: number,
  pageSize: number,
  audience?: TargetAudience | 'all',
): Promise<{
  data: Notification[];
  count: number;
  stats: { all: number; students: number; teachers: number; admins: number };
}> {
  return getNotificationsAction(page, pageSize, audience);
}

export async function sendNotification(input: SendNotificationInput): Promise<string> {
  return sendNotificationAction(input);
}

export async function deleteNotification(id: string): Promise<void> {
  return deleteNotificationAction(id);
}

// ─── Per-user inbox (NotificationBell) ────────────────────────────────────────

/**
 * Fetch the current user's personal notification inbox.
 * Returns up to `limit` notifications, newest first.
 * If `unreadOnly` is true, filters to is_read = false only.
 */
export async function getMyNotifications(
  limit = 20,
  unreadOnly = false,
): Promise<{ data: UserNotification[]; unreadCount: number }> {
  return getMyNotificationsAction(limit, unreadOnly);
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  return markNotificationAsReadAction(id);
}

/**
 * Mark ALL unread notifications for the current user as read.
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  return markAllNotificationsAsReadAction();
}

/**
 * Returns only the unread count for badge display (lightweight head request).
 */
export async function getUnreadNotificationCount(): Promise<number> {
  return getUnreadNotificationCountAction();
}
