import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/adapters/queries/keys';
import {
  createTenant,
  updateTenant,
  suspendTenant,
  deleteTenant,
} from '@/infrastructure/repos/tenants.service';
import type { CreateTenantInput, UpdateTenantInput } from '@/domain/types/tenant.types';

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateTenantInput }) =>
      updateTenant(vars.id, vars.input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all });
      qc.invalidateQueries({ queryKey: queryKeys.tenants.detail(vars.id) });
    },
  });
}

export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      suspendTenant(vars.id, vars.reason),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all });
      qc.invalidateQueries({ queryKey: queryKeys.tenants.detail(vars.id) });
    },
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTenant(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}
