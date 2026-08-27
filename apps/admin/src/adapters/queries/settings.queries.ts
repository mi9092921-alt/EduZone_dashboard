import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './keys';
import {
  getAllSettings,
  getSettingsByCategory,
  getSetting,
} from '@/infrastructure/repos/settings.service';
import {
  getAllFeatureFlags,
  getFeatureFlagById,
  getAllRoles,
} from '@/infrastructure/repos/feature-flags.service';

/**
 * React Query hooks for settings and feature flags.
 */

// ── Settings ──────────────────────────────────────────────────

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: getAllSettings,
    staleTime: 60_000,
  });
}

export function useSettingsByCategory() {
  return useQuery({
    queryKey: [...queryKeys.settings.all, 'grouped'],
    queryFn: getSettingsByCategory,
    staleTime: 60_000,
  });
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.settings.detail(key),
    queryFn: () => getSetting(key),
    enabled: !!key,
  });
}

// ── Feature Flags ────────────────────────────────────────────

export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.featureFlags.all,
    queryFn: getAllFeatureFlags,
    staleTime: 30_000,
  });
}

export function useFeatureFlagDetail(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.featureFlags.all, 'detail', id],
    queryFn: () => getFeatureFlagById(id!),
    enabled: !!id,
  });
}

// ── Roles (for override selectors) ───────────────────────────

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: getAllRoles,
    staleTime: 5 * 60_000,
  });
}
