'use server';

import { requireSuperAdmin } from '@/application/actions/boundary';
import {
  CreateTenantUseCase,
  DeleteTenantUseCase,
  SuspendTenantUseCase,
  UpdateTenantUseCase,
} from '@/application/use-cases/tenants/manage-tenants.use-case';
import type { Tenant, CreateTenantInput, UpdateTenantInput } from '@/domain/types/tenant.types';
import { makeTenantAdminRepository } from '@/infrastructure/repos/tenant-admin.repository';

/**
 * Thin Server-Action boundary for tenant management (super-admin only).
 *
 * Contract: authenticate/authorize (super-admin gate) → execute use case.
 * Business rules (slug uniqueness + platform defaults, suspension audit,
 * soft delete) live in the use cases; the service-role tenant access is
 * encapsulated in infrastructure/repos/tenant-admin.repository.ts.
 */

// ── Create tenant (admin client bypasses RLS) ───────────────────
export async function createTenantAction(input: CreateTenantInput): Promise<Tenant> {
  await requireSuperAdmin();
  return new CreateTenantUseCase(makeTenantAdminRepository()).execute(input);
}

// ── Update tenant (admin client bypasses RLS) ───────────────────
export async function updateTenantAction(id: string, input: UpdateTenantInput): Promise<Tenant> {
  await requireSuperAdmin();
  return new UpdateTenantUseCase(makeTenantAdminRepository()).execute(id, input);
}

// ── Suspend tenant (admin client bypasses RLS) ──────────────────
export async function suspendTenantAction(id: string, reason: string): Promise<void> {
  const ctx = await requireSuperAdmin();
  return new SuspendTenantUseCase(makeTenantAdminRepository()).execute(ctx, id, reason);
}

// ── Soft delete tenant (admin client bypasses RLS) ──────────────
export async function deleteTenantAction(id: string): Promise<void> {
  await requireSuperAdmin();
  return new DeleteTenantUseCase(makeTenantAdminRepository()).execute(id);
}
