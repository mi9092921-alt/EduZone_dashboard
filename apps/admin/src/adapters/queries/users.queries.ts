import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { queryKeys } from './keys';

import type { UserFilters } from '@/domain/types/user.types';
import {
  getUsers,
  getUserById,
  getDevices,
  getSessions,
  getWarnings,
  getEffectivePermissions,
  getUserRoles,
  getUserStats,
  searchStudentsForEnrollment,
} from '@/infrastructure/repos/users.service';

/**
 * React Query hooks for all user data.
 * Queries use stale-while-revalidate with keepPreviousData for pagination.
 */

export function useUsers(filters: UserFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: queryKeys.users.list({ ...filters, page, pageSize }),
    queryFn: () => getUsers(filters, page, pageSize),
    placeholderData: keepPreviousData, // proper v5 keepPreviousData
  });
}

export function useUserById(id: string | null) {
  return useQuery({
    queryKey: queryKeys.users.detail(id!),
    queryFn: () => getUserById(id!),
    enabled: !!id,
  });
}

export function useUserDevices(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.users.devices(userId!),
    queryFn: () => getDevices(userId!),
    enabled: !!userId,
  });
}

export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.users.sessions(userId!),
    queryFn: () => getSessions(userId!),
    enabled: !!userId,
  });
}

export function useUserWarnings(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.users.warnings(userId!),
    queryFn: () => getWarnings(userId!),
    enabled: !!userId,
  });
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.users.permissions(userId!),
    queryFn: () => getEffectivePermissions(userId!),
    enabled: !!userId,
  });
}

export function useUserRoles(userId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.users.detail(userId!), 'roles'],
    queryFn: () => getUserRoles(userId!),
    enabled: !!userId,
  });
}

export function useUserStats(tenantId?: string) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'stats', tenantId],
    queryFn: () => getUserStats(tenantId),
    staleTime: 60_000, // 1 minute — stats don't need rapid refresh
  });
}

/**
 * TEACHER-STUDENT-DIRECTORY (2026-09-25): enrollment search for the
 * EnrollStudentDialog. Backed by the body-guarded search_tenant_students
 * RPC so teachers can find not-yet-enrolled students (the direct
 * users-table search is invisible to teachers under users_select_merged
 * RLS until a student is already enrolled in one of their courses).
 * An empty query lists the first students of the acting tenant, bounded
 * server-side to 50 rows.
 */
export function useStudentSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'enrollment-search', query],
    queryFn: () => searchStudentsForEnrollment(query, 50),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
