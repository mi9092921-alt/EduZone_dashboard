import type { SendNotificationInput } from '@/adapters/mutations/notifications.mutations';
import type { Notification, UserNotification, TargetAudience } from '@/adapters/queries/notifications.queries';
import {
  getNotificationsAction,
  sendNotificationAction,
  deleteNotificationAction,
  getMyNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
  getUnreadNotificationCountAction,
} from '@/application/actions/admin.actions';
import { container } from '@/container';
import { parseRpcError } from '@/domain/errors/parseRpcError';

/**
 * Notifications service — all Supabase queries for the notifications domain.
 *
 * Two layers:
 *  - Admin view  : getNotifications()     — broadcast management (admin/super_admin)
 *  - User view   : getMyNotifications()   — per-user inbox used by NotificationBell
 */

// ─── Admin broadcast management ───────────────────────────────────────────────

export async function getNotifications(
  page: number,
  pageSize: number,
  audience?: TargetAudience | 'all',
): Promise<{ 
  data: Notification[]; 
  count: number; 
  stats: { all: number; students: number; teachers: number; admins: number } 
}> {
  if (typeof window !== 'undefined') {
    return getNotificationsAction(page, pageSize, audience);
  }

  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (audience && audience !== 'all') {
    query = query.eq('target_audience', audience);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw parseRpcError(error);

  // Fetch total stats for stats cards (unpaginated counts)
  const { data: allAudienceData, error: statsError } = await supabase
    .from('notifications')
    .select('target_audience')
    .is('deleted_at', null);
  if (statsError) throw parseRpcError(statsError);

  const stats = {
    all: allAudienceData.length,
    students: allAudienceData.filter(n => n.target_audience === 'students').length,
    teachers: allAudienceData.filter(n => n.target_audience === 'teachers').length,
    admins: allAudienceData.filter(n => n.target_audience === 'admins').length,
  };

  return {
    data: (data ?? []) as Notification[],
    count: count ?? 0,
    stats,
  };
}

export async function sendNotification(
  input: SendNotificationInput,
): Promise<string> {
  if (typeof window !== 'undefined') {
    return sendNotificationAction(input);
  }

  const { supabase } = container;

  const args: Record<string, unknown> = {
    p_title: input.title,
    p_body: input.body,
  };

  // When targeting specific users, omit p_target_audience entirely (leave NULL).
  // Passing an audience alongside user IDs triggers the role-based permission gate
  // in the DB function, which raises PERMISSION_DENIED even for super_admin users.
  if (input.target_user_ids?.length) {
    args['p_target_user_ids'] = input.target_user_ids;
  } else {
    if (input.target_audience) args['p_target_audience'] = input.target_audience;
    if (input.target_permission) args['p_target_permission'] = input.target_permission;
  }

  const { data, error } = await supabase.rpc('send_notification', args);
  if (error) throw parseRpcError(error);
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  if (typeof window !== 'undefined') {
    return deleteNotificationAction(id);
  }

  const { supabase } = container;
  const { error } = await supabase.rpc('delete_notification', {
    p_notification_id: id,
  });
  if (error) throw parseRpcError(error);
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
  if (typeof window !== 'undefined') {
    return getMyNotificationsAction(limit, unreadOnly);
  }

  const { supabase } = container;

  let query = supabase
    .from('user_notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) throw parseRpcError(error);

  // Separate unread count query (always full, regardless of unreadOnly filter)
  const { count: unreadCount } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  return {
    data: (data ?? []) as UserNotification[],
    unreadCount: unreadCount ?? 0,
  };
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  if (typeof window !== 'undefined') {
    return markNotificationAsReadAction(id);
  }

  const { supabase } = container;
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw parseRpcError(error);
}

/**
 * Mark ALL unread notifications for the current user as read.
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  if (typeof window !== 'undefined') {
    return markAllNotificationsAsReadAction();
  }

  const { supabase } = container;
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  if (error) throw parseRpcError(error);
}

/**
 * Returns only the unread count for badge display (lightweight head request).
 */
export async function getUnreadNotificationCount(): Promise<number> {
  if (typeof window !== 'undefined') {
    return getUnreadNotificationCountAction();
  }

  const { supabase } = container;
  const { count, error } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) throw parseRpcError(error);
  return count ?? 0;
}
