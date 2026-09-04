'use server';

import type { AccessRule, PaginatedResult } from '@eduzone/types';

import {
  assertSameTenant,
  requirePermission,
  requireUser,
  requireUserContext,
} from '@/adapters/actions/boundary';
import { DeleteCourseUseCase } from '@/application/use-cases/courses/delete-course.use-case';
import {
  GetMyNotificationsUseCase,
  GetUnreadNotificationCountUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from '@/application/use-cases/notifications/inbox.use-case';
import {
  DeleteNotificationUseCase,
  ListNotificationsUseCase,
} from '@/application/use-cases/notifications/manage-notifications.use-case';
import { SendNotificationUseCase } from '@/application/use-cases/notifications/send-notification.use-case';
import type { UpsertAccessRuleInput } from '@/domain/schemas/settings.schema';
import type { CourseWithStats } from '@/domain/types/analytics.types';
import type { ActivityLogQueueEntry } from '@/domain/types/audit.types';
import type { CourseStats } from '@/domain/types/course.types';
import type {
  FeatureFlag,
  FeatureFlagDetail,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
} from '@/domain/types/feature-flag.types';
import type { Job, JobFilters, JobStatusCounts } from '@/domain/types/job.types';
import type {
  MyNotificationsResult,
  NotificationListResult,
  SendNotificationInput,
  TargetAudience,
} from '@/domain/types/notification.types';
import type {
  RateLimitRule,
  RateLimitWithEmail,
  TopOffender,
} from '@/domain/types/rate-limit.types';
import { makeAuditLogger } from '@/infrastructure/observability/audit-logger.service';
import * as accessRulesService from '@/infrastructure/repos/access-rules.service';
import * as analyticsService from '@/infrastructure/repos/analytics.service';
import * as auditService from '@/infrastructure/repos/audit.service';
import { makeCourseAdminRepository } from '@/infrastructure/repos/course-admin.repository';
import * as coursesService from '@/infrastructure/repos/courses.service';
import * as featureFlagsService from '@/infrastructure/repos/feature-flags.service';
import * as jobsService from '@/infrastructure/repos/jobs.service';
import { makeNotificationAdminRepository } from '@/infrastructure/repos/notifications.repository';
import * as rateLimitsService from '@/infrastructure/repos/rate-limits.service';

/**
 * Thin Server-Action boundary — every exported action follows the contract:
 *
 *   validate → authenticate/authorize (boundary gate) → execute use case
 *   or infrastructure service → map response
 *
 * No business rules, no service-role client creation, and no DB
 * orchestration live here anymore:
 *  - Notification domain logic → application/use-cases/notifications/*
 *    backed by infrastructure/repos/notifications.repository.ts
 *  - Everything else delegates to the domain services under
 *    infrastructure/repos/ (as before).
 * The service-role client (`createAdminClient`) is no longer imported in
 * this file — it lives exclusively in the repository implementations.
 */

export async function getAccessRulesAction(
  tenantId?: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<AccessRule>> {
  const ctx = await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  // IDOR guard: getAccessRulesAdmin reads via the service-role client
  // (bypasses RLS). `tenantId` was previously taken from the caller
  // as-is — a non-super_admin caller could pass another tenant's id (or
  // omit it) to read every tenant's access rules. Non-super_admin callers
  // are pinned to their own tenant; only super_admin may choose/omit one.
  const scopedTenantId = ctx.permissions.includes('*') ? tenantId : ctx.tenantId;
  return accessRulesService.getAccessRulesAdmin(scopedTenantId, page, pageSize);
}

export async function upsertAccessRuleAction(
  rule: UpsertAccessRuleInput,
): Promise<AccessRule> {
  const ctx = await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  // IDOR/BOLA guard: upsertAccessRuleAdmin writes via the service-role
  // client (bypasses RLS). Without this guard a non-super_admin caller
  // could create/overwrite an access rule (IP whitelist, time window,
  // geo, device-type) in ANY tenant by setting `tenant_id` (insert) or
  // `id` (update) to another tenant's values — same class of bug as
  // deleteCourseAction / assertSameTenant.
  if (rule.id) {
    assertSameTenant(ctx, await accessRulesService.getAccessRuleTenantId(rule.id));
  }
  const scopedRule = ctx.permissions.includes('*')
    ? rule
    : { ...rule, tenant_id: ctx.tenantId };
  const saved = await accessRulesService.upsertAccessRuleAdmin(scopedRule);
  // M13: settings change is an audited operation (the boundary owns the ctx;
  // the details never carry rule internals — just the target + tenant).
  await makeAuditLogger().record(ctx, {
    type: 'access_rule_upserted',
    summary: 'Access rule created or updated',
    riskLevel: 'medium',
  });
  return saved;
}

export async function deleteAccessRuleAction(id: string): Promise<void> {
  const ctx = await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  assertSameTenant(ctx, await accessRulesService.getAccessRuleTenantId(id));
  await accessRulesService.deleteAccessRuleAdmin(id);
  await makeAuditLogger().record(ctx, {
    type: 'access_rule_deleted',
    summary: 'Access rule deleted',
    riskLevel: 'medium',
  });
}

export async function toggleAccessRuleAction(id: string, isActive: boolean): Promise<void> {
  const ctx = await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  assertSameTenant(ctx, await accessRulesService.getAccessRuleTenantId(id));
  await accessRulesService.toggleAccessRuleAdmin(id, isActive);
  await makeAuditLogger().record(ctx, {
    type: 'access_rule_toggled',
    summary: `Access rule ${isActive ? 'enabled' : 'disabled'}`,
    riskLevel: 'medium',
  });
}

export async function getAllFeatureFlagsAction(): Promise<FeatureFlag[]> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.getAllFeatureFlagsAdmin();
}

export async function getFeatureFlagByIdAction(id: string): Promise<FeatureFlagDetail> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.getFeatureFlagByIdAdmin(id);
}

