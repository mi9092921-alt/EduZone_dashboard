'use server';

import type { AccessRule, PaginatedResult } from '@eduzone/types';

import type { SendNotificationInput } from '@/adapters/mutations/notifications.mutations';
import type {
  Notification,
  UserNotification,
  TargetAudience,
} from '@/adapters/queries/notifications.queries';
import { authorizeCaller } from '@/application/authorization/authorization.service';
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
  RateLimitRule,
  RateLimitWithEmail,
  TopOffender,
} from '@/domain/types/rate-limit.types';
import * as accessRulesService from '@/infrastructure/repos/access-rules.service';
import * as analyticsService from '@/infrastructure/repos/analytics.service';
import * as auditService from '@/infrastructure/repos/audit.service';
import * as coursesService from '@/infrastructure/repos/courses.service';
import * as featureFlagsService from '@/infrastructure/repos/feature-flags.service';
import * as jobsService from '@/infrastructure/repos/jobs.service';
import * as rateLimitsService from '@/infrastructure/repos/rate-limits.service';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createServerClient } from '@/infrastructure/supabase/server';


async function requirePermission(permission: string | string[]) {
  const supabase = await createServerClient();
  const ctx = await authorizeCaller(supabase, permission);
  return { userId: ctx.userId, tenantId: ctx.tenantId as string | null };
}


async function requireUser() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('Unauthorized');
  return data.user.id;
}

async function getTargetUserIds(
  admin: ReturnType<typeof createAdminClient>,
  input: SendNotificationInput,
  tenantId: string,
): Promise<string[]> {
  if (input.target_user_ids?.length) return input.target_user_ids;

  if (input.target_permission) {
    // Get role IDs that possess this permission
    const { data: rolePerms, error: rpError } = await admin
      .from('role_permissions')
      .select('role_id, permissions!inner(name)')
      .eq('permissions.name', input.target_permission);
    if (rpError) throw rpError;

    const roleIdsWithPermission = new Set((rolePerms ?? []).map((rp) => rp.role_id));
    if (roleIdsWithPermission.size === 0) return [];

    // Find all active users assigned to any of these roles
    const { data: activeUsersWithRole, error: activeError } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .in('role_id', Array.from(roleIdsWithPermission));
    if (activeError) throw activeError;

    return Array.from(new Set((activeUsersWithRole ?? []).map((ur) => ur.user_id as string)));
  }

  let query = admin
    .from('users')
    .select('id, primary_role')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (input.target_audience === 'students') query = query.eq('primary_role', 'student');
  if (input.target_audience === 'teachers') query = query.eq('primary_role', 'teacher');
  if (input.target_audience === 'admins')
    query = query.in('primary_role', ['admin', 'super_admin']);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function getAccessRulesAction(
  tenantId?: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<AccessRule>> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  return accessRulesService.getAccessRulesAdmin(tenantId, page, pageSize);
}

export async function upsertAccessRuleAction(rule: Partial<AccessRule>): Promise<AccessRule> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  return accessRulesService.upsertAccessRuleAdmin(rule);
}

export async function deleteAccessRuleAction(id: string): Promise<void> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  return accessRulesService.deleteAccessRuleAdmin(id);
}

export async function toggleAccessRuleAction(id: string, isActive: boolean): Promise<void> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  return accessRulesService.toggleAccessRuleAdmin(id, isActive);
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
  await requirePermission('feature_flags.manage');
  return featureFlagsService.createFeatureFlagAdmin(input);
}

export async function updateFeatureFlagAction(
  id: string,
  input: UpdateFeatureFlagInput,
): Promise<FeatureFlag> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.updateFeatureFlagAdmin(id, input);
}

export async function deleteFeatureFlagAction(id: string): Promise<void> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.deleteFeatureFlagAdmin(id);
}

