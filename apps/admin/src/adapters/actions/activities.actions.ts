'use server';

import type { PermissionName } from '@eduzone/types';

import { assertSameTenant, requirePermission } from '@/adapters/actions/boundary';
import type { UserLocationLog } from '@/domain/types/analytics.types';
import type { ActivityLog, AuditFilters } from '@/domain/types/audit.types';
import type { VideoView } from '@/domain/types/course.types';
import type { PaginatedResult, Session } from '@/domain/types/user.types';
import { getActivityLogsAdmin } from '@/infrastructure/repos/audit.admin';
import { getVideoViewsByUserAdmin } from '@/infrastructure/repos/courses.admin';
import { getUserLocationLogsAdmin } from '@/infrastructure/repos/user-location-logs.admin';
import { getUserSessionsAdmin } from '@/infrastructure/repos/user_sessions.service';
import { getUserTenantId } from '@/infrastructure/repos/users.admin';

/**
 * Thin Server-Action boundary for the Activities page (Views + Locations).
 *
 * Every action follows: validate → authenticate/authorize (boundary gate) →
 * assert same-tenant (IDOR guard) → execute Admin (service-role) read.
 *
 * Why service-role: video_views / sessions / user_location_logs /
 * activity_logs are partitioned tables whose child partitions deny
 * authenticated reads (partition_deny_direct in 09_rls.sql). Browser-client
 * queries therefore return zero/incomplete rows. The Admin client bypasses
 * that gate, so tenant isolation MUST be enforced here — never trust a
 * client-supplied tenant id.
 */

const ACTIVITIES_READ_PERMISSIONS: PermissionName[] = ['users.read', 'audit.read', 'reports.read', 'courses.read'];

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export async function getVideoViewsByUserAction(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<VideoView>> {
  if (!userId || typeof userId !== 'string') throw new Error('userId is required');
  const safePage = clampInt(page, 1, 1, 10000);
  const safePageSize = clampInt(pageSize, 20, 1, 100);

  const ctx = await requirePermission(ACTIVITIES_READ_PERMISSIONS);
  const targetTenantId = await getUserTenantId(userId);
  assertSameTenant(ctx, targetTenantId);

  return getVideoViewsByUserAdmin(userId, safePage, safePageSize, targetTenantId ?? undefined);
}

export async function getUserSessionsForActivityAction(
  userId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<Session[]> {
  if (!userId || typeof userId !== 'string') throw new Error('userId is required');
  const safeLimit = clampInt(limit, 20, 1, 100);
  const safeOffset = clampInt(offset, 0, 0, 100000);

  const ctx = await requirePermission(ACTIVITIES_READ_PERMISSIONS);
  const targetTenantId = await getUserTenantId(userId);
  assertSameTenant(ctx, targetTenantId);

  return getUserSessionsAdmin(userId, safeLimit, safeOffset, targetTenantId ?? undefined);
}

export async function getUserLocationLogsForActivityAction(
  userId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<UserLocationLog[]> {
  if (!userId || typeof userId !== 'string') throw new Error('userId is required');
  const safeLimit = clampInt(limit, 20, 1, 100);
  const safeOffset = clampInt(offset, 0, 0, 100000);

  const ctx = await requirePermission(ACTIVITIES_READ_PERMISSIONS);
  const targetTenantId = await getUserTenantId(userId);
  assertSameTenant(ctx, targetTenantId);

  return getUserLocationLogsAdmin(userId, safeLimit, safeOffset, targetTenantId ?? undefined);
}

export async function getActivityLogsForUserAction(
  userId: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<PaginatedResult<ActivityLog>> {
  if (!userId || typeof userId !== 'string') throw new Error('userId is required');
  const safePage = clampInt(page, 1, 1, 10000);
  const safePageSize = clampInt(pageSize, 50, 1, 100);

  const ctx = await requirePermission(ACTIVITIES_READ_PERMISSIONS);
  const targetTenantId = await getUserTenantId(userId);
  assertSameTenant(ctx, targetTenantId);

  const filters: AuditFilters = { user_id: userId };
  return getActivityLogsAdmin(filters, safePage, safePageSize, targetTenantId ?? undefined);
}

export async function getActivityLogsAction(
  filters: AuditFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<ActivityLog>> {
  const safePage = clampInt(page, 1, 1, 10000);
  const safePageSize = clampInt(pageSize, 20, 1, 100);

  const ctx = await requirePermission('audit.read');
  const isSuperAdmin = ctx.permissions.includes('*');

  // Non-super_admin callers are pinned to their own tenant; a client-supplied
  // tenant_id for another tenant must never widen the read (IDOR guard).
  if (!isSuperAdmin) {
    if (filters.tenant_id && filters.tenant_id !== ctx.tenantId) {
      throw new Error('Cross-tenant access forbidden');
    }
    // If the caller filters by a specific user, verify that user belongs to
    // the caller's tenant as well (user_id alone is not a tenant boundary).
    if (filters.user_id) {
      assertSameTenant(ctx, await getUserTenantId(filters.user_id));
    }
    return getActivityLogsAdmin(filters, safePage, safePageSize, ctx.tenantId);
  }

  // Super_admin may scope explicitly or read across tenants. When a user_id
  // filter is present, still pin to that user's tenant so the result is
  // complete for that user without leaking unrelated tenants' rows.
  if (filters.user_id) {
    const targetTenantId = await getUserTenantId(filters.user_id);
    return getActivityLogsAdmin(
      filters,
      safePage,
      safePageSize,
      targetTenantId ?? filters.tenant_id,
    );
  }
  return getActivityLogsAdmin(filters, safePage, safePageSize, filters.tenant_id);
}
