import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import { ForbiddenError } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';
import type {
  NotificationListResult,
  TargetAudience,
} from '@/domain/types/notification.types';

/**
 * Admin broadcast management use cases:
 *  - ListNotificationsUseCase : paginated list + per-audience stats
 *  - DeleteNotificationUseCase: tenant-scoped soft delete
 *
 * Business rule (from the former fat action): the broadcast list and
 * deletes are scoped to the caller's tenant; a caller without tenant
 * context (legacy super_admin edge case) sees/ affects all tenants.
 *
 * Teacher scoping: a teacher may only delete broadcasts they created or
 * course announcements for courses they own — never another sender's
 * broadcast — and their list is pinned to the students audience.
 *
 * M13 (§17): DeleteNotificationUseCase is the audit-event source for
 * broadcast deletion (`notification_deleted`).
 */
export class ListNotificationsUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

  async execute(
    ctx: Readonly<RequestContext>,
    params: { page: number; pageSize: number; audience?: TargetAudience | 'all' | undefined },
  ): Promise<NotificationListResult> {
    // A teacher's management surface is the students audience only (same
    // matrix as SendNotificationUseCase). Pinning it here means a crafted
    // request cannot list admins/teachers-audience broadcasts.
    const audience =
      ctx.role === 'teacher' ? 'students' : params.audience;
    return this.notifications.listForAdmin(
      ctx.tenantId || null,
      audience,
      params.page,
      params.pageSize,
    );
  }
}

export class DeleteNotificationUseCase {
  constructor(
    private readonly notifications: INotificationAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, id: string): Promise<void> {
    if (ctx.role === 'teacher') {
      await this.assertTeacherMayDelete(ctx, id);
    }
    await this.notifications.softDelete(id, ctx.tenantId || null);
    await this.audit.record(ctx, {
      type: 'notification_deleted',
      summary: 'Broadcast notification deleted',
      riskLevel: 'medium',
    });
  }

  /**
   * Teachers may delete only their own broadcasts or announcements for
   * courses they own. Fails closed: unknown/missing notification → deny.
   */
  private async assertTeacherMayDelete(
    ctx: Readonly<RequestContext>,
    id: string,
  ): Promise<void> {
    const meta = await this.notifications.getNotificationOwnershipMeta(
      id,
      ctx.tenantId || null,
    );
    if (!meta) {
      throw new ForbiddenError('Notification not found in your tenant');
    }

    const isCreator = meta.created_by === ctx.userId;
    if (isCreator) return;

    const isOwnCourseAnnouncement =
      meta.targeting_mode === 'course' &&
      meta.course_id !== null &&
      ctx.tenantId !== null &&
      (
        await this.notifications.verifyTeacherCourseOwnership(
          meta.course_id,
          ctx.userId,
          ctx.tenantId,
        )
      ).ownsCourse;

    if (!isOwnCourseAnnouncement) {
      throw new ForbiddenError('You can only delete your own notifications');
    }
  }
}
