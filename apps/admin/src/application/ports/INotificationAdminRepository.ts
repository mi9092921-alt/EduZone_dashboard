import type {
  MyNotificationsResult,
  Notification,
  NotificationListResult,
  SendNotificationInput,
  TargetAudience,
  UserNotification,
} from '@/domain/types/notification.types';

/**
 * Port — notification persistence for the admin dashboard.
 *
 * Two access profiles live behind one bounded-context port:
 *  - Admin broadcast : notifications / notification_targets (service-role writes)
 *  - Per-user inbox  : user_notifications (always scoped to the caller's own user_id)
 *
 * Implementations own the concrete Supabase access (including the admin /
 * service-role client). Use cases depend ONLY on this interface.
 */

/** Target resolution input — mirrors the broadcast form fields */
export interface ResolveNotificationTargetsInput {
  target_user_ids?: string[] | null;
  target_permission?: string | null;
  target_audience?: TargetAudience;
}

export interface INotificationAdminRepository {
  // ── Admin broadcast ─────────────────────────────────────────────
  /**
   * Resolves the concrete recipient list for a broadcast:
   * explicit ids → permission-based roles → audience roles.
   * Returns a deduplicated list of user ids scoped to the tenant.
   */
  resolveTargetUserIds(
    input: ResolveNotificationTargetsInput,
    tenantId: string,
    allowedRecipientRoles?: readonly string[],
  ): Promise<string[]>;

  /** Inserts the notification row and returns its id. */
  insertNotification(
    input: SendNotificationInput,
    tenantId: string,
    createdBy: string,
  ): Promise<string>;

  /** Upserts notification_targets rows for explicit recipients. */
  attachNotificationTargets(notificationId: string, userIds: string[]): Promise<void>;

  /** Upserts user_notifications fanout rows for all recipients. */
  fanoutToUsers(notificationId: string, tenantId: string, userIds: string[]): Promise<void>;

  /** Triggers the fanout worker + FCM push worker RPCs. Throws on failure. */
  triggerInstantPush(): Promise<void>;

  /** Paginated admin broadcast list + unpaginated per-audience stats. */
  listForAdmin(
    tenantId: string | null,
    audience: TargetAudience | 'all' | undefined,
    page: number,
    pageSize: number,
  ): Promise<NotificationListResult>;

  /** Soft-deletes a broadcast notification, scoped to the tenant when known. */
  softDelete(id: string, tenantId: string | null): Promise<void>;

  /**
   * Fetches the ownership metadata a teacher-scoped delete authorization
   * needs (creator + targeting mode + course). Returns null when the
   * notification does not exist in the tenant (fails closed upstream).
   */
  getNotificationOwnershipMeta(
    id: string,
    tenantId: string | null,
  ): Promise<{
    created_by: string | null;
    targeting_mode: string;
    course_id: string | null;
  } | null>;

  /** Hard-deletes explicit target rows (fanout-failure compensation cleanup). */
  detachNotificationTargets(notificationId: string): Promise<void>;

  // ── Course announcements ────────────────────────────────────────
  /** Checks whether a teacher owns a specific course within the given tenant. */
  verifyTeacherCourseOwnership(
    courseId: string,
    teacherId: string,
    tenantId: string,
  ): Promise<{ ownsCourse: boolean }>;

  /** Resolves active enrolled student user IDs for a given course. */
  resolveEnrolledStudentIds(
    courseId: string,
    tenantId: string,
  ): Promise<string[]>;

  /** Paginated list of course announcements for a specific course. */
  listCourseAnnouncements(
    courseId: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: Notification[]; count: number }>;

  // ── Per-user inbox ──────────────────────────────────────────────
  /** Lists the user's inbox rows mapped to the domain shape, newest first. */
  listMine(userId: string, limit: number, unreadOnly: boolean): Promise<UserNotification[]>;

  /** Counts the user's rows (unreadOnly → is_read = false). */
  countMine(userId: string, unreadOnly: boolean): Promise<number>;

  /** Marks a single inbox row as read (scoped to the owning user). */
  markRead(userId: string, id: string): Promise<void>;

  /** Marks all of the user's unread inbox rows as read. */
  markAllRead(userId: string): Promise<void>;
}

/** Type re-export convenience for use cases */
export type {
  MyNotificationsResult,
  Notification,
  NotificationListResult,
  SendNotificationInput,
  TargetAudience,
  UserNotification,
};
