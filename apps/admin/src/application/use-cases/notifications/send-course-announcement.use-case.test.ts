import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SendCourseAnnouncementUseCase } from './send-course-announcement.use-case';

import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';

function makeRepo(
  overrides: Partial<INotificationAdminRepository> = {},
): INotificationAdminRepository {
  return {
    resolveTargetUserIds: vi.fn().mockResolvedValue([]),
    insertNotification: vi.fn().mockResolvedValue('notif-course-1'),
    attachNotificationTargets: vi.fn().mockResolvedValue(undefined),
    fanoutToUsers: vi.fn().mockResolvedValue(undefined),
    triggerInstantPush: vi.fn().mockResolvedValue(undefined),
    listForAdmin: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(undefined),
    getNotificationOwnershipMeta: vi.fn().mockResolvedValue(null),
    detachNotificationTargets: vi.fn().mockResolvedValue(undefined),
    verifyTeacherCourseOwnership: vi.fn().mockResolvedValue({ ownsCourse: true }),
    resolveEnrolledStudentIds: vi.fn().mockResolvedValue(['student-1', 'student-2']),
    listCourseAnnouncements: vi.fn().mockResolvedValue({ data: [], count: 0 }),
    listMine: vi.fn().mockResolvedValue([]),
    countMine: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as INotificationAdminRepository;
}

const teacherCtx = createRequestContext({
  userId: 'teacher-1',
  tenantId: 'tenant-1',
  role: 'teacher',
  permissions: ['course_announcements.send', 'notifications.send'],
});

const adminCtx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['notifications.send'],
});

const studentCtx = createRequestContext({
  userId: 'student-1',
  tenantId: 'tenant-1',
  role: 'student',
  permissions: [],
});

describe('SendCourseAnnouncementUseCase', () => {
  let audit: IAuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
  });

  const validPayload = {
    courseId: 'course-123',
    title: 'Quiz Tomorrow',
    body: 'Be ready for Unit 2 grammar quiz in next session.',
  };

  it('successfully sends course announcement when teacher owns the course and students are enrolled', async () => {
    const repo = makeRepo();
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    const result = await useCase.execute(teacherCtx, validPayload);

    expect(result).toEqual({
      notificationId: 'notif-course-1',
      recipientCount: 2,
    });
    expect(repo.verifyTeacherCourseOwnership).toHaveBeenCalledWith(
      'course-123',
      'teacher-1',
      'tenant-1',
    );
    expect(repo.resolveEnrolledStudentIds).toHaveBeenCalledWith(
      'course-123',
      'tenant-1',
    );
    expect(repo.insertNotification).toHaveBeenCalledWith(
      {
        title: 'Quiz Tomorrow',
        body: 'Be ready for Unit 2 grammar quiz in next session.',
        target_audience: 'students',
        targeting_mode: 'course',
        course_id: 'course-123',
        target_user_ids: null,
      },
      'tenant-1',
      'teacher-1',
    );
    expect(repo.attachNotificationTargets).toHaveBeenCalledWith('notif-course-1', [
      'student-1',
      'student-2',
    ]);
    expect(repo.fanoutToUsers).toHaveBeenCalledWith('notif-course-1', 'tenant-1', [
      'student-1',
      'student-2',
    ]);
    expect(repo.triggerInstantPush).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      teacherCtx,
      expect.objectContaining({
        type: 'course_announcement_sent',
        details: expect.objectContaining({
          course_id: 'course-123',
          recipient_count: 2,
          notification_id: 'notif-course-1',
        }),
      }),
    );
  });

  it('allows admin to send without checking teacher ownership', async () => {
    const repo = makeRepo();
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    const result = await useCase.execute(adminCtx, validPayload);

    expect(result.notificationId).toBe('notif-course-1');
    expect(repo.verifyTeacherCourseOwnership).not.toHaveBeenCalled();
    expect(repo.resolveEnrolledStudentIds).toHaveBeenCalledWith('course-123', 'tenant-1');
  });

  it('rejects student role from sending announcements', async () => {
    const repo = makeRepo();
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    await expect(useCase.execute(studentCtx, validPayload)).rejects.toThrow(
      'The current role cannot send course announcements',
    );
    expect(repo.insertNotification).not.toHaveBeenCalled();
  });

  it('rejects teacher if they do not own the course', async () => {
    const repo = makeRepo({
      verifyTeacherCourseOwnership: vi.fn().mockResolvedValue({ ownsCourse: false }),
    });
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    await expect(useCase.execute(teacherCtx, validPayload)).rejects.toThrow(
      'You do not own this course',
    );
    expect(repo.insertNotification).not.toHaveBeenCalled();
  });

  it('rejects if no active enrolled students found in course', async () => {
    const repo = makeRepo({
      resolveEnrolledStudentIds: vi.fn().mockResolvedValue([]),
    });
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    await expect(useCase.execute(teacherCtx, validPayload)).rejects.toThrow(
      'No active enrolled students found in this course',
    );
    expect(repo.insertNotification).not.toHaveBeenCalled();
  });

  it('rolls back with compensation softDelete if fanout fails', async () => {
    const repo = makeRepo({
      fanoutToUsers: vi.fn().mockRejectedValue(new Error('DB fanout deadlock')),
    });
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    await expect(useCase.execute(teacherCtx, validPayload)).rejects.toThrow(
      'DB fanout deadlock',
    );
    expect(repo.softDelete).toHaveBeenCalledWith('notif-course-1', 'tenant-1');
    expect(audit.record).toHaveBeenCalledWith(
      teacherCtx,
      expect.objectContaining({
        type: 'course_announcement_send_failed',
        outcome: 'failure',
      }),
    );
  });

  it('validates title and body length', async () => {
    const repo = makeRepo();
    const useCase = new SendCourseAnnouncementUseCase(repo, audit);

    // Title too short
    await expect(
      useCase.execute(teacherCtx, { ...validPayload, title: 'Hi' }),
    ).rejects.toThrow('Title must be between 3 and 100 characters');

    // Body too short
    await expect(
      useCase.execute(teacherCtx, { ...validPayload, body: 'Short' }),
    ).rejects.toThrow('Body must be between 10 and 500 characters');
  });
});
