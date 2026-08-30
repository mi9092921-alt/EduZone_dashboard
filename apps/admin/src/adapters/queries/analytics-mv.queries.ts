import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import {
  getUserStats,
  getCourseStats,
  getDailyActivity,
  getUserRegistrationTrend,
  getGeographicDistribution,
} from '@/infrastructure/repos/analytics.service';
import { getGlobalCoordinatePoints } from '@/infrastructure/repos/user_location_logs.service';

/**
 * Analytics-specific query hooks (MV-backed with fallback).
 * All use staleTime: 60_000 (1 minute) since MV data doesn't change frequently.
 */

export function useUserStats(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.userStats(tenantId),
    queryFn: () => getUserStats(tenantId),
    staleTime: 60_000,
  });
}

export function useCourseStats(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.courseStats(tenantId),
    queryFn: () => getCourseStats(tenantId),
    staleTime: 60_000,
  });
}

export function useDailyActivity(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.dailyActivity(tenantId),
    queryFn: () => getDailyActivity(tenantId),
    staleTime: 60_000,
  });
}

export function useRegistrationTrend(days = 90) {
  return useQuery({
    queryKey: queryKeys.analytics.registrationTrend(days),
    queryFn: () => getUserRegistrationTrend(days),
    staleTime: 60_000,
  });
}

export function useGeographicDistribution(tenantId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.geographic(tenantId),
    queryFn: () => getGeographicDistribution(tenantId),
    staleTime: 60_000,
  });
}

export function useGlobalCoordinates(limit = 1000) {
  return useQuery({
    queryKey: queryKeys.analytics.globalCoordinates,
    queryFn: () => getGlobalCoordinatePoints(limit),
    staleTime: 300_000, // 5 minutes (geo data doesn't change fast)
  });
}
