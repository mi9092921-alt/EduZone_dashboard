import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import {
  createUserAction,
  deleteUserAction,
  controlUserAccountAction,
  terminateUserSessionsAction,
  issueWarningAction,
} from '@/application/actions/user.actions';
import type { CreateUserInput } from '@/domain/schemas/user.schema';
import type { AccountAction } from '@/domain/types/user.types';
import { resetUserDevices } from '@/infrastructure/repos/users.service';

/**
 * Mutation hooks for user management actions.
 * Each mutation invalidates the relevant queries after success.
 */

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const result = await deleteUserAction(userId);
      if (!result.success) throw new Error(result.error);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      qc.invalidateQueries({ queryKey: queryKeys.analytics.dashboard });
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateUserInput) => {
      const result = await createUserAction(data);
      return result;
    },
    onSuccess: (result) => {
      if (result.success) {
        qc.invalidateQueries({ queryKey: queryKeys.users.all });
      }
    },
  });
}

export function useMutateUserAccount() {
  const qc = useQueryClient();

  return useMutation({
    // v13: controlUserAccount RPC has PUBLIC EXECUTE revoked.
    // Route through the Server Action which uses service_role.
    mutationFn: async (vars: {
      userId: string;
      action: AccountAction;
      reason?: string;
      suspendHours?: number;
    }) => {
      const result = await controlUserAccountAction(
        vars.userId,
        vars.action,
        vars.reason,
        vars.suspendHours,
      );
      if (!result.success) throw new Error(result.error);
      return result;
    },

    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(vars.userId) });
    },
  });
}

export function useTerminateSessions() {
  const qc = useQueryClient();

  return useMutation({
    // v13: terminate_user_sessions RPC has PUBLIC EXECUTE revoked.
    // Route through the Server Action which uses service_role.
    mutationFn: async (vars: { userId: string; reason?: string }) => {
      const result = await terminateUserSessionsAction(vars.userId, vars.reason);
      if (!result.success) throw new Error(result.error);
      return result;
    },

    onSuccess: (_count, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.sessions(vars.userId) });
    },
  });
}

export function useResetDevices() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: { userId: string }) => resetUserDevices(vars.userId),

    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.devices(vars.userId) });
    },
  });
}

export function useMutateWarning() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      userId: string;
      reason: string;
      severity: 1 | 2 | 3;
      action?: string | undefined;
    }) => {
      const result = await issueWarningAction(vars.userId, vars.reason, vars.severity, vars.action);
      if (!result.success) throw new Error(result.error);
      return result.warningId;
    },

    onSuccess: (_warningId, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.warnings(vars.userId) });
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(vars.userId) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      qc.invalidateQueries({ queryKey: queryKeys.warnings.all });
    },
  });
}
