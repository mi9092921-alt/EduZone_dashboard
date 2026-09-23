'use server';

import type { PermissionName } from '@eduzone/types';

import { requirePermission } from '@/adapters/actions/boundary';
import type { TeacherEngagementStats } from '@/infrastructure/stats-service';
import { getTeacherEngagementStatsAdmin } from '@/infrastructure/stats.admin';

/**
 * Thin Server-Action boundary for the Teacher Dashboard engagement metrics
 * (Total Views + Sessions Today).
 *
 * Why service-role: video_views / sessions are partitioned tables whose
 * child partitions deny authenticated reads (partition_deny_direct in
 * 09_rls.sql) — the actual Admin (service-role) read lives in
 * infrastructure/stats-service.ts (getTeacherEngagementStatsAdmin).
 * Scoping is enforced here: the teacher id comes from the trusted session
 * (ctx.userId), never from client-supplied arguments, so a caller can only
 * ever count engagement for their own courses.
 */

const TEACHER_DASHBOARD_READ_PERMISSIONS: PermissionName[] = ['courses.read', 'reports.read'];

export async function getTeacherEngagementStatsAction(): Promise<TeacherEngagementStats> {
  const ctx = await requirePermission(TEACHER_DASHBOARD_READ_PERMISSIONS);
  return getTeacherEngagementStatsAdmin(ctx.userId);
}
