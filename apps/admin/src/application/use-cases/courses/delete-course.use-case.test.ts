import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DeleteCourseUseCase } from './delete-course.use-case';

import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { ICourseAdminRepository } from '@/application/ports/ICourseAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';

function makeRepo(overrides: Partial<ICourseAdminRepository> = {}): ICourseAdminRepository {
  return {
    getCourseTenantId: vi.fn().mockResolvedValue('tenant-1'),
    deleteCourse: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAudit(): IAuditLogger {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

const ctx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['courses.write'],
  requestId: 'req_test_1',
});

describe('DeleteCourseUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the course and audits success', async () => {
    const repo = makeRepo();
    const audit = makeAudit();

    const result = await new DeleteCourseUseCase(repo, audit).execute(ctx, 'course-1');

    expect(result).toEqual({ success: true });
    expect(repo.deleteCourse).toHaveBeenCalledWith('course-1');
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: 'course_deleted',
        riskLevel: 'high',
        details: { courseId: 'course-1' },
      }),
    );
  });

  it('M13: the audit event carries the requestId correlation id via ctx', async () => {
    const audit = makeAudit();

    await new DeleteCourseUseCase(makeRepo(), audit).execute(ctx, 'course-1');

    expect(audit.record).toHaveBeenCalledWith(ctx, expect.anything());
  });

  it('fails and audits the failure when the repository throws', async () => {
    const repo = makeRepo({
      deleteCourse: vi.fn().mockRejectedValue(new Error('Database connection lost')),
    });
    const audit = makeAudit();

    const result = await new DeleteCourseUseCase(repo, audit).execute(ctx, 'course-1');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(audit.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: 'course_deleted',
        outcome: 'failure',
        details: { courseId: 'course-1' },
      }),
    );
  });
});
