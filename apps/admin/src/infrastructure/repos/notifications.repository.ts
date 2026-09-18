import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  INotificationAdminRepository,
  ResolveNotificationTargetsInput,
} from '@/application/ports/INotificationAdminRepository';
import { mapDbError } from '@/domain/errors';
import type {
  NotificationListResult,
  SendNotificationInput,
  TargetAudience,
  UserNotification,
} from '@/domain/types/notification.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Supabase implementation of INotificationAdminRepository.
 *
 * Owns the service-role (admin) client — the ONLY layer allowed to touch
 * `createAdminClient` for the notifications domain. Every query here was
 * moved verbatim from the former fat server actions; behavior is unchanged.
 *
 * Tenant scoping: broadcast queries are scoped to the caller's tenant when
 * known (null tenantId = caller without tenant context, legacy behavior
 * preserved for super_admin edge cases).
 */
export function makeNotificationAdminRepository(
  admin: SupabaseClient = createAdminClient(),
): INotificationAdminRepository {
  return {
    async resolveTargetUserIds(
      input: ResolveNotificationTargetsInput,
      tenantId: string,
      allowedRecipientRoles: readonly string[] = [],
    ): Promise<string[]> {
      if (input.target_user_ids?.length) {
        // Explicit ids are still resolved through the tenant boundary. Never
        // let service-role writes trust caller-provided ids across tenants.
        const { data, error } = await admin
          .from('users')
          .select('id, primary_role')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .in('id', input.target_user_ids);
        if (error) throw mapDbError(error, 'notifications.repository.ts');
        return Array.from(
          new Set(
            (data ?? [])
              .filter(
                (row) =>
                  allowedRecipientRoles.length === 0 ||
                  allowedRecipientRoles.includes(row.primary_role as string),
              )
              .map((row) => row.id as string),
          ),
        );
      }

      if (input.target_permission) {
        // Get role IDs that possess this permission
        const { data: rolePerms, error: rpError } = await admin
          .from('role_permissions')
          .select('role_id, permissions!inner(name)')
          .eq('permissions.name', input.target_permission);
        if (rpError) throw rpError;

        const roleIdsWithPermission = new Set((rolePerms ?? []).map((rp) => rp.role_id));
        if (roleIdsWithPermission.size === 0) return [];

        // Find all active users assigned to any of these roles.
        const { data: activeUsersWithRole, error: activeError } = await admin
          .from('user_roles')
          .select('user_id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .in('role_id', Array.from(roleIdsWithPermission));
        if (activeError) throw activeError;

        const candidateUserIds = Array.from(
          new Set((activeUsersWithRole ?? []).map((ur) => ur.user_id as string)),
        );
        if (candidateUserIds.length === 0) return [];

        let usersQuery = admin
          .from('users')
          .select('id, primary_role')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .in('id', candidateUserIds);

        const roleFilter = getRecipientRoleFilter(input.target_audience, allowedRecipientRoles);
        if (allowedRecipientRoles.length > 0 || input.target_audience !== undefined) {
          if (roleFilter.length === 0) return [];
          usersQuery = usersQuery.in('primary_role', roleFilter);
        }

        const { data: users, error: usersError } = await usersQuery;
        if (usersError) throw mapDbError(usersError, 'notifications.repository.ts');
        return Array.from(new Set((users ?? []).map((user) => user.id as string)));
      }

      let query = admin
        .from('users')
        .select('id, primary_role')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      const roleFilter = getRecipientRoleFilter(input.target_audience, allowedRecipientRoles);
      if (allowedRecipientRoles.length > 0 || input.target_audience !== undefined) {
        if (roleFilter.length === 0) return [];
        query = query.in('primary_role', roleFilter);
      }

      const { data, error } = await query;
      if (error) throw mapDbError(error, 'notifications.repository.ts');
      return (data ?? []).map((row) => row.id as string);
    },

    async insertNotification(
      input: SendNotificationInput,
      tenantId: string,
      createdBy: string,
    ): Promise<string> {
      const { data: notification, error: notificationError } = await admin
        .from('notifications')
        .insert({
          tenant_id: tenantId,
          title: input.title.trim(),
          body: input.body.trim(),
          target_audience: input.target_audience ?? 'all',
          targeting_mode: input.target_user_ids?.length ? 'users' : 'audience',
          target_permission: input.target_permission || null,
          created_by: createdBy,
        })
        .select('id')
        .single();
      if (notificationError) throw notificationError;

      return notification.id as string;
    },

    async attachNotificationTargets(notificationId: string, userIds: string[]): Promise<void> {
      const targetRows = userIds.map((targetUserId) => ({
        notification_id: notificationId,
        user_id: targetUserId,
      }));
      const { error: targetError } = await admin.from('notification_targets').upsert(targetRows, {
        onConflict: 'notification_id,user_id',
        ignoreDuplicates: true,
      });
      if (targetError) throw targetError;
    },

    async fanoutToUsers(
      notificationId: string,
      tenantId: string,
      userIds: string[],
    ): Promise<void> {
      const rows = userIds.map((targetUserId) => ({
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
    },

    async triggerInstantPush(): Promise<void> {
      // BUG-PUSH-INSTANT: Immediately process notification fanout and trigger
      // FCM push worker so student devices receive notifications in real-time
      // without waiting for periodic cron.
      const workerId = randomUUID();
      const { error } = await admin.rpc('process_notification_fanout_jobs', {
        p_limit: 500,
        p_worker_id: workerId,
      });
      if (error)
        throw mapDbError(error, 'notifications.repository.ts:process_notification_fanout_jobs');
    },

    async listForAdmin(
      tenantId: string | null,
      audience: TargetAudience | 'all' | undefined,
      page: number,
      pageSize: number,
    ): Promise<NotificationListResult> {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from('notifications')
        .select('*', { count: 'exact' })
        .is('deleted_at', null);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      if (audience && audience !== 'all') {
        query = query.eq('target_audience', audience);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw mapDbError(error, 'notifications.repository.ts');

      // Count on the database instead of loading the entire notification
      // history into Node. This remains O(1) in memory as the tenant grows.
      const countAudience = async (targetAudience?: TargetAudience) => {
        let statsQuery = admin
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null);
        if (tenantId) statsQuery = statsQuery.eq('tenant_id', tenantId);
        if (targetAudience) statsQuery = statsQuery.eq('target_audience', targetAudience);
        const { count: audienceCount, error: statsError } = await statsQuery;
        if (statsError) throw mapDbError(statsError, 'notifications.repository.ts:stats');
        return audienceCount ?? 0;
      };

      const [all, students, teachers, admins] = await Promise.all([
        countAudience(),
        countAudience('students'),
        countAudience('teachers'),
        countAudience('admins'),
      ]);

      const targetUserIdsByNotification = new Map<string, string[]>();
      const notificationIds = (data ?? []).map((row) => row.id as string);
      if (notificationIds.length > 0) {
        const { data: targets, error: targetsError } = await admin
          .from('notification_targets')
          .select('notification_id, user_id')
          .in('notification_id', notificationIds);
        if (targetsError) throw mapDbError(targetsError, 'notifications.repository.ts:targets');

        for (const target of targets ?? []) {
          const notificationId = target.notification_id as string;
          const current = targetUserIdsByNotification.get(notificationId) ?? [];
          current.push(target.user_id as string);
          targetUserIdsByNotification.set(notificationId, current);
        }
      }

      const stats = {
        all,
        students,
        teachers,
        admins,
      };

      return {
        data: (data ?? []).map((row) => ({
          ...(row as NotificationListResult['data'][number]),
          // `notification_targets` is the source of truth for explicit
          // recipients; expose only the ids needed by the admin UI.
          target_user_ids:
            row.targeting_mode === 'users'
              ? (targetUserIdsByNotification.get(row.id as string) ?? [])
              : null,
        })),
        count: count ?? 0,
        stats,
      };
    },

    async softDelete(id: string, tenantId: string | null): Promise<void> {
      let query = admin
        .from('notifications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { error } = await query;
      if (error) throw mapDbError(error, 'notifications.repository.ts');
    },

    async listMine(
      userId: string,
      limit: number,
      unreadOnly: boolean,
    ): Promise<UserNotification[]> {
      let query = admin
        .from('user_notifications')
        .select('*, notifications!user_notifications_notification_id_fkey(title, body)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (unreadOnly) query = query.eq('is_read', false);

      const { data, error } = await query;
      if (error) throw mapDbError(error, 'notifications.repository.ts');

      return (data ?? []).map(
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
      ) as UserNotification[];
    },

    async countMine(userId: string, unreadOnly: boolean): Promise<number> {
      let query = admin
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (unreadOnly) query = query.eq('is_read', false);

      const { count, error } = await query;
      if (error) throw mapDbError(error, 'notifications.repository.ts');
      return count ?? 0;
    },

    async markRead(userId: string, id: string): Promise<void> {
      const { error } = await admin
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw mapDbError(error, 'notifications.repository.ts');
    },

    async markAllRead(userId: string): Promise<void> {
      const { error } = await admin
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (error) throw mapDbError(error, 'notifications.repository.ts');
    },
  };
}

const AUDIENCE_ROLES: Record<TargetAudience, readonly string[]> = {
  all: ['student', 'teacher', 'admin', 'super_admin'],
  students: ['student'],
  teachers: ['teacher'],
  admins: ['admin', 'super_admin'],
};

function getRecipientRoleFilter(
  audience: TargetAudience | undefined,
  allowedRecipientRoles: readonly string[],
): string[] {
  const requestedRoles = audience ? AUDIENCE_ROLES[audience] : AUDIENCE_ROLES.all;
  if (allowedRecipientRoles.length === 0) return [...requestedRoles];
  return requestedRoles.filter((role) => allowedRecipientRoles.includes(role));
}
