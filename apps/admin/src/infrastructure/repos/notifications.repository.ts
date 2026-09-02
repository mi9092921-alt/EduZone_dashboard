import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  INotificationAdminRepository,
  ResolveNotificationTargetsInput,
} from '@/application/ports/INotificationAdminRepository';
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
      const { error: targetError } = await admin
        .from('notification_targets')
        .upsert(targetRows, {
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
      const workerId = crypto.randomUUID();
      await admin.rpc('process_notification_fanout_jobs', {
        p_limit: 500,
        p_worker_id: workerId,
      });
      await admin.rpc('invoke_notification_push_worker');
    },

    async listForAdmin(
      tenantId: string | null,
      audience: TargetAudience | 'all' | undefined,
      page: number,
      pageSize: number,
    ): Promise<NotificationListResult> {
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
        data: (data ?? []) as NotificationListResult['data'],
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
      if (error) throw error;
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
      if (error) throw error;

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
      if (error) throw error;
      return count ?? 0;
    },

    async markRead(userId: string, id: string): Promise<void> {
      const { error } = await admin
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    },

    async markAllRead(userId: string): Promise<void> {
      const { error } = await admin
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (error) throw error;
    },
  };
}