export async function createFeatureFlagAction(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
  const ctx = await requirePermission('feature_flags.manage');
  const flag = await featureFlagsService.createFeatureFlagAdmin(input);
  await makeAuditLogger().record(ctx, {
    type: 'feature_flag_created',
    summary: 'Feature flag created',
    details: { key: flag.key },
    riskLevel: 'medium',
  });
  return flag;
}

export async function updateFeatureFlagAction(
  id: string,
  input: UpdateFeatureFlagInput,
): Promise<FeatureFlag> {
  const ctx = await requirePermission('feature_flags.manage');
  const flag = await featureFlagsService.updateFeatureFlagAdmin(id, input);
  await makeAuditLogger().record(ctx, {
    type: 'feature_flag_updated',
    summary: 'Feature flag updated',
    details: { key: flag.key },
    riskLevel: 'medium',
  });
  return flag;
}

export async function deleteFeatureFlagAction(id: string): Promise<void> {
  const ctx = await requirePermission('feature_flags.manage');
  await featureFlagsService.deleteFeatureFlagAdmin(id);
  await makeAuditLogger().record(ctx, {
    type: 'feature_flag_deleted',
    summary: 'Feature flag deleted',
    riskLevel: 'medium',
  });
}

export async function toggleFeatureFlagAction(id: string, enabled: boolean): Promise<void> {
  const ctx = await requirePermission('feature_flags.manage');
  await featureFlagsService.toggleFeatureFlagAdmin(id, enabled);
  await makeAuditLogger().record(ctx, {
    type: 'feature_flag_toggled',
    summary: `Feature flag ${enabled ? 'enabled' : 'disabled'}`,
    riskLevel: 'medium',
  });
}

export async function addRoleOverrideAction(
  flagId: string,
  roleId: string,
  _isExclude = false,
): Promise<void> {
  const { tenantId } = await requirePermission('feature_flags.manage');
  return featureFlagsService.addRoleOverrideAdmin(flagId, roleId, tenantId);
}

export async function removeRoleOverrideAction(flagId: string, roleId: string): Promise<void> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.removeRoleOverrideAdmin(flagId, roleId);
}

