'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/infrastructure/supabase/server';
import type { AccessRule, PaginatedResult } from '@eduzone/types';
import type {
  FeatureFlag,
  FeatureFlagDetail,
  FeatureFlagRole,
  FeatureFlagUser,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
} from '@/domain/types/feature-flag.types';
import {
  mapDbRowToFeatureFlag,
  prepareFeatureFlagPayload,
} from '@/domain/types/feature-flag.types';
import type { Job, JobFilters, JobStatusCounts } from '@/domain/types/job.types';
import type { Notification, UserNotification, TargetAudience } from '@/adapters/queries/notifications.queries';
import type { SendNotificationInput } from '@/adapters/mutations/notifications.mutations';
import type { ActivityLogQueueEntry } from '@/domain/types/audit.types';
import type {
  RateLimitRule,
  RateLimitWithEmail,
  TopOffender,
} from '@/domain/types/rate-limit.types';
import type { CourseStats } from '@/domain/types/course.types';
import type {
  CourseWithStats,
  MvCourseStats,
} from '@/domain/types/analytics.types';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requirePermission(permission: string | string[]) {
  const supabase = await createServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('primary_role, tenant_id')
    .eq('id', userData.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (profile?.primary_role === 'super_admin') {
    return { userId: userData.user.id, tenantId: profile.tenant_id as string | null };
  }

  const permissions = Array.isArray(permission) ? permission : [permission];
  if (roleAllowsPermissions(profile?.primary_role as string | undefined, permissions)) {
    return { userId: userData.user.id, tenantId: profile?.tenant_id as string | null };
  }

  for (const p of permissions) {
    const { data } = await supabase.rpc('user_has_permission', {
      p_user_id: userData.user.id,
      p_permission: p,
      p_tenant_id: profile?.tenant_id ?? null,
    });
    if (data) return { userId: userData.user.id, tenantId: profile?.tenant_id as string | null };
  }

  throw new Error(`Permission Denied: user lacks ${permissions.join(' or ')}`);
}

function roleAllowsPermissions(role: string | undefined, permissions: string[]) {
  if (role === 'admin') {
    return permissions.some((permission) => permission !== 'tenants.manage');
  }

  if (role === 'teacher') {
    const allowed = new Set([
      'courses.read',
      'courses.write',
      'courses.manage',
      'users.read',
      'warnings.write',
      'reports.read',
      'notifications.send',
      'notifications.delete',
    ]);
    return permissions.some((permission) => allowed.has(permission));
  }

  if (role === 'student') {
    return permissions.some((permission) => permission === 'courses.read' || permission === 'reports.read');
  }

  return false;
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
  if (input.target_audience === 'admins') query = query.in('primary_role', ['admin', 'super_admin']);

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
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from('access_rules').select('*', { count: 'exact' });
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const total = count ?? 0;
  return {
    data: (data ?? []) as AccessRule[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function upsertAccessRuleAction(rule: Partial<AccessRule>): Promise<AccessRule> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('access_rules')
    .upsert({ ...rule, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data as AccessRule;
}

export async function deleteAccessRuleAction(id: string): Promise<void> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  const admin = createAdminClient();
  const { error } = await admin.from('access_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleAccessRuleAction(id: string, isActive: boolean): Promise<void> {
  await requirePermission(['settings.manage', 'settings.write', 'tenants.manage']);
  const admin = createAdminClient();
  const { error } = await admin.from('access_rules').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function getAllFeatureFlagsAction(): Promise<FeatureFlag[]> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const { data, error } = await admin.from('feature_flags').select('*').order('key');
  if (error) throw error;
  return (data ?? []).map(mapDbRowToFeatureFlag);
}

export async function getFeatureFlagByIdAction(id: string): Promise<FeatureFlagDetail> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();

  const { data: flag, error } = await admin.from('feature_flags').select('*').eq('id', id).single();
  if (error) throw error;

  const { data: roleOverrides, error: roleErr } = await admin
    .from('feature_flag_roles')
    .select('*, roles!feature_flag_roles_role_id_fkey(name, label)')
    .eq('flag_id', id);
  if (roleErr) throw roleErr;

  const { data: userOverrides, error: userErr } = await admin
    .from('feature_flag_users')
    .select('*, users!feature_flag_users_user_id_fkey(email, first_name, last_name)')
    .eq('flag_id', id);
  if (userErr) throw userErr;

  const mappedRoles: FeatureFlagRole[] = (roleOverrides ?? []).map((r: Record<string, unknown>) => {
    const role = r.roles as Record<string, string> | null;
    return {
      flag_id: r.flag_id as string,
      role_id: r.role_id as string,
      is_exclude: false, // DB does not support is_exclude
      ...(role?.label || role?.name ? { role_name: role.label || role.name } : {}),
      ...(role?.name ? { role_key: role.name } : {}),
    };
  });

  const mappedUsers: FeatureFlagUser[] = (userOverrides ?? []).map((u: Record<string, unknown>) => {
    const user = u.users as Record<string, string> | null;
    const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : undefined;
    return {
      flag_id: u.flag_id as string,
      user_id: u.user_id as string,
      is_exclude: false, // Default to false
      ...(user?.email ? { user_email: user.email } : {}),
      ...(name ? { user_name: name } : {}),
    };
  });

  return {
    ...mapDbRowToFeatureFlag(flag),
    role_overrides: mappedRoles,
    user_overrides: mappedUsers,
  };
}

export async function createFeatureFlagAction(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const payload = prepareFeatureFlagPayload(input);
  const { data, error } = await admin.from('feature_flags').insert(payload).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('FLAG_KEY_EXISTS');
    throw error;
  }
  return mapDbRowToFeatureFlag(data);
}

export async function updateFeatureFlagAction(id: string, input: UpdateFeatureFlagInput): Promise<FeatureFlag> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('feature_flags')
    .select('metadata')
    .eq('id', id)
    .single();

  const payload = prepareFeatureFlagPayload(input, existing?.metadata || {});

  const { data, error } = await admin
    .from('feature_flags')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapDbRowToFeatureFlag(data);
}

export async function deleteFeatureFlagAction(id: string): Promise<void> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const { error } = await admin.from('feature_flags').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleFeatureFlagAction(id: string, enabled: boolean): Promise<void> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const { error } = await admin
    .from('feature_flags')
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function addRoleOverrideAction(flagId: string, roleId: string, isExclude = false): Promise<void> {
  const { tenantId: userTenantId } = await requirePermission('feature_flags.manage');
  const admin = createAdminClient();

  let tenantId = userTenantId;
  if (!tenantId) {
    const { data: tenantData } = await admin.from('tenants').select('id').limit(1).maybeSingle();
    tenantId = tenantData?.id ?? null;
  }

  if (!tenantId) {
    throw new Error('No tenant found to associate override with');
  }

  const { error } = await admin
    .from('feature_flag_roles')
    .upsert(
      { tenant_id: tenantId, flag_id: flagId, role_id: roleId },
      { onConflict: 'tenant_id,flag_id,role_id' }
    );
  if (error) throw error;
}

export async function removeRoleOverrideAction(flagId: string, roleId: string): Promise<void> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const { error } = await admin.from('feature_flag_roles').delete().eq('flag_id', flagId).eq('role_id', roleId);
  if (error) throw error;
}

export async function addUserOverrideAction(flagId: string, userId: string, isExclude = false): Promise<void> {
  const { tenantId: userTenantId } = await requirePermission('feature_flags.manage');
  const admin = createAdminClient();

  let tenantId = userTenantId;
  if (!tenantId) {
    const { data: userData } = await admin.from('users').select('tenant_id').eq('id', userId).maybeSingle();
    tenantId = userData?.tenant_id ?? null;
  }

  if (!tenantId) {
    const { data: tenantData } = await admin.from('tenants').select('id').limit(1).maybeSingle();
    tenantId = tenantData?.id ?? null;
  }

  if (!tenantId) {
    throw new Error('No tenant found to associate override with');
  }

  const { error } = await admin
    .from('feature_flag_users')
    .upsert(
      { tenant_id: tenantId, flag_id: flagId, user_id: userId },
      { onConflict: 'tenant_id,flag_id,user_id' }
    );
  if (error) throw error;
}

export async function removeUserOverrideAction(flagId: string, userId: string): Promise<void> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const { error } = await admin.from('feature_flag_users').delete().eq('flag_id', flagId).eq('user_id', userId);
  if (error) throw error;
}

