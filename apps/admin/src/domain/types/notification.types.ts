/**
 * Notification domain types — single source of truth for the notifications
 * bounded context (admin broadcast + per-user inbox).
 *
 * These live in the domain layer (not adapters) so that the application layer
 * (use cases / ports) never depends on the adapters layer. The adapters
 * re-export them for backward compatibility with feature components.
 */

export type TargetAudience = 'all' | 'students' | 'teachers' | 'admins';

export type TargetingMode = 'audience' | 'users' | 'course';

/** Admin broadcast or course announcement notification as stored in the `notifications` table */
export interface Notification {
  id: string;
  tenant_id: string;
  created_by: string | null;
  title: string;
  body: string;
  target_audience: TargetAudience;
  targeting_mode?: TargetingMode;
  target_permission: string | null;
  target_user_ids: string[] | null;
  course_id?: string | null;
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

/** Input for the send-notification use case (admin broadcast or course announcement) */
export interface SendNotificationInput {
  title: string;
  body: string;
  target_audience?: TargetAudience;
  target_permission?: string | null;
  target_user_ids?: string[] | null;
  course_id?: string | null;
  targeting_mode?: TargetingMode;
}

/** Per-audience totals shown on the notifications admin page */
export interface NotificationAudienceStats {
  all: number;
  students: number;
  teachers: number;
  admins: number;
}

/** Result of the admin broadcast list query */
export interface NotificationListResult {
  data: Notification[];
  count: number;
  stats: NotificationAudienceStats;
}

/** Result of the per-user inbox query */
export interface MyNotificationsResult {
  data: UserNotification[];
  unreadCount: number;
}
