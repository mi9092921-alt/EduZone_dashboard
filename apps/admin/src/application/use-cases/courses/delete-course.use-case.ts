import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { ICourseAdminRepository } from '@/application/ports/ICourseAdminRepository';
import { toClientMessage } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';

export interface DeleteCourseResult {
  success: boolean;
  error?: string;
}

/**
 * DeleteCourseUseCase — tenant-scoped soft deletion of a course.
 *
 * `deleteCourse` on the repository goes through the service-role client
 * and therefore bypasses RLS entirely — this use case is the ONLY place
 * that is allowed to call it, and only after the action boundary has
 * already confirmed the caller holds `courses.write`/`courses.manage`
 * and passed the `assertSameTenant` check against `getCourseTenantId`.
 *
 * Mirrors `DeleteUserUseCase`: the use case is the audit-event source,
 * not the UI or the server action — both success and failure emit
 * `course_deleted` carrying the requestId correlation id from `ctx`.
 */
export class DeleteCourseUseCase {
  constructor(
    private readonly courses: ICourseAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, courseId: string): Promise<DeleteCourseResult> {
    try {
      await this.courses.deleteCourse(courseId);

      await this.audit.record(ctx, {
        type: 'course_deleted',
        summary: 'Course deleted',
        riskLevel: 'high',
        details: { courseId },
      });

      return { success: true };
    } catch (error: unknown) {
      console.error('DeleteCourseUseCase error:', error);
      await this.audit.record(ctx, {
        type: 'course_deleted',
        summary: 'Course deletion failed',
        riskLevel: 'high',
        details: { courseId },
        outcome: 'failure',
      });
      return { success: false, error: toClientMessage(error) };
    }
  }
}