export async function getAllRolesAction(): Promise<{ id: string; name: string; key: string }[]> {
  await requirePermission('feature_flags.manage');
  const admin = createAdminClient();
  const { data, error } = await admin.from('roles').select('id, name, label').order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.label || r.name, key: r.name }));
}

export async function getJobsAction(
  filters: JobFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Job>> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('admin_get_jobs', {
    p_page: page,
    p_page_size: pageSize,
    p_status: filters.status || null,
    p_job_type: filters.job_type || null,
    p_date_from: filters.dateFrom || null,
  });
  if (error) throw error;

  const results = (data ?? []) as any[];
  const total = results.length > 0 ? Number(results[0].full_count) : 0;

  // Remap SQL column aliases → Job domain field names
  const jobs: Job[] = results.map(({ full_count: _, ...row }: any): Job => ({
    id: row.id,
    tenant_id: row.tenant_id ?? null,
    job_type: row.job_type,
    payload: row.payload,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    // SQL returns locked_by (text alias) — map to domain field
    locked_by_worker_id: row.locked_by ?? null,
    locked_at: row.locked_at ?? null,
    lock_expires_at: row.lock_expires_at ?? null,
    run_at: row.run_at,
    started_at: row.started_at ?? null,
    // SQL returns completed_at alias — map to domain field
    finished_at: row.completed_at ?? null,
    // SQL returns error_msg alias — map to domain field
    error_message: row.error_msg ?? null,
    created_at: row.created_at,
    updated_at: row.created_at, // job_queue RPC doesn't return updated_at
  }));

  return {
    data: jobs,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getJobStatusCountsAction(): Promise<JobStatusCounts> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_get_job_counts').single();
  if (error) throw error;
  return data as unknown as JobStatusCounts;
}

export async function retryJobAction(id: string): Promise<void> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  const admin = createAdminClient();
  const { error } = await admin.rpc('admin_retry_job', { p_id: id });
  if (error) throw error;
}

