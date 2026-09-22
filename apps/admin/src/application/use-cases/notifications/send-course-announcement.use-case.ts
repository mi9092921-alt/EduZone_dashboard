import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import { ForbiddenError, ValidationError } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';
import type { SendNotificationInput } from '@/domain/types/notification.types';

export interface SendCourseAnnouncementInput {
  courseId: string;
  title: string;
  body: string;
}

export interface SendCourseAnnouncementResult {
  notificationId: string;
  recipientCount: number;
}

/**
 * SendCourseAnnouncementUseCase
 *
 * Business rules:
 *  1. Role check: Only teacher, admin, and super_admin can send course announcements.
 *  2. Tenant context is mandatory.
 *  3. Server-side ownership verification: Teachers must own the course.
 *  4. Recipients are resolved server-side from active enrollments only (status = 'active').
 *  5. Direct fanout pipeline with compensation: If fanout fails, orphan notification is soft-deleted.
 *  6. Best-effort instant push to FCM.
 *  7. Audit recording of sent/failed events.
 */
export class SendCourseAnnouncementUseCase {
  constructor(
    private readonly notifications: INotificationAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(
    ctx: Readonly<RequestContext>,
    input: SendCourseAnnouncementInput,
  ): Promise<SendCourseAnnouncementResult> {
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new ValidationError('Tenant context is missing');
    }

    // 1. Role validation
    if (!['teacher', 'admin', 'super_admin'].includes(ctx.role)) {
      throw new ForbiddenError('The current role cannot send course announcements');
    }

    if (!input.courseId) {
      throw new ValidationError('Course ID is required');
    }

    const title = input.title?.trim();
    if (!title || title.length < 3 || title.length > 100) {
      throw new ValidationError('Title must be between 3 and 100 characters');
    }

    const body = input.body?.trim();
    if (!body || body.length < 10 || body.length > 500) {
      throw new ValidationError('Body must be between 10 and 500 characters');
    }

    // 2. Teacher ownership check (Server-side IDOR guard)
    if (ctx.role === 'teacher') {
      const { ownsCourse } = await this.notifications.verifyTeacherCourseOwnership(
        input.courseId,
        ctx.userId,
        tenantId,
      );
      if (!ownsCourse) {
        throw new ForbiddenError('You do not own this course');
      }
    }

    // 3. Resolve enrolled students (active status only)
    const studentIds = await this.notifications.resolveEnrolledStudentIds(
      input.courseId,
      tenantId,
    );
    if (studentIds.length === 0) {
      throw new ValidationError('No active enrolled students found in this course');
    }

    // 4. Insert notification row with targeting_mode = 'course'
    const notificationInput: SendNotificationInput = {
      title,
      body,
      target_audience: 'students',
      targeting_mode: 'course',
      course_id: input.courseId,
      target_user_ids: null,
    };

    const notificationId = await this.notifications.insertNotification(
      notificationInput,
      tenantId,
      ctx.userId,
    );

    // 5. Fanout to user inboxes
    try {
      await this.notifications.attachNotificationTargets(notificationId, studentIds);
      await this.notifications.fanoutToUsers(notificationId, tenantId, studentIds);
    } catch (fanoutError) {
      // Compensation rollback
      try {
        await this.notifications.softDelete(notificationId, tenantId);
        await this.notifications.detachNotificationTargets(notificationId);
      } catch (cleanupError) {
        console.error('[COURSE_ANNOUNCEMENT_COMPENSATION_FAILED]', cleanupError);
      }

      await this.audit.record(ctx, {
        type: 'course_announcement_send_failed',
        summary: 'Course announcement fanout failed; announcement rolled back',
        details: { course_id: input.courseId, recipient_count: studentIds.length },
        riskLevel: 'medium',
        outcome: 'failure',
      });
      throw fanoutError;
    }

    // 6. Best-effort instant push trigger
    try {
      await this.notifications.triggerInstantPush();
    } catch (pushErr) {
      console.error('[COURSE_ANNOUNCEMENT_PUSH_ERROR]', pushErr);
    }

    // 7. Audit log
    await this.audit.record(ctx, {
      type: 'course_announcement_sent',
      summary: 'Course announcement sent to enrolled students',
      details: {
        course_id: input.courseId,
        recipient_count: studentIds.length,
        notification_id: notificationId,
      },
      riskLevel: 'low',
    });

    return {
      notificationId,
      recipientCount: studentIds.length,
    };
  }
}
