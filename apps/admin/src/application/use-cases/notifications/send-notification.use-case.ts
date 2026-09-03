import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import { ValidationError } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';
import type { SendNotificationInput } from '@/domain/types/notification.types';

/**
 * SendNotificationUseCase — admin broadcast notification with recipient
 * resolution, fanout, and best-effort instant push trigger.
 *
 * Business rules (moved verbatim from the former fat server action):
 *  1. Tenant context is mandatory — derived from the authorized caller,
 *     never from client input.
 *  2. Recipients come from the repository (explicit ids → permission
 *     roles → audience), deduplicated and tenant-scoped.
 *  3. Fanout rows are upserted (idempotent on user_id+notification_id).
 *  4. Push trigger is best-effort — failures are logged, never surfaced.
 *  5. M16 (F16-4): if the fanout chain (targets/fanout) fails after the
 *     notification row was inserted, the orphan row is soft-deleted
 *     (best-effort compensation) and the error propagates — the caller
 *     retries the whole operation instead of keeping a broadcast that no
 *     recipient can ever see.
 *
 * M13 (§17): the use case emits `notification_sent` / `notification_send_failed`
 * audit events with the requestId correlation id (recipient count only —
 * never the notification body).
 */
export class SendNotificationUseCase {
  constructor(
    private readonly notifications: INotificationAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, input: SendNotificationInput): Promise<string> {
    const tenantId = ctx.tenantId;
    if (!tenantId) throw new ValidationError('Tenant context is missing');

    const targetUserIds = await this.notifications.resolveTargetUserIds(input, tenantId);
    const notificationId = await this.notifications.insertNotification(
      input,
      tenantId,
      ctx.userId,
    );

    if (targetUserIds.length) {
      try {
        await this.notifications.attachNotificationTargets(notificationId, targetUserIds);
        await this.notifications.fanoutToUsers(notificationId, tenantId, targetUserIds);
      } catch (fanoutError) {
        // Compensation: an inserted notification with no delivered fanout
        // rows is invisible to every recipient — remove it so the caller's
        // retry starts clean. Best-effort: the original error still wins.
        try {
          await this.notifications.softDelete(notificationId, tenantId);
        } catch (cleanupError) {
          console.error('[SEND_NOTIFICATION_COMPENSATION_FAILED]', cleanupError);
        }
        await this.audit.record(ctx, {
          type: 'notification_send_failed',
          summary: 'Notification fanout failed; broadcast rolled back',
          details: { recipient_count: targetUserIds.length },
          riskLevel: 'medium',
          outcome: 'failure',
        });
        throw fanoutError;
      }
    }

    // BUG-PUSH-INSTANT: best-effort immediate fanout + push worker trigger
    try {
      await this.notifications.triggerInstantPush();
    } catch (pushErr) {
      console.error('[SEND_NOTIFICATION_ACTION_PUSH_ERROR]', pushErr);
    }

    await this.audit.record(ctx, {
      type: 'notification_sent',
      summary: 'Broadcast notification sent',
      details: { recipient_count: targetUserIds.length, notification_id: notificationId },
      riskLevel: 'medium',
    });

    return notificationId;
  }
}