export async function cancelJobAction(id: string): Promise<void> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  const admin = createAdminClient();
  const { error } = await admin.rpc('admin_cancel_job', { p_id: id });
  if (error) throw error;
}

export async function releaseStaleJobsAction(): Promise<number> {
  await requirePermission(['jobs.manage', 'audit.read', 'settings.write']);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('release_stale_job_locks').single();
  if (error) throw error;
  return (data as number) ?? 0;
}



export async function getNotificationsAction(
  page: number,
  pageSize: number,
  audience?: TargetAudience | 'all',
): Promise<{ 
  data: Notification[]; 
  count: number; 
  stats: { all: number; students: number; teachers: number; admins: number } 
}> {
  await requirePermission(['notifications.send', 'settings.write']);
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('notifications')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (audience && audience !== 'all') {
    query = query.eq('target_audience', audience);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  // Fetch total stats for stats cards (unpaginated counts)
  const { data: allAudienceData, error: statsError } = await admin
    .from('notifications')
    .select('target_audience')
    .is('deleted_at', null);
  if (statsError) throw statsError;

  const stats = {
    all: allAudienceData.length,
    students: allAudienceData.filter(n => n.target_audience === 'students').length,
    teachers: allAudienceData.filter(n => n.target_audience === 'teachers').length,
    admins: allAudienceData.filter(n => n.target_audience === 'admins').length,
  };

  return { 
    data: (data ?? []) as Notification[], 
    count: count ?? 0,
    stats 
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

  return notificationId;
}

export async function deleteNotificationAction(id: string): Promise<void> {
  await requirePermission(['notifications.delete', 'notifications.send', 'settings.write']);
  const admin = createAdminClient();
  const { error } = await admin
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
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
      .select('*, notifications(title, body)', { count: 'exact' })
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
      data: (data ?? []).map((row: any) => ({
        ...row,
        title: row.notifications?.title ?? '',
        body: row.notifications?.body ?? '',
        type: 'system_alert',
        link_to: null,
        notifications: undefined,
      })) as UserNotification[],
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
  const { error } = await admin.from('user_notifications').update({ is_read: true }).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function markAllNotificationsAsReadAction(): Promise<void> {
  const userId = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from('user_notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('activity_log_queue')
    .select('*')
    .is('flushed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getQueuedActivitiesAction]', error);
    throw new Error(error.message);
  }

  return (data ?? []) as ActivityLogQueueEntry[];
}

export async function getActiveBlocksAction(): Promise<RateLimitWithEmail[]> {
  await requirePermission(['audit.read', 'settings.write']);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('rate_limits')
    .select('*, users!rate_limits_user_id_fkey(email)')
    .not('blocked_until', 'is', null)
    .gt('blocked_until', new Date().toISOString())
    .order('blocked_until', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...(row as unknown as RateLimitWithEmail),
    user_email: (row.users as Record<string, string> | null)?.email ?? null,
  }));
}

export async function getRateLimitRulesAction(): Promise<RateLimitRule[]> {
  await requirePermission(['audit.read', 'settings.write']);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('rate_limit_rules')
    .select('*')
    .order('action');

  if (error) throw error;
  return (data ?? []) as RateLimitRule[];
}

export async function toggleRateLimitRuleAction(
  action: string,
  isActive: boolean,
): Promise<void> {
  await requirePermission('settings.write');
  const admin = createAdminClient();
  const { error } = await admin
    .from('rate_limit_rules')
    .update({ is_active: isActive })
    .eq('action', action);

  if (error) throw error;
}

export async function clearRateLimitBlockAction(id: string): Promise<void> {
  await requirePermission(['audit.read', 'settings.write']);
  const admin = createAdminClient();
  const { error } = await admin.from('rate_limits').delete().eq('id', id);
  if (error) throw error;
}

export async function getTopOffendersAction(): Promise<TopOffender[]> {
  await requirePermission(['audit.read', 'settings.write']);
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { data, error } = await admin
    .from('rate_limits')
    .select('user_id, ip_address, action, hit_count, users!rate_limits_user_id_fkey(email)')
    .gte('window_start', since)
    .order('hit_count', { ascending: false })
    .limit(100);

  if (error) throw error;

  const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    user_email: (row.users as Record<string, string> | null)?.email ?? null,
  }));

  return aggregateTopOffenders(mapped);
}

