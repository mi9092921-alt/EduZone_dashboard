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
 */
export class SendNotificationUseCase {
  constructor(private readonly notifications: INotificationAdminRepository) {}

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
      await this.notifications.attachNotificationTargets(notificationId, targetUserIds);
      await this.notifications.fanoutToUsers(notificationId, tenantId, targetUserIds);
    }

    // BUG-PUSH-INSTANT: best-effort immediate fanout + push worker trigger
    try {
      await this.notifications.triggerInstantPush();
    } catch (pushErr) {
      console.error('[SEND_NOTIFICATION_ACTION_PUSH_ERROR]', pushErr);
    }

    return notificationId;
  }
}