export async function addUserOverrideAction(
  flagId: string,
  userId: string,
  _isExclude = false,
): Promise<void> {
  const { tenantId } = await requirePermission('feature_flags.manage');
  return featureFlagsService.addUserOverrideAdmin(flagId, userId, tenantId);
}

export async function removeUserOverrideAction(flagId: string, userId: string): Promise<void> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.removeUserOverrideAdmin(flagId, userId);
}

export async function getAllRolesAction(): Promise<{ id: string; name: string; key: string }[]> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.getAllRolesAdmin();
}

export async function getJobsAction(
  filters: JobFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Job>> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  return jobsService.getJobs(filters, page, pageSize);
}

export async function getJobStatusCountsAction(): Promise<JobStatusCounts> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  return jobsService.getJobStatusCounts();
}

export async function retryJobAction(id: string): Promise<void> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  return jobsService.retryJob(id);
}

export async function cancelJobAction(id: string): Promise<void> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  return jobsService.cancelJob(id);
}

export async function releaseStaleJobsAction(): Promise<number> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  return jobsService.releaseStaleJobs();
}

export async function getNotificationsAction(
  page: number,
  pageSize: number,
  audience?: TargetAudience | 'all',
): Promise<NotificationListResult> {
  const ctx = await requirePermission(['notifications.send', 'settings.write']);
  return new ListNotificationsUseCase(makeNotificationAdminRepository()).execute(ctx, {
    page,
    pageSize,
    audience,
  });
}

export async function sendNotificationAction(input: SendNotificationInput): Promise<string> {
  const ctx = await requirePermission(['notifications.send', 'settings.write']);
  return new SendNotificationUseCase(makeNotificationAdminRepository(), makeAuditLogger()).execute(
    ctx,
    input,
  );
}

export async function deleteNotificationAction(id: string): Promise<void> {
  const ctx = await requirePermission([
    'notifications.delete',
    'notifications.send',
    'settings.write',
  ]);
  return new DeleteNotificationUseCase(makeNotificationAdminRepository(), makeAuditLogger()).execute(
    ctx,
    id,
  );
}

export async function getMyNotificationsAction(
  limit = 20,
  unreadOnly = false,
): Promise<MyNotificationsResult> {
  const userId = await requireUser();
  return new GetMyNotificationsUseCase(makeNotificationAdminRepository()).execute(
    userId,
    limit,
    unreadOnly,
  );
}

export async function markNotificationAsReadAction(id: string): Promise<void> {
  const userId = await requireUser();
  return new MarkNotificationReadUseCase(makeNotificationAdminRepository()).execute(userId, id);
}

export async function markAllNotificationsAsReadAction(): Promise<void> {
  const userId = await requireUser();
  return new MarkAllNotificationsReadUseCase(makeNotificationAdminRepository()).execute(userId);
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  try {
    const userId = await requireUser();
    return await new GetUnreadNotificationCountUseCase(makeNotificationAdminRepository()).execute(
      userId,
    );
  } catch (error) {
    console.error('[getUnreadNotificationCountAction]', error);
    return 0;
  }
}

// ── Get queued (unflushed) activities — must use service role ─────────────────
// activity_log_queue has REVOKE ALL for anon/authenticated + deny-all RLS policy,
// so the browser Supabase client always gets 403. Route through a server action
// that uses the admin (service-role) client which bypasses both.
export async function getQueuedActivitiesAction(
  limit: number = 200,
): Promise<ActivityLogQueueEntry[]> {
  // IDOR guard: getQueuedActivities reads via the service-role client
  // (activity_log_queue has deny-all RLS). Rows carry tenant_id,
  // user_id, ip_address and a free-form `details` payload — not the
  // "non-PII" data the fallback path below assumed — so every caller,
  // including the no-permission fallback, must be scoped to their own
  // tenant. Only a caller holding audit.read AND super_admin sees
  // across tenants.
  let tenantId: string;
  let isSuperAdmin = false;
  try {
    // Prefer callers with audit.read — super_admin gets a free pass via requirePermission
    const ctx = await requirePermission('audit.read');
    tenantId = ctx.tenantId;
    isSuperAdmin = ctx.permissions.includes('*');
  } catch {
    // Fallback: any authenticated user may see queue entries for their
    // OWN tenant (intentional low bar for this dashboard widget — but
    // never cross-tenant).
    const ctx = await requireUserContext();
    tenantId = ctx.tenantId;
  }

  return auditService.getQueuedActivities(limit, isSuperAdmin ? undefined : tenantId);
}


