import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DeleteNotificationUseCase,
  ListNotificationsUseCase,
} from './manage-notifications.use-case';

import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { INotificationAdminRepository } from '@/application/ports/INotificationAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';


function makeRepo(overrides: Partial<INotificationAdminRepository> = {}): INotificationAdminRepository {
  return {
    resolveTargetUserIds: vi.fn(),
    insertNotification: vi.fn(),
    attachNotificationTargets: vi.fn(),
    fanoutToUsers: vi.fn(),
    triggerInstantPush: vi.fn(),
    listForAdmin: vi.fn().mockResolvedValue({
      data: [],
      count: 0,
      stats: { all: 0, students: 0, teachers: 0, admins: 0 },
    }),
    softDelete: vi.fn().mockResolvedValue(undefined),
    getNotificationOwnershipMeta: vi.fn().mockResolvedValue(null),
    detachNotificationTargets: vi.fn(),
    verifyTeacherCourseOwnership: vi.fn().mockResolvedValue({ ownsCourse: false }),
    listMine: vi.fn(),
    countMine: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    ...overrides,
  } as unknown as INotificationAdminRepository;
}

const adminCtx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['notifications.send'],
});

describe('ListNotificationsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the admin list to the caller tenant with page params', async () => {
    const repo = makeRepo();

    await new ListNotificationsUseCase(repo).execute(adminCtx, {
      page: 2,
      pageSize: 25,
      audience: 'students',
    });

    expect(repo.listForAdmin).toHaveBeenCalledWith('tenant-1', 'students', 2, 25);
  });

  it('passes audience "all" through unchanged', async () => {
    const repo = makeRepo();

    await new ListNotificationsUseCase(repo).execute(adminCtx, {
      page: 1,
      pageSize: 20,
      audience: 'all',
    });

    expect(repo.listForAdmin).toHaveBeenCalledWith('tenant-1', 'all', 1, 20);
  });

  it('pins a teacher list to the students audience regardless of requested filter', async () => {
    const repo = makeRepo();
    const teacherCtx = createRequestContext({
      userId: 'teacher-1',
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['notifications.send'],
    });

    await new ListNotificationsUseCase(repo).execute(teacherCtx, {
      page: 1,
      pageSize: 20,
      audience: 'admins',
    });

    expect(repo.listForAdmin).toHaveBeenCalledWith('tenant-1', 'students', 1, 20);
  });

  it('normalizes a missing tenant context to null (legacy super_admin behavior)', async () => {
    const repo = makeRepo();
    const noTenantCtx = createRequestContext({
      userId: 'super-1',
      tenantId: '',
      role: 'super_admin',
      permissions: ['*'],
    });

    await new ListNotificationsUseCase(repo).execute(noTenantCtx, { page: 1, pageSize: 20 });

    expect(repo.listForAdmin).toHaveBeenCalledWith(null, undefined, 1, 20);
  });
});

describe('DeleteNotificationUseCase', () => {
  let audit: IAuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('soft-deletes scoped to the caller tenant and audits', async () => {
    const repo = makeRepo();

    await new DeleteNotificationUseCase(repo, audit).execute(adminCtx, 'notif-9');

    expect(repo.softDelete).toHaveBeenCalledWith('notif-9', 'tenant-1');
    expect(audit.record).toHaveBeenCalledWith(
      adminCtx,
      expect.objectContaining({ type: 'notification_deleted', riskLevel: 'medium' }),
    );
  });

  it('soft-deletes without tenant scope when tenant context is missing', async () => {
    const repo = makeRepo();
    const noTenantCtx = createRequestContext({
      userId: 'super-1',
      tenantId: '',
      role: 'super_admin',
      permissions: ['*'],
    });

    await new DeleteNotificationUseCase(repo, audit).execute(noTenantCtx, 'notif-9');

    expect(repo.softDelete).toHaveBeenCalledWith('notif-9', null);
  });

  it('a teacher may delete their own broadcast', async () => {
    const repo = makeRepo({
      getNotificationOwnershipMeta: vi.fn().mockResolvedValue({
        created_by: 'teacher-1',
        targeting_mode: 'users',
        course_id: null,
      }),
    });
    const teacherCtx = createRequestContext({
      userId: 'teacher-1',
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['notifications.delete'],
    });

    await new DeleteNotificationUseCase(repo, audit).execute(teacherCtx, 'notif-9');

    expect(repo.softDelete).toHaveBeenCalledWith('notif-9', 'tenant-1');
  });

  it('a teacher may delete a course announcement for a course they own', async () => {
    const repo = makeRepo({
      getNotificationOwnershipMeta: vi.fn().mockResolvedValue({
        created_by: 'someone-else',
        targeting_mode: 'course',
        course_id: 'course-1',
      }),
      verifyTeacherCourseOwnership: vi.fn().mockResolvedValue({ ownsCourse: true }),
    });
    const teacherCtx = createRequestContext({
      userId: 'teacher-1',
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['notifications.delete'],
    });

    await new DeleteNotificationUseCase(repo, audit).execute(teacherCtx, 'notif-9');

    expect(repo.softDelete).toHaveBeenCalledWith('notif-9', 'tenant-1');
  });

  it('a teacher CANNOT delete another sender\'s broadcast (fails closed on foreign content)', async () => {
    const repo = makeRepo({
      getNotificationOwnershipMeta: vi.fn().mockResolvedValue({
        created_by: 'admin-1',
        targeting_mode: 'audience',
        course_id: null,
      }),
    });
    const teacherCtx = createRequestContext({
      userId: 'teacher-1',
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['notifications.delete'],
    });

    await expect(new DeleteNotificationUseCase(repo, audit).execute(teacherCtx, 'notif-9'))
      .rejects.toThrow('You can only delete your own notifications');
    expect(repo.softDelete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('fails closed when the notification does not exist in the tenant', async () => {
    const repo = makeRepo({
      getNotificationOwnershipMeta: vi.fn().mockResolvedValue(null),
    });
    const teacherCtx = createRequestContext({
      userId: 'teacher-1',
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['notifications.delete'],
    });

    await expect(new DeleteNotificationUseCase(repo, audit).execute(teacherCtx, 'notif-9'))
      .rejects.toThrow('Notification not found in your tenant');
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('never applies teacher scoping to admins/super_admins', async () => {
    const repo = makeRepo();

    await new DeleteNotificationUseCase(repo, audit).execute(adminCtx, 'notif-9');

    expect(repo.getNotificationOwnershipMeta).not.toHaveBeenCalled();
    expect(repo.softDelete).toHaveBeenCalledWith('notif-9', 'tenant-1');
  });
});
