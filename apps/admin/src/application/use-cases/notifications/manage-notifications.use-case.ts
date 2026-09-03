import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
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
 * M13 (§17): DeleteNotificationUseCase is the audit-event source for
 * broadcast deletion (`notification_deleted`).
 */
export class ListNotificationsUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

  async execute(
    ctx: Readonly<RequestContext>,
    params: { page: number; pageSize: number; audience?: TargetAudience | 'all' | undefined },
  ): Promise<NotificationListResult> {
    return this.notifications.listForAdmin(
      ctx.tenantId || null,
      params.audience,
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
    await this.notifications.softDelete(id, ctx.tenantId || null);
    await this.audit.record(ctx, {
      type: 'notification_deleted',
      summary: 'Broadcast notification deleted',
      riskLevel: 'medium',
    });
  }
}
