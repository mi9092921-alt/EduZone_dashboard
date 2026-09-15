import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getAnalyticsCourseStatsAction } from '@/adapters/actions/admin.actions';
import {
  getUserStats,
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
    // Course stats must be read through the tenant-scoped server action:
    // the boundary checks reports.read/courses.read and scopes tenantId
    // (vw_course_stats itself is security_invoker + tenant-filtered).
    queryFn: () => getAnalyticsCourseStatsAction(tenantId),
    staleTime: 60_000,
  });
}

export function useDailyActivity(tenantId?: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.dailyActivity(tenantId, days),
    queryFn: () => getDailyActivity(tenantId, days),
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
