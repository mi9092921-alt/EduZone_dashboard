import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import type {
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
} from '@/domain/types/feature-flag.types';
import type { MaintenanceModeParams } from '@/domain/types/settings.types';
import {
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  toggleFeatureFlag,
  addRoleOverride,
  removeRoleOverride,
  addUserOverride,
  removeUserOverride,
} from '@/infrastructure/repos/feature-flags.service';
import {
  setSetting,
  createSetting,
  deleteSetting,
  enableMaintenanceMode,
  disableMaintenanceMode,
  lockApp,
  unlockApp,
} from '@/infrastructure/repos/settings.service';

/**
 * Mutation hooks for settings and feature flags.
 */

// ══════════════════════════════════════════════════
// SETTINGS MUTATIONS
// ══════════════════════════════════════════════════

export function useSetSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { key: string; value: string; valueType?: string }) =>
      setSetting(vars.key, vars.value, vars.valueType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useCreateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSetting,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useDeleteSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSetting,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useEnableMaintenanceMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: MaintenanceModeParams) => enableMaintenanceMode(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useDisableMaintenanceMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disableMaintenanceMode,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useLockApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => lockApp(message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useUnlockApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unlockApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

// ══════════════════════════════════════════════════
// FEATURE FLAG MUTATIONS
// ══════════════════════════════════════════════════

export function useCreateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeatureFlagInput) => createFeatureFlag(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateFeatureFlagInput }) =>
      updateFeatureFlag(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });
}

export function useDeleteFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFeatureFlag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });
}

export function useToggleFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      toggleFeatureFlag(vars.id, vars.enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });
}

export function useAddRoleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; roleId: string; isExclude?: boolean }) =>
      addRoleOverride(vars.flagId, vars.roleId, vars.isExclude),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}

export function useRemoveRoleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; roleId: string }) =>
      removeRoleOverride(vars.flagId, vars.roleId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}

export function useAddUserOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; userId: string; isExclude?: boolean }) =>
      addUserOverride(vars.flagId, vars.userId, vars.isExclude),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}

export function useRemoveUserOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; userId: string }) =>
      removeUserOverride(vars.flagId, vars.userId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}