export async function getActiveBlocksAction(): Promise<RateLimitWithEmail[]> {
  const ctx = await requirePermission(['audit.read', 'settings.write']);
  // IDOR guard: getActiveBlocks reads via the service-role client and
  // rate_limits carries tenant_id + user email/IP — scope to the
  // caller's own tenant; only super_admin sees across tenants.
  return rateLimitsService.getActiveBlocks(
    ctx.permissions.includes('*') ? undefined : ctx.tenantId,
  );
}

export async function getRateLimitRulesAction(): Promise<RateLimitRule[]> {
  await requirePermission(['audit.read', 'settings.write']);
  return rateLimitsService.getRateLimitRules();
}

export async function toggleRateLimitRuleAction(action: string, isActive: boolean): Promise<void> {
  const ctx = await requirePermission('settings.write');
  await rateLimitsService.toggleRateLimitRule(action, isActive);
  await makeAuditLogger().record(ctx, {
    type: 'rate_limit_rule_toggled',
    summary: `Rate limit rule ${isActive ? 'enabled' : 'disabled'}: ${action}`,
    riskLevel: 'medium',
  });
}

export async function clearRateLimitBlockAction(id: string): Promise<void> {
  const ctx = await requirePermission(['audit.read', 'settings.write']);
  assertSameTenant(ctx, await rateLimitsService.getRateLimitTenantId(id));
  await rateLimitsService.clearBlock(id);
  await makeAuditLogger().record(ctx, {
    type: 'rate_limit_block_cleared',
    summary: 'Rate limit block cleared',
    riskLevel: 'medium',
  });
}

export async function getTopOffendersAction(): Promise<TopOffender[]> {
  const ctx = await requirePermission(['audit.read', 'settings.write']);
  // IDOR guard — same as getActiveBlocksAction.
  return rateLimitsService.getTopOffenders(
    ctx.permissions.includes('*') ? undefined : ctx.tenantId,
  );
}

export async function getAnalyticsCourseStatsAction(tenantId?: string): Promise<CourseWithStats[]> {
  const ctx = await requirePermission(['reports.read', 'courses.read', 'audit.read']);
  // IDOR guard: getCourseStats reads via the service-role client. The
  // `tenantId` argument was previously passed through unchecked — a
  // non-super_admin caller could pass another tenant's id (or omit it)
  // to see top-course/enrollment analytics across every tenant.
  const scopedTenantId = ctx.permissions.includes('*') ? tenantId : ctx.tenantId;
  return analyticsService.getCourseStats(scopedTenantId);
}

export async function getCourseStatsAction(courseId: string): Promise<CourseStats | null> {
  const ctx = await requirePermission(['reports.read', 'courses.read']);
  // getCourseStats reads via the service-role client (bypasses RLS), so —
  // same as deleteCourseAction — tenant scoping must be enforced here.
  // (Currently unused by any UI, but left unguarded it is a cross-tenant
  // read landmine for the next caller that wires it up.)
  assertSameTenant(ctx, await coursesService.getCourseTenantId(courseId));
  return coursesService.getCourseStats(courseId);
}

export async function deleteCourseAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await requirePermission(['courses.manage', 'courses.write']);
  // IDOR/BOLA guard: deleteCourse goes through the service-role client
  // (bypasses RLS), so tenant scoping MUST be enforced here at the
  // boundary — same pattern as deleteUserAction / assertSameTenant.
  assertSameTenant(ctx, await coursesService.getCourseTenantId(id));
  return new DeleteCourseUseCase(makeCourseAdminRepository(), makeAuditLogger()).execute(ctx, id);
}
