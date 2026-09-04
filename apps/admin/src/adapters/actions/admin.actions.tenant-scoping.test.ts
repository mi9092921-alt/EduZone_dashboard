import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * admin.actions.ts — tenant-scoping / IDOR regression tests.
 *
 * These cover the audit fixes made across the "12 remaining service-role
 * files" pass (see PRODUCTION_READINESS_PLAN.md P1-SEC-005 follow-up):
 *
 *  - getAccessRulesAction / upsertAccessRuleAction: a non-super_admin
 *    caller must never be able to read or write another tenant's
 *    access rules, regardless of what `tenantId` / `rule.tenant_id` the
 *    client sends.
 *  - getAnalyticsCourseStatsAction, getActiveBlocksAction,
 *    getTopOffendersAction, getQueuedActivitiesAction: same class of fix
 *    for service-role list reads that previously had no tenant filter
 *    (or trusted a client-supplied tenantId) at all.
 *
 * super_admin (ctx.permissions includes '*') is exempt everywhere, matching
 * the existing assertSameTenant convention used by deleteCourseAction etc.
 */

const mockRequirePermission = vi.fn();
const mockRequireUserContext = vi.fn();
const mockRequireUser = vi.fn();
const mockAssertSameTenant = vi.fn();

vi.mock('@/adapters/actions/boundary', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
  requireUserContext: (...args: unknown[]) => mockRequireUserContext(...args),
  assertSameTenant: (...args: unknown[]) => mockAssertSameTenant(...args),
}));

const mockGetAccessRulesAdmin = vi.fn();
const mockUpsertAccessRuleAdmin = vi.fn();
const mockGetAccessRuleTenantId = vi.fn();
vi.mock('@/infrastructure/repos/access-rules.service', () => ({
  getAccessRulesAdmin: (...args: unknown[]) => mockGetAccessRulesAdmin(...args),
  upsertAccessRuleAdmin: (...args: unknown[]) => mockUpsertAccessRuleAdmin(...args),
  getAccessRuleTenantId: (...args: unknown[]) => mockGetAccessRuleTenantId(...args),
  deleteAccessRuleAdmin: vi.fn(),
  toggleAccessRuleAdmin: vi.fn(),
}));

const mockGetCourseStatsAnalytics = vi.fn();
vi.mock('@/infrastructure/repos/analytics.service', () => ({
  getCourseStats: (...args: unknown[]) => mockGetCourseStatsAnalytics(...args),
}));

const mockGetActiveBlocks = vi.fn();
const mockGetTopOffenders = vi.fn();
const mockGetRateLimitRules = vi.fn();
const mockToggleRateLimitRule = vi.fn();
const mockClearBlock = vi.fn();
const mockGetRateLimitTenantId = vi.fn();
vi.mock('@/infrastructure/repos/rate-limits.service', () => ({
  getActiveBlocks: (...args: unknown[]) => mockGetActiveBlocks(...args),
  getTopOffenders: (...args: unknown[]) => mockGetTopOffenders(...args),
  getRateLimitRules: (...args: unknown[]) => mockGetRateLimitRules(...args),
  toggleRateLimitRule: (...args: unknown[]) => mockToggleRateLimitRule(...args),
  clearBlock: (...args: unknown[]) => mockClearBlock(...args),
  getRateLimitTenantId: (...args: unknown[]) => mockGetRateLimitTenantId(...args),
}));

const mockGetQueuedActivities = vi.fn();
vi.mock('@/infrastructure/repos/audit.service', () => ({
  getQueuedActivities: (...args: unknown[]) => mockGetQueuedActivities(...args),
}));

const mockAuditRecord = vi.fn().mockResolvedValue(undefined);
vi.mock('@/infrastructure/observability/audit-logger.service', () => ({
  makeAuditLogger: () => ({ record: mockAuditRecord }),
}));

// Modules touched by admin.actions.ts that are irrelevant to this test file
// but must resolve cleanly (no createAdminClient anywhere in this file).
vi.mock('@/application/use-cases/courses/delete-course.use-case', () => ({
  DeleteCourseUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/notifications/inbox.use-case', () => ({
  GetMyNotificationsUseCase: vi.fn(),
  GetUnreadNotificationCountUseCase: vi.fn(),
  MarkAllNotificationsReadUseCase: vi.fn(),
  MarkNotificationReadUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/notifications/manage-notifications.use-case', () => ({
  DeleteNotificationUseCase: vi.fn(),
  ListNotificationsUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/notifications/send-notification.use-case', () => ({
  SendNotificationUseCase: vi.fn(),
}));
vi.mock('@/infrastructure/repos/course-admin.repository', () => ({
  makeCourseAdminRepository: vi.fn(),
}));
vi.mock('@/infrastructure/repos/courses.service', () => ({
  getCourseStats: vi.fn(),
}));
vi.mock('@/infrastructure/repos/feature-flags.service', () => ({}));
vi.mock('@/infrastructure/repos/jobs.service', () => ({}));
vi.mock('@/infrastructure/repos/notifications.repository', () => ({
  makeNotificationAdminRepository: vi.fn(),
}));

import {
  getAccessRulesAction,
  upsertAccessRuleAction,
  getAnalyticsCourseStatsAction,
  getActiveBlocksAction,
  getTopOffendersAction,
  getQueuedActivitiesAction,
} from './admin.actions';

