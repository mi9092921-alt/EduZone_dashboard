import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createFeatureFlagAction,
  updateFeatureFlagAction,
  deleteFeatureFlagAction,
  toggleFeatureFlagAction,
  addRoleOverrideAction,
  removeRoleOverrideAction,
  addUserOverrideAction,
  removeUserOverrideAction,
  upsertTenantOverrideAction,
  deleteTenantOverrideAction,
} from '@/adapters/actions/admin.actions';
import { queryKeys } from '@/adapters/queries/keys';
import type {
  CreateFeatureFlagInput,
  FeatureFlag,
  UpdateFeatureFlagInput,
} from '@/domain/types/feature-flag.types';
import type { MaintenanceModeParams } from '@/domain/types/settings.types';
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
    mutationFn: (input: CreateFeatureFlagInput) => createFeatureFlagAction(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateFeatureFlagInput }) =>
      updateFeatureFlagAction(vars.id, vars.input),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: queryKeys.featureFlags.all });
      const previous = qc.getQueryData<FeatureFlag[]>(queryKeys.featureFlags.all);
      const patch = mapUpdateInputToFlagPatch(vars.input);
      qc.setQueryData<FeatureFlag[]>(queryKeys.featureFlags.all, (old) => {
        if (!old) return old;
        return old.map((flag) => (flag.id === vars.id ? { ...flag, ...patch } : flag));
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.featureFlags.all, context.previous);
      }
    },
    onSuccess: (updated) => {
      // Reconcile with authoritative server value instantly (no wait for refetch).
      if (updated && typeof updated === 'object' && 'id' in updated) {
        const serverFlag = updated as FeatureFlag;
        qc.setQueryData<FeatureFlag[]>(queryKeys.featureFlags.all, (old) => {
          if (!old) return old;
          return old.map((flag) => (flag.id === serverFlag.id ? { ...flag, ...serverFlag } : flag));
        });
      }
    },
    // No onSettled refetch: the mutation response is authoritative and merged
    // above, so the cache stays exact without a full-list refetch flashing the
    // "updating" indicator after every interaction.
  });
}

export function useDeleteFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFeatureFlagAction,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.featureFlags.all });
      const previous = qc.getQueryData<FeatureFlag[]>(queryKeys.featureFlags.all);
      qc.setQueryData<FeatureFlag[]>(queryKeys.featureFlags.all, (old) => {
        if (!old) return old;
        return old.filter((flag) => flag.id !== id);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.featureFlags.all, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });
}

export function useToggleFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      toggleFeatureFlagAction(vars.id, vars.enabled),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: queryKeys.featureFlags.all });
      const previous = qc.getQueryData<FeatureFlag[]>(queryKeys.featureFlags.all);
      qc.setQueryData<FeatureFlag[]>(queryKeys.featureFlags.all, (old) => {
        if (!old) return old;
        return old.map((flag) =>
          flag.id === vars.id ? { ...flag, is_enabled: vars.enabled } : flag,
        );
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.featureFlags.all, context.previous);
      }
    },
    onSuccess: (updated) => {
      // Reconcile with the authoritative server row (no background refetch —
      // a refetch per toggle made the table visibly churn after every click).
      if (updated && typeof updated === 'object' && 'id' in updated) {
        const serverFlag = updated as FeatureFlag;
        qc.setQueryData<FeatureFlag[]>(queryKeys.featureFlags.all, (old) => {
          if (!old) return old;
          return old.map((flag) => (flag.id === serverFlag.id ? { ...flag, ...serverFlag } : flag));
        });
      }
    },
  });
}

/**
 * Map UI update input to a partial FeatureFlag patch for optimistic cache updates.
 * Keeps schedule columns in sync (starts_at/ends_at + enabled_from/enabled_until).
 */
function mapUpdateInputToFlagPatch(input: UpdateFeatureFlagInput): Partial<FeatureFlag> {
  const patch: Partial<FeatureFlag> & Record<string, unknown> = {};
  if (input.is_enabled !== undefined) patch.is_enabled = input.is_enabled;
  if (input.rollout_pct !== undefined) patch.rollout_pct = input.rollout_pct;
  if (input.status !== undefined) patch.status = input.status;
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.starts_at !== undefined) {
    patch.starts_at = input.starts_at;
    patch.enabled_from = input.starts_at;
  }
  if (input.ends_at !== undefined) {
    patch.ends_at = input.ends_at;
    patch.enabled_until = input.ends_at;
  }
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  return patch;
}

export function useAddRoleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; roleId: string; isExclude?: boolean }) =>
      addRoleOverrideAction(vars.flagId, vars.roleId, vars.isExclude),
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
      removeRoleOverrideAction(vars.flagId, vars.roleId),
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
      addUserOverrideAction(vars.flagId, vars.userId, vars.isExclude),
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
      removeUserOverrideAction(vars.flagId, vars.userId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}

export function useUpsertTenantOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      flagId: string;
      tenantId: string;
      isEnabled: boolean | null;
      rolloutPct?: number | null;
    }) =>
      upsertTenantOverrideAction(vars.flagId, vars.tenantId, vars.isEnabled, vars.rolloutPct),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}

export function useDeleteTenantOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { flagId: string; tenantId: string }) =>
      deleteTenantOverrideAction(vars.flagId, vars.tenantId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
      qc.invalidateQueries({ queryKey: [...queryKeys.featureFlags.all, 'detail', vars.flagId] });
    },
  });
}

