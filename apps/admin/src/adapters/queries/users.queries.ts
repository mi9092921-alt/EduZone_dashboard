import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from './keys';
import {
  getUsers,
  getUserById,
  getDevices,
  getSessions,
  getWarnings,
  getEffectivePermissions,
  getUserRoles,
  getUserStats,
} from '@/infrastructure/repos/users.service';
import type { UserFilters } from '@/domain/types/user.types';

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