function ctxFor(overrides: Partial<{ tenantId: string; permissions: string[] }> = {}) {
  return {
    userId: 'user-1',
    tenantId: overrides.tenantId ?? 'tenant-a',
    role: 'admin',
    permissions: overrides.permissions ?? ['settings.manage', 'audit.read', 'settings.write'],
  };
}

describe('admin.actions.ts — tenant-scoping IDOR guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessRulesAdmin.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
    mockUpsertAccessRuleAdmin.mockResolvedValue({ id: 'rule-1' });
    mockGetCourseStatsAnalytics.mockResolvedValue([]);
    mockGetActiveBlocks.mockResolvedValue([]);
    mockGetTopOffenders.mockResolvedValue([]);
    mockGetQueuedActivities.mockResolvedValue([]);
  });

  describe('getAccessRulesAction', () => {
    it('ignores a client-supplied tenantId for a non-super_admin caller and uses their own tenant', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await getAccessRulesAction('tenant-B-attacker-supplied', 1, 20);

      expect(mockGetAccessRulesAdmin).toHaveBeenCalledWith('tenant-a', 1, 20);
    });

    it('scopes to own tenant even when the caller omits tenantId entirely', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await getAccessRulesAction(undefined, 1, 20);

      expect(mockGetAccessRulesAdmin).toHaveBeenCalledWith('tenant-a', 1, 20);
    });

    it('allows a super_admin to pass through any tenantId (including undefined = all tenants)', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await getAccessRulesAction('tenant-B', 1, 20);
      expect(mockGetAccessRulesAdmin).toHaveBeenCalledWith('tenant-B', 1, 20);

      await getAccessRulesAction(undefined, 1, 20);
      expect(mockGetAccessRulesAdmin).toHaveBeenCalledWith(undefined, 1, 20);
    });
  });

  describe('upsertAccessRuleAction', () => {
    it('forces tenant_id to the caller own tenant on insert for a non-super_admin caller', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await upsertAccessRuleAction({
        tenant_id: 'tenant-B-attacker-supplied',
        rule_type: 'ip_whitelist',
        is_active: true,
      } as never);

      expect(mockUpsertAccessRuleAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-a' }),
      );
    });

    it('blocks updating another tenant existing rule even if tenant_id is forced', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));
      mockGetAccessRuleTenantId.mockResolvedValue('tenant-B');
      mockAssertSameTenant.mockImplementation((ctx, resourceTenantId) => {
        if (resourceTenantId !== ctx.tenantId) throw new Error('Cross-tenant access forbidden');
      });

      await expect(
        upsertAccessRuleAction({
          id: 'rule-owned-by-tenant-B',
          tenant_id: 'tenant-a',
          rule_type: 'ip_whitelist',
          is_active: true,
        } as never),
      ).rejects.toThrow('Cross-tenant access forbidden');

      expect(mockUpsertAccessRuleAdmin).not.toHaveBeenCalled();
    });

    it('allows a super_admin to write an explicit tenant_id as-is', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await upsertAccessRuleAction({
        tenant_id: 'tenant-B',
        rule_type: 'ip_whitelist',
        is_active: true,
      } as never);

      expect(mockUpsertAccessRuleAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-B' }),
      );
    });
  });

  describe('getAnalyticsCourseStatsAction', () => {
    it('overrides a client-supplied tenantId for a non-super_admin caller', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await getAnalyticsCourseStatsAction('tenant-B');

      expect(mockGetCourseStatsAnalytics).toHaveBeenCalledWith('tenant-a');
    });

    it('lets super_admin see across all tenants (undefined tenantId)', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await getAnalyticsCourseStatsAction(undefined);

      expect(mockGetCourseStatsAnalytics).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getActiveBlocksAction / getTopOffendersAction', () => {
    it('passes the caller own tenantId for a non-super_admin caller', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await getActiveBlocksAction();
      expect(mockGetActiveBlocks).toHaveBeenCalledWith('tenant-a');

      await getTopOffendersAction();
      expect(mockGetTopOffenders).toHaveBeenCalledWith('tenant-a');
    });

    it('passes undefined (all tenants) for a super_admin caller', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await getActiveBlocksAction();
      expect(mockGetActiveBlocks).toHaveBeenCalledWith(undefined);

      await getTopOffendersAction();
      expect(mockGetTopOffenders).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getQueuedActivitiesAction', () => {
    it('scopes to the caller tenant when they hold audit.read', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ tenantId: 'tenant-a' }));

      await getQueuedActivitiesAction(50);

      expect(mockGetQueuedActivities).toHaveBeenCalledWith(50, 'tenant-a');
    });

    it('super_admin with audit.read sees across all tenants', async () => {
      mockRequirePermission.mockResolvedValue(ctxFor({ permissions: ['*'] }));

      await getQueuedActivitiesAction(50);

      expect(mockGetQueuedActivities).toHaveBeenCalledWith(50, undefined);
    });

    it('falls back to any authenticated user, still scoped to their own tenant (never cross-tenant)', async () => {
      mockRequirePermission.mockRejectedValue(new Error('forbidden'));
      mockRequireUserContext.mockResolvedValue({ userId: 'user-2', tenantId: 'tenant-c' });

      await getQueuedActivitiesAction(50);

      expect(mockGetQueuedActivities).toHaveBeenCalledWith(50, 'tenant-c');
    });
  });
});