export async function toggleFeatureFlagAction(id: string, enabled: boolean): Promise<void> {
  await requirePermission('feature_flags.manage');
  return featureFlagsService.toggleFeatureFlagAdmin(id, enabled);
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
): Promise<{
  data: Notification[];
  count: number;
  stats: { all: number; students: number; teachers: number; admins: number };
}> {
  const { tenantId } = await requirePermission(['notifications.send', 'settings.write']);
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from('notifications').select('*', { count: 'exact' }).is('deleted_at', null);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  if (audience && audience !== 'all') {
    query = query.eq('target_audience', audience);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  // Fetch total stats for stats cards (unpaginated counts) scoped to tenant
  let statsQuery = admin
    .from('notifications')
    .select('target_audience')
    .is('deleted_at', null);

  if (tenantId) {
    statsQuery = statsQuery.eq('tenant_id', tenantId);
  }

  const { data: allAudienceData, error: statsError } = await statsQuery;
  if (statsError) throw statsError;

  const stats = {
    all: (allAudienceData ?? []).length,
    students: (allAudienceData ?? []).filter((n) => n.target_audience === 'students').length,
    teachers: (allAudienceData ?? []).filter((n) => n.target_audience === 'teachers').length,
    admins: (allAudienceData ?? []).filter((n) => n.target_audience === 'admins').length,
  };

  return {
    data: (data ?? []) as Notification[],
    count: count ?? 0,
    stats,
  };
}

export async function sendNotificationAction(input: SendNotificationInput): Promise<string> {
  const { userId, tenantId } = await requirePermission(['notifications.send', 'settings.write']);
  if (!tenantId) throw new Error('Tenant context is missing');
  const admin = createAdminClient();

  const targetUserIds = await getTargetUserIds(admin, input, tenantId);
  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      title: input.title.trim(),
      body: input.body.trim(),
      target_audience: input.target_audience ?? 'all',
      target_permission: input.target_permission || null,
      created_by: userId,
    })
    .select('id')
    .single();
  if (notificationError) throw notificationError;

  const notificationId = notification.id as string;
  if (targetUserIds.length) {
    const targetRows = targetUserIds.map((targetUserId) => ({
      notification_id: notificationId,
      user_id: targetUserId,
    }));
    const { error: targetError } = await admin.from('notification_targets').upsert(targetRows, {
      onConflict: 'notification_id,user_id',
      ignoreDuplicates: true,
    });
    if (targetError) throw targetError;

    const rows = targetUserIds.map((targetUserId) => ({
      user_id: targetUserId,
      tenant_id: tenantId,
      notification_id: notificationId,
      is_read: false,
    }));

    const { error: fanoutError } = await admin.from('user_notifications').upsert(rows, {
      onConflict: 'user_id,notification_id',
      ignoreDuplicates: true,
    });
    if (fanoutError) throw fanoutError;
  }

  // BUG-PUSH-INSTANT: Immediately process notification fanout and trigger FCM push worker
  // so student devices receive notifications in real-time without waiting for periodic cron.
  try {
    const workerId = crypto.randomUUID();
    await admin.rpc('process_notification_fanout_jobs', {
      p_limit: 500,
      p_worker_id: workerId,
    });
    await admin.rpc('invoke_notification_push_worker');
  } catch (pushErr) {
    console.error('[SEND_NOTIFICATION_ACTION_PUSH_ERROR]', pushErr);
  }

  return notificationId;
}

export async function deleteNotificationAction(id: string): Promise<void> {
  const { tenantId } = await requirePermission(['notifications.delete', 'notifications.send', 'settings.write']);
  const admin = createAdminClient();
  let query = admin
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function getMyNotificationsAction(
  limit = 20,
  unreadOnly = false,
): Promise<{ data: UserNotification[]; unreadCount: number }> {
  try {
    const userId = await requireUser();
    const admin = createAdminClient();

    let query = admin
      .from('user_notifications')
      .select('*, notifications!user_notifications_notification_id_fkey(title, body)', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) throw error;

    const { count, error: countError } = await admin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (countError) throw countError;

    return {
      data: (data ?? []).map(
        (row: {
          id: string;
          user_id: string;
          notification_id: string;
          is_read: boolean;
          created_at: string;
          notifications?: { title: string; body: string } | null;
        }) => ({
          ...row,
          title: row.notifications?.title ?? '',
          body: row.notifications?.body ?? '',
          type: 'system_alert',
          link_to: null,
          notifications: undefined,
        }),
      ) as UserNotification[],
      unreadCount: count ?? 0,
    };
  } catch (error) {
    console.error('[getMyNotificationsAction]', error);
    return { data: [], unreadCount: 0 };
  }
}

export async function markNotificationAsReadAction(id: string): Promise<void> {
  const userId = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function markAllNotificationsAsReadAction(): Promise<void> {
  const userId = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from('user_notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  try {
    const userId = await requireUser();
    const admin = createAdminClient();
    const { count, error } = await admin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
    return count ?? 0;
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
  try {
    // Prefer callers with audit.read — super_admin gets a free pass via requirePermission
    await requirePermission('audit.read');
  } catch {
    // Fallback: any authenticated user may see queue entries (they are non-PII)
    await requireUser();
  }

  return auditService.getQueuedActivities(limit);
}


export async function getActiveBlocksAction(): Promise<RateLimitWithEmail[]> {
  await requirePermission(['audit.read', 'settings.write']);
  return rateLimitsService.getActiveBlocks();
}

export async function getRateLimitRulesAction(): Promise<RateLimitRule[]> {
  await requirePermission(['audit.read', 'settings.write']);
  return rateLimitsService.getRateLimitRules();
}

export async function toggleRateLimitRuleAction(action: string, isActive: boolean): Promise<void> {
  await requirePermission('settings.write');
  return rateLimitsService.toggleRateLimitRule(action, isActive);
}

export async function clearRateLimitBlockAction(id: string): Promise<void> {
  await requirePermission(['audit.read', 'settings.write']);
  return rateLimitsService.clearBlock(id);
}

export async function getTopOffendersAction(): Promise<TopOffender[]> {
  await requirePermission(['audit.read', 'settings.write']);
  return rateLimitsService.getTopOffenders();
}

export async function getAnalyticsCourseStatsAction(tenantId?: string): Promise<CourseWithStats[]> {
  await requirePermission(['reports.read', 'courses.read', 'audit.read']);
  return analyticsService.getCourseStats(tenantId);
}

export async function getCourseStatsAction(courseId: string): Promise<CourseStats | null> {
  await requirePermission(['reports.read', 'courses.read']);
  return coursesService.getCourseStats(courseId);
}

export async function deleteCourseAction(id: string): Promise<void> {
  await requirePermission(['courses.manage', 'courses.write']);
  return coursesService.deleteCourse(id);
}