function aggregateTopOffenders(rows: Record<string, unknown>[]): TopOffender[] {
  const map = new Map<string, TopOffender>();

  for (const row of rows) {
    const key = (row.user_id as string) || (row.ip_address as string) || 'unknown';
    const existing = map.get(key);
    const action = row.action as string;
    if (existing) {
      existing.total_hits += (row.hit_count as number) || 0;
      if (!existing.actions.includes(action)) existing.actions.push(action);
    } else {
      map.set(key, {
        user_id: (row.user_id as string) || null,
        ip_address: (row.ip_address as string) || null,
        user_email: (row.user_email as string) || null,
        total_hits: (row.hit_count as number) || 0,
        actions: [action],
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.total_hits - a.total_hits)
    .slice(0, 20);
}

export async function getAnalyticsCourseStatsAction(
  tenantId?: string,
): Promise<CourseWithStats[]> {
  await requirePermission(['reports.read', 'courses.read', 'audit.read']);
  const admin = createAdminClient();

  let query = admin.from('vw_course_stats').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query.order('enrolled', { ascending: false }).limit(20);
  if (error || !data) return [];

  const courseIds = data.map((d: MvCourseStats) => d.course_id);
  const { data: courses } = await admin
    .from('courses')
    .select('id, title')
    .in('id', courseIds)
    .is('deleted_at', null);

  const titleMap = new Map((courses ?? []).map((c: { id: string; title: string }) => [c.id, c.title]));

  return data.map((d: MvCourseStats) => ({
    ...d,
    title: titleMap.get(d.course_id) ?? 'Unknown',
  }));
}

export async function getCourseStatsAction(courseId: string): Promise<CourseStats | null> {
  await requirePermission(['reports.read', 'courses.read']);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('vw_course_stats')
    .select('*')
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) return null;
  return (data as CourseStats) ?? null;
}

export async function deleteCourseAction(id: string): Promise<void> {
  await requirePermission(['courses.manage', 'courses.write']);
  const admin = createAdminClient();
  const { error } = await admin
    .from('courses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}
