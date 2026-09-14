import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * admin.actions.ts — delegation contract for the remaining actions.
 *
 * admin.actions.tenant-scoping.test.ts already covers the IDOR/tenant-scoping
 * guards (getAccessRulesAction, upsertAccessRuleAction, the analytics /
 * rate-limit / audit-queue list reads). This file exercises every other
 * exported action — access-rule delete/toggle, the full feature-flag surface
 * (incl. role, user and tenant overrides), jobs, notifications, rate-limit
 * mutations and the course single-resource actions — pinning the thin
 * boundary contract:
 *
 *   authorize (boundary, mocked) → delegate with tenant-scoped args → audit
 *
 * It also keeps the per-file coverage ratchet in vitest.unit.config.ts
 * (now ≥ 95% for admin.actions.ts, after this file brought the file to a
 * measured 100% on all four metrics) meaningful: the override / jobs /
 * notification actions originally landed without tests and dragged branch
 * coverage below the floor. Both sides of every tenant-scoping ternary
 * (super_admin '*' vs pinned tenant vs missing-tenant fallback) are hit so
 * a future regression cannot hide in the uncovered half.
 */

const mockRequirePermission = vi.fn();
const mockRequireUser = vi.fn();
const mockRequireUserContext = vi.fn();
const mockRequireSuperAdmin = vi.fn();
const mockAssertSameTenant = vi.fn();

vi.mock('@/adapters/actions/boundary', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
  requireUserContext: (...args: unknown[]) => mockRequireUserContext(...args),
  requireSuperAdmin: (...args: unknown[]) => mockRequireSuperAdmin(...args),
  assertSameTenant: (...args: unknown[]) => mockAssertSameTenant(...args),
}));

// ── infrastructure/repos ─────────────────────────────────────────────────────

const mockGetAccessRuleTenantId = vi.fn();
const mockDeleteAccessRuleAdmin = vi.fn();
const mockToggleAccessRuleAdmin = vi.fn();
vi.mock('@/infrastructure/repos/access-rules.service', () => ({
  getAccessRulesAdmin: vi.fn(),
  upsertAccessRuleAdmin: vi.fn(),
  getAccessRuleTenantId: (...args: unknown[]) => mockGetAccessRuleTenantId(...args),
  deleteAccessRuleAdmin: (...args: unknown[]) => mockDeleteAccessRuleAdmin(...args),
  toggleAccessRuleAdmin: (...args: unknown[]) => mockToggleAccessRuleAdmin(...args),
}));

const mockGetAllFeatureFlagsAdmin = vi.fn();
const mockGetFeatureFlagByIdAdmin = vi.fn();
const mockCreateFeatureFlagAdmin = vi.fn();
const mockUpdateFeatureFlagAdmin = vi.fn();
const mockDeleteFeatureFlagAdmin = vi.fn();
const mockToggleFeatureFlagAdmin = vi.fn();
const mockAddRoleOverrideAdmin = vi.fn();
const mockRemoveRoleOverrideAdmin = vi.fn();
const mockAddUserOverrideAdmin = vi.fn();
const mockRemoveUserOverrideAdmin = vi.fn();
const mockUpsertTenantOverrideAdmin = vi.fn();
const mockDeleteTenantOverrideAdmin = vi.fn();
const mockGetAllRolesAdmin = vi.fn();
vi.mock('@/infrastructure/repos/feature-flags.service', () => ({
  getAllFeatureFlagsAdmin: (...args: unknown[]) => mockGetAllFeatureFlagsAdmin(...args),
  getFeatureFlagByIdAdmin: (...args: unknown[]) => mockGetFeatureFlagByIdAdmin(...args),
  createFeatureFlagAdmin: (...args: unknown[]) => mockCreateFeatureFlagAdmin(...args),
  updateFeatureFlagAdmin: (...args: unknown[]) => mockUpdateFeatureFlagAdmin(...args),
  deleteFeatureFlagAdmin: (...args: unknown[]) => mockDeleteFeatureFlagAdmin(...args),
  toggleFeatureFlagAdmin: (...args: unknown[]) => mockToggleFeatureFlagAdmin(...args),
  addRoleOverrideAdmin: (...args: unknown[]) => mockAddRoleOverrideAdmin(...args),
  removeRoleOverrideAdmin: (...args: unknown[]) => mockRemoveRoleOverrideAdmin(...args),
  addUserOverrideAdmin: (...args: unknown[]) => mockAddUserOverrideAdmin(...args),
  removeUserOverrideAdmin: (...args: unknown[]) => mockRemoveUserOverrideAdmin(...args),
  upsertTenantOverrideAdmin: (...args: unknown[]) => mockUpsertTenantOverrideAdmin(...args),
  deleteTenantOverrideAdmin: (...args: unknown[]) => mockDeleteTenantOverrideAdmin(...args),
  getAllRolesAdmin: (...args: unknown[]) => mockGetAllRolesAdmin(...args),
}));

const mockGetJobs = vi.fn();
const mockGetJobStatusCounts = vi.fn();
const mockGetJobTenantId = vi.fn();
const mockRetryJob = vi.fn();
const mockCancelJob = vi.fn();
const mockReleaseStaleJobs = vi.fn();
vi.mock('@/infrastructure/repos/jobs.service', () => ({
  getJobs: (...args: unknown[]) => mockGetJobs(...args),
  getJobStatusCounts: (...args: unknown[]) => mockGetJobStatusCounts(...args),
  getJobTenantId: (...args: unknown[]) => mockGetJobTenantId(...args),
  retryJob: (...args: unknown[]) => mockRetryJob(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  releaseStaleJobs: (...args: unknown[]) => mockReleaseStaleJobs(...args),
}));

const mockGetRateLimitRules = vi.fn();
const mockToggleRateLimitRule = vi.fn();
const mockGetRateLimitTenantId = vi.fn();
const mockClearBlock = vi.fn();
vi.mock('@/infrastructure/repos/rate-limits.service', () => ({
  getActiveBlocks: vi.fn(),
  getTopOffenders: vi.fn(),
  getRateLimitRules: (...args: unknown[]) => mockGetRateLimitRules(...args),
  toggleRateLimitRule: (...args: unknown[]) => mockToggleRateLimitRule(...args),
  getRateLimitTenantId: (...args: unknown[]) => mockGetRateLimitTenantId(...args),
  clearBlock: (...args: unknown[]) => mockClearBlock(...args),
}));

const mockGetCourseTenantId = vi.fn();
const mockGetCourseStats = vi.fn();
vi.mock('@/infrastructure/repos/courses.service', () => ({
  getCourseTenantId: (...args: unknown[]) => mockGetCourseTenantId(...args),
  getCourseStats: (...args: unknown[]) => mockGetCourseStats(...args),
}));

// Imported by admin.actions.ts but not exercised in this file — stubbed so
// the module under test resolves cleanly (no createAdminClient anywhere).
vi.mock('@/infrastructure/repos/analytics.service', () => ({ getCourseStats: vi.fn() }));
vi.mock('@/infrastructure/repos/audit.service', () => ({ getQueuedActivities: vi.fn() }));
vi.mock('@/infrastructure/repos/course-admin.repository', () => ({
  makeCourseAdminRepository: vi.fn(),
}));
vi.mock('@/infrastructure/repos/notifications.repository', () => ({
  makeNotificationAdminRepository: vi.fn(),
}));

const mockAuditRecord = vi.fn().mockResolvedValue(undefined);
vi.mock('@/infrastructure/observability/audit-logger.service', () => ({
  makeAuditLogger: () => ({ record: mockAuditRecord }),
}));

// ── application/use-cases ────────────────────────────────────────────────────
// Every action constructs its use case inline, so the mocks must be real
// constructors (`new X().execute(...)`) — an arrow-function vi.fn would break
// under `new`. Each class simply forwards execute() to the mock below it.
const mockListNotificationsExecute = vi.fn();
const mockDeleteNotificationExecute = vi.fn();
vi.mock('@/application/use-cases/notifications/manage-notifications.use-case', () => ({
  ListNotificationsUseCase: class {
    execute = mockListNotificationsExecute;
  },
  DeleteNotificationUseCase: class {
    execute = mockDeleteNotificationExecute;
  },
}));

const mockSendNotificationExecute = vi.fn();
vi.mock('@/application/use-cases/notifications/send-notification.use-case', () => ({
  SendNotificationUseCase: class {
    execute = mockSendNotificationExecute;
  },
}));

const mockGetMyNotificationsExecute = vi.fn();
const mockGetUnreadCountExecute = vi.fn();
const mockMarkAllReadExecute = vi.fn();
const mockMarkOneReadExecute = vi.fn();
vi.mock('@/application/use-cases/notifications/inbox.use-case', () => ({
  GetMyNotificationsUseCase: class {
    execute = mockGetMyNotificationsExecute;
  },
  GetUnreadNotificationCountUseCase: class {
    execute = mockGetUnreadCountExecute;
  },
  MarkAllNotificationsReadUseCase: class {
    execute = mockMarkAllReadExecute;
  },
  MarkNotificationReadUseCase: class {
    execute = mockMarkOneReadExecute;
  },
}));

const mockDeleteCourseExecute = vi.fn();
vi.mock('@/application/use-cases/courses/delete-course.use-case', () => ({
  DeleteCourseUseCase: class {
    execute = mockDeleteCourseExecute;
  },
}));

import {
  addRoleOverrideAction,
  addUserOverrideAction,
  cancelJobAction,
  clearRateLimitBlockAction,
  createFeatureFlagAction,
  deleteAccessRuleAction,
  deleteCourseAction,
  deleteFeatureFlagAction,
  deleteNotificationAction,
  deleteTenantOverrideAction,
  getAllFeatureFlagsAction,
  getAllRolesAction,
  getCourseStatsAction,
  getFeatureFlagByIdAction,
  getJobStatusCountsAction,
  getJobsAction,
  getMyNotificationsAction,
  getNotificationsAction,
  getRateLimitRulesAction,
  getUnreadNotificationCountAction,
  markAllNotificationsAsReadAction,
  markNotificationAsReadAction,
  releaseStaleJobsAction,
  removeRoleOverrideAction,
  removeUserOverrideAction,
  retryJobAction,
  sendNotificationAction,
  toggleAccessRuleAction,
  toggleFeatureFlagAction,
  toggleRateLimitRuleAction,
  updateFeatureFlagAction,
  upsertTenantOverrideAction,
} from './admin.actions';

const ADMIN_CTX = {
  userId: 'user-1',
  tenantId: 'tenant-a',
  role: 'admin',
  permissions: ['settings.write', 'feature_flags.manage', 'jobs.manage'],
};

function ctxFor(overrides: { tenantId?: string | null; permissions?: string[] } = {}) {
  return {
    ...ADMIN_CTX,
    tenantId: overrides.tenantId === undefined ? ADMIN_CTX.tenantId : overrides.tenantId,
    permissions: overrides.permissions ?? ADMIN_CTX.permissions,
  };
}

describe('admin.actions.ts — remaining action surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditRecord.mockResolvedValue(undefined);
    mockGetAccessRuleTenantId.mockResolvedValue('tenant-a');
    mockDeleteAccessRuleAdmin.mockResolvedValue(undefined);
    mockToggleAccessRuleAdmin.mockResolvedValue(undefined);
    mockGetAllFeatureFlagsAdmin.mockResolvedValue([]);
    mockGetFeatureFlagByIdAdmin.mockResolvedValue({ id: 'flag-1', key: 'flag' });
    mockCreateFeatureFlagAdmin.mockResolvedValue({ id: 'flag-1', key: 'flag' });
    mockUpdateFeatureFlagAdmin.mockResolvedValue({ id: 'flag-1', key: 'flag' });
    mockDeleteFeatureFlagAdmin.mockResolvedValue(undefined);
    mockToggleFeatureFlagAdmin.mockResolvedValue(undefined);
    mockAddRoleOverrideAdmin.mockResolvedValue(undefined);
    mockRemoveRoleOverrideAdmin.mockResolvedValue(undefined);
    mockAddUserOverrideAdmin.mockResolvedValue(undefined);
    mockRemoveUserOverrideAdmin.mockResolvedValue(undefined);
    mockUpsertTenantOverrideAdmin.mockResolvedValue(undefined);
    mockDeleteTenantOverrideAdmin.mockResolvedValue(undefined);
    mockGetAllRolesAdmin.mockResolvedValue([{ id: 'role-1', name: 'Admin', key: 'admin' }]);
    mockGetJobs.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
    mockGetJobStatusCounts.mockResolvedValue({ queued: 1 });
    mockGetJobTenantId.mockResolvedValue('tenant-a');
    mockRetryJob.mockResolvedValue(undefined);
    mockCancelJob.mockResolvedValue(undefined);
    mockReleaseStaleJobs.mockResolvedValue(0);
    mockGetRateLimitRules.mockResolvedValue([]);
    mockToggleRateLimitRule.mockResolvedValue(undefined);
    mockGetRateLimitTenantId.mockResolvedValue('tenant-a');
    mockClearBlock.mockResolvedValue(undefined);
    mockGetCourseTenantId.mockResolvedValue('tenant-a');
    mockGetCourseStats.mockResolvedValue(null);
    mockRequireUser.mockResolvedValue('user-1');
    mockRequireUserContext.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-a' });
    mockRequireSuperAdmin.mockResolvedValue(ctxFor({ permissions: ['*'] }));
    mockListNotificationsExecute.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
    mockDeleteNotificationExecute.mockResolvedValue(undefined);
    mockSendNotificationExecute.mockResolvedValue('notification-1');
    mockGetMyNotificationsExecute.mockResolvedValue({ data: [], unread: 0 });
    mockGetUnreadCountExecute.mockResolvedValue(3);
    mockMarkAllReadExecute.mockResolvedValue(undefined);
    mockMarkOneReadExecute.mockResolvedValue(undefined);
    mockDeleteCourseExecute.mockResolvedValue({ success: true });
  });

  // ── access rules — mutations not covered by the tenant-scoping file ─────────

  describe('deleteAccessRuleAction / toggleAccessRuleAction', () => {
    it('guards the delete with assertSameTenant and records the audit entry', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await deleteAccessRuleAction('rule-1');

      expect(mockRequirePermission).toHaveBeenCalledWith([
        'settings.manage',
        'settings.write',
        'tenants.manage',
      ]);
      expect(mockAssertSameTenant).toHaveBeenCalledWith(ctxFor(), 'tenant-a');
      expect(mockDeleteAccessRuleAdmin).toHaveBeenCalledWith('rule-1');
      expect(mockAuditRecord).toHaveBeenCalledWith(
        ctxFor(),
        expect.objectContaining({ type: 'access_rule_deleted', riskLevel: 'medium' }),
      );
    });

    it('delegates toggle and records both the enabled and disabled summary', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await toggleAccessRuleAction('rule-1', true);
      await toggleAccessRuleAction('rule-1', false);

      expect(mockToggleAccessRuleAdmin).toHaveBeenNthCalledWith(1, 'rule-1', true);
      expect(mockToggleAccessRuleAdmin).toHaveBeenNthCalledWith(2, 'rule-1', false);
      expect(mockAuditRecord).toHaveBeenNthCalledWith(
        1,
        ctxFor(),
        expect.objectContaining({ summary: 'Access rule enabled' }),
      );
      expect(mockAuditRecord).toHaveBeenNthCalledWith(
        2,
        ctxFor(),
        expect.objectContaining({ summary: 'Access rule disabled' }),
      );
    });
  });

  // ── feature flags ────────────────────────────────────────────────────────────

  describe('feature flag CRUD', () => {
    it('createFeatureFlagAction delegates and audits with the created flag key', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());
      const input = { key: 'new-flag', enabled: false };

      const flag = await createFeatureFlagAction(input as never);

      expect(flag).toEqual({ id: 'flag-1', key: 'flag' });
      expect(mockRequirePermission).toHaveBeenCalledWith('feature_flags.manage');
      expect(mockCreateFeatureFlagAdmin).toHaveBeenCalledWith(input);
      expect(mockAuditRecord).toHaveBeenCalledWith(
        ctxFor(),
        expect.objectContaining({ type: 'feature_flag_created', details: { key: 'flag' } }),
      );
    });

    it('updateFeatureFlagAction delegates and audits with the updated flag key', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      const flag = await updateFeatureFlagAction('flag-1', { enabled: true } as never);

      expect(flag).toEqual({ id: 'flag-1', key: 'flag' });
      expect(mockUpdateFeatureFlagAdmin).toHaveBeenCalledWith('flag-1', { enabled: true });
      expect(mockAuditRecord).toHaveBeenCalledWith(
        ctxFor(),
        expect.objectContaining({ type: 'feature_flag_updated' }),
      );
    });

    it('deleteFeatureFlagAction delegates and audits', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await deleteFeatureFlagAction('flag-1');

      expect(mockDeleteFeatureFlagAdmin).toHaveBeenCalledWith('flag-1');
      expect(mockAuditRecord).toHaveBeenCalledWith(
        ctxFor(),
        expect.objectContaining({ type: 'feature_flag_deleted' }),
      );
    });

    it('toggleFeatureFlagAction records both the enabled and disabled summary', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await toggleFeatureFlagAction('flag-1', true);
      await toggleFeatureFlagAction('flag-1', false);

      expect(mockToggleFeatureFlagAdmin).toHaveBeenNthCalledWith(1, 'flag-1', true);
      expect(mockToggleFeatureFlagAdmin).toHaveBeenNthCalledWith(2, 'flag-1', false);
      expect(mockAuditRecord).toHaveBeenNthCalledWith(
        1,
        ctxFor(),
        expect.objectContaining({ summary: 'Feature flag enabled' }),
      );
      expect(mockAuditRecord).toHaveBeenNthCalledWith(
        2,
        ctxFor(),
        expect.objectContaining({ summary: 'Feature flag disabled' }),
      );
    });

    it('read-only actions pass straight through to the service', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await expect(getAllFeatureFlagsAction()).resolves.toEqual([]);
      await expect(getFeatureFlagByIdAction('flag-1')).resolves.toEqual({
        id: 'flag-1',
        key: 'flag',
      });
      await expect(getAllRolesAction()).resolves.toEqual([
        { id: 'role-1', name: 'Admin', key: 'admin' },
      ]);

      expect(mockGetAllFeatureFlagsAdmin).toHaveBeenCalledWith();
      expect(mockGetFeatureFlagByIdAdmin).toHaveBeenCalledWith('flag-1');
      expect(mockGetAllRolesAdmin).toHaveBeenCalledWith();
    });
  });

  describe('feature flag overrides', () => {
    it('addRoleOverrideAction passes the caller tenantId and defaults isExclude to false', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await addRoleOverrideAction('flag-1', 'role-1');

      expect(mockAddRoleOverrideAdmin).toHaveBeenCalledWith('flag-1', 'role-1', 'tenant-a', false);
    });

    it('addRoleOverrideAction forwards an explicit isExclude=true', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await addRoleOverrideAction('flag-1', 'role-1', true);

      expect(mockAddRoleOverrideAdmin).toHaveBeenCalledWith('flag-1', 'role-1', 'tenant-a', true);
    });

    it('removeRoleOverrideAction passes null for super_admin, own tenant otherwise', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));
      await removeRoleOverrideAction('flag-1', 'role-1');
      expect(mockRemoveRoleOverrideAdmin).toHaveBeenCalledWith('flag-1', 'role-1', null);

      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      await removeRoleOverrideAction('flag-1', 'role-1');
      expect(mockRemoveRoleOverrideAdmin).toHaveBeenLastCalledWith('flag-1', 'role-1', 'tenant-a');
    });

    it('addUserOverrideAction passes the caller tenantId (default not-excluded)', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await addUserOverrideAction('flag-1', 'user-9');

      expect(mockAddUserOverrideAdmin).toHaveBeenCalledWith('flag-1', 'user-9', 'tenant-a', false);
    });

    it('removeUserOverrideAction passes null for super_admin, own tenant otherwise', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));
      await removeUserOverrideAction('flag-1', 'user-9');
      expect(mockRemoveUserOverrideAdmin).toHaveBeenCalledWith('flag-1', 'user-9', null);

      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      await removeUserOverrideAction('flag-1', 'user-9');
      expect(mockRemoveUserOverrideAdmin).toHaveBeenLastCalledWith('flag-1', 'user-9', 'tenant-a');
    });

    it('upsertTenantOverrideAction — super_admin targets the requested tenant verbatim', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await upsertTenantOverrideAction('flag-1', 'tenant-z', true, 50);

      expect(mockUpsertTenantOverrideAdmin).toHaveBeenCalledWith('flag-1', 'tenant-z', true, 50);
    });

    it('upsertTenantOverrideAction — non-super_admin is pinned to their own tenant', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await upsertTenantOverrideAction('flag-1', 'tenant-z', false, null);

      expect(mockUpsertTenantOverrideAdmin).toHaveBeenCalledWith('flag-1', 'tenant-a', false, null);
    });

    it('upsertTenantOverrideAction — missing own tenantId falls back to the requested one', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: null }));

      await upsertTenantOverrideAction('flag-1', 'tenant-z', true, null);

      expect(mockUpsertTenantOverrideAdmin).toHaveBeenCalledWith('flag-1', 'tenant-z', true, null);
    });

    it('deleteTenantOverrideAction — super_admin targets the requested tenant verbatim', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await deleteTenantOverrideAction('flag-1', 'tenant-z');

      expect(mockDeleteTenantOverrideAdmin).toHaveBeenCalledWith('flag-1', 'tenant-z');
    });

    it('deleteTenantOverrideAction — non-super_admin pinned, with missing-tenant fallback', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      await deleteTenantOverrideAction('flag-1', 'tenant-z');
      expect(mockDeleteTenantOverrideAdmin).toHaveBeenNthCalledWith(1, 'flag-1', 'tenant-a');

      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: null }));
      await deleteTenantOverrideAction('flag-1', 'tenant-z');
      expect(mockDeleteTenantOverrideAdmin).toHaveBeenNthCalledWith(2, 'flag-1', 'tenant-z');
    });
  });

  describe('jobs', () => {
    it('getJobsAction scopes to the caller tenant; super_admin sees across tenants', async () => {
      const filters = { status: 'queued' } as never;

      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      await getJobsAction(filters, 1, 20);
      expect(mockRequirePermission).toHaveBeenCalledWith([
        'jobs.manage',
        'audit.read',
        'settings.write',
      ]);
      expect(mockGetJobs).toHaveBeenCalledWith(filters, 1, 20, 'tenant-a');

      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));
      await getJobsAction(filters, 2, 10);
      expect(mockGetJobs).toHaveBeenLastCalledWith(filters, 2, 10, null);
    });

    it('getJobStatusCountsAction scopes the same way as getJobsAction', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      await getJobStatusCountsAction();
      expect(mockGetJobStatusCounts).toHaveBeenCalledWith('tenant-a');

      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));
      await getJobStatusCountsAction();
      expect(mockGetJobStatusCounts).toHaveBeenLastCalledWith(null);
    });

    it('retryJobAction guards cross-tenant retries through assertSameTenant', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      mockGetJobTenantId.mockResolvedValue('tenant-a');

      await retryJobAction('job-1');

      expect(mockGetJobTenantId).toHaveBeenCalledWith('job-1');
      expect(mockAssertSameTenant).toHaveBeenCalledWith(ctxFor({ tenantId: 'tenant-a' }), 'tenant-a');
      expect(mockRetryJob).toHaveBeenCalledWith('job-1');
    });

    it('cancelJobAction guards cross-tenant cancels through assertSameTenant', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      mockGetJobTenantId.mockResolvedValue('tenant-a');

      await cancelJobAction('job-1');

      expect(mockGetJobTenantId).toHaveBeenCalledWith('job-1');
      expect(mockAssertSameTenant).toHaveBeenCalledWith(ctxFor({ tenantId: 'tenant-a' }), 'tenant-a');
      expect(mockCancelJob).toHaveBeenCalledWith('job-1');
    });

    it('releaseStaleJobsAction is super_admin only and skips requirePermission', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      const released = await releaseStaleJobsAction();

      expect(released).toBe(0);
      expect(mockRequireSuperAdmin).toHaveBeenCalledTimes(1);
      expect(mockRequirePermission).not.toHaveBeenCalled();
      expect(mockReleaseStaleJobs).toHaveBeenCalledWith();
    });
  });

  describe('notifications', () => {
    it('getNotificationsAction delegates to ListNotificationsUseCase.execute', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await getNotificationsAction(1, 20, 'all');

      expect(mockRequirePermission).toHaveBeenCalledWith(['notifications.send', 'settings.write']);
      expect(mockListNotificationsExecute).toHaveBeenCalledWith(
        ctxFor(),
        { page: 1, pageSize: 20, audience: 'all' },
      );
    });

    it('sendNotificationAction delegates and returns the created id', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());
      const input = { title: 'Hello', body: 'World', audience: 'all' } as never;

      const id = await sendNotificationAction(input);

      expect(id).toBe('notification-1');
      expect(mockSendNotificationExecute).toHaveBeenCalledWith(ctxFor(), input);
    });

    it('deleteNotificationAction delegates to DeleteNotificationUseCase.execute', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await deleteNotificationAction('notification-1');

      expect(mockRequirePermission).toHaveBeenCalledWith([
        'notifications.delete',
        'notifications.send',
        'settings.write',
      ]);
      expect(mockDeleteNotificationExecute).toHaveBeenCalledWith(ctxFor(), 'notification-1');
    });

    it('inbox actions authenticate with requireUser and use default limit/unreadOnly', async () => {
      const mine = await getMyNotificationsAction();
      expect(mine).toEqual({ data: [], unread: 0 });
      expect(mockGetMyNotificationsExecute).toHaveBeenCalledWith('user-1', 20, false);

      await getMyNotificationsAction(5, true);
      expect(mockGetMyNotificationsExecute).toHaveBeenLastCalledWith('user-1', 5, true);

      await markNotificationAsReadAction('notification-1');
      expect(mockMarkOneReadExecute).toHaveBeenCalledWith('user-1', 'notification-1');

      await markAllNotificationsAsReadAction();
      expect(mockMarkAllReadExecute).toHaveBeenCalledWith('user-1');
    });

    it('getUnreadNotificationCountAction returns the use-case count on success', async () => {
      await expect(getUnreadNotificationCountAction()).resolves.toBe(3);
      expect(mockGetUnreadCountExecute).toHaveBeenCalledWith('user-1');
    });

    it('getUnreadNotificationCountAction degrades to 0 instead of throwing', async () => {
      mockRequireUser.mockRejectedValueOnce(new Error('unauthenticated'));

      await expect(getUnreadNotificationCountAction()).resolves.toBe(0);
      expect(mockGetUnreadCountExecute).not.toHaveBeenCalled();
    });
  });

  describe('rate limits', () => {
    it('getRateLimitRulesAction passes straight through to the service', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await expect(getRateLimitRulesAction()).resolves.toEqual([]);

      expect(mockRequirePermission).toHaveBeenCalledWith(['audit.read', 'settings.write']);
      expect(mockGetRateLimitRules).toHaveBeenCalledWith();
    });

    it('toggleRateLimitRuleAction audits both the enabled and disabled summary', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor());

      await toggleRateLimitRuleAction('login.attempts', true);
      await toggleRateLimitRuleAction('login.attempts', false);

      expect(mockRequirePermission).toHaveBeenCalledWith('settings.write');
      expect(mockToggleRateLimitRule).toHaveBeenNthCalledWith(1, 'login.attempts', true);
      expect(mockToggleRateLimitRule).toHaveBeenNthCalledWith(2, 'login.attempts', false);
      expect(mockAuditRecord).toHaveBeenNthCalledWith(
        1,
        ctxFor(),
        expect.objectContaining({
          type: 'rate_limit_rule_toggled',
          summary: 'Rate limit rule enabled: login.attempts',
        }),
      );
      expect(mockAuditRecord).toHaveBeenNthCalledWith(
        2,
        ctxFor(),
        expect.objectContaining({
          summary: 'Rate limit rule disabled: login.attempts',
        }),
      );
    });

    it('clearRateLimitBlockAction guards the clear with assertSameTenant and audits', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await clearRateLimitBlockAction('block-1');

      expect(mockGetRateLimitTenantId).toHaveBeenCalledWith('block-1');
      expect(mockAssertSameTenant).toHaveBeenCalledWith(ctxFor({ tenantId: 'tenant-a' }), 'tenant-a');
      expect(mockClearBlock).toHaveBeenCalledWith('block-1');
      expect(mockAuditRecord).toHaveBeenCalledWith(
        ctxFor({ tenantId: 'tenant-a' }),
        expect.objectContaining({ type: 'rate_limit_block_cleared', riskLevel: 'medium' }),
      );
    });
  });

  describe('courses', () => {
    it('getCourseStatsAction enforces tenant scoping on the service-role read', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      mockGetCourseStats.mockResolvedValue({ courseId: 'course-1', enrollments: 5 });

      const stats = await getCourseStatsAction('course-1');

      expect(mockGetCourseTenantId).toHaveBeenCalledWith('course-1');
      expect(mockAssertSameTenant).toHaveBeenCalledWith(ctxFor({ tenantId: 'tenant-a' }), 'tenant-a');
      expect(mockGetCourseStats).toHaveBeenCalledWith('course-1');
      expect(stats).toEqual({ courseId: 'course-1', enrollments: 5 });
    });

    it('deleteCourseAction enforces tenant scoping and delegates to DeleteCourseUseCase', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      const result = await deleteCourseAction('course-1');

      expect(mockRequirePermission).toHaveBeenCalledWith(['courses.manage', 'courses.write']);
      expect(mockGetCourseTenantId).toHaveBeenCalledWith('course-1');
      expect(mockAssertSameTenant).toHaveBeenCalledWith(ctxFor({ tenantId: 'tenant-a' }), 'tenant-a');
      expect(mockDeleteCourseExecute).toHaveBeenCalledWith(ctxFor({ tenantId: 'tenant-a' }), 'course-1');
      expect(result).toEqual({ success: true });
    });
  });
});