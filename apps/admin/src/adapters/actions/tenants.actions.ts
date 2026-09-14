'use server';

import { requireSuperAdmin } from '@/adapters/actions/boundary';
import {
  CreateTenantUseCase,
  DeleteTenantUseCase,
  SuspendTenantUseCase,
  UpdateTenantUseCase,
} from '@/application/use-cases/tenants/manage-tenants.use-case';
import { SwitchTenantContextUseCase } from '@/application/use-cases/tenants/switch-tenant-context.use-case';
import type { Tenant, CreateTenantInput, UpdateTenantInput } from '@/domain/types/tenant.types';
import { makeAuditLogger } from '@/infrastructure/observability/audit-logger.service';
import { makeTenantAdminRepository } from '@/infrastructure/repos/tenant-admin.repository';
import { makeTenantContextRepository } from '@/infrastructure/repos/tenant-context.repository';

/**
 * Thin Server-Action boundary for tenant management (super-admin only).
 *
 * Contract: authenticate/authorize (super-admin gate) → execute use case.
 * Business rules (slug uniqueness + platform defaults, suspension audit,
 * soft delete) live in the use cases; the service-role tenant access is
 * encapsulated in infrastructure/repos/tenant-admin.repository.ts.
 * M13: the use cases emit their own audit events via the injected
 * IAuditLogger (no direct activity_logs writes at this boundary).
 */

// ── Create tenant (admin client bypasses RLS) ───────────────────
export async function createTenantAction(input: CreateTenantInput): Promise<Tenant> {
  const ctx = await requireSuperAdmin();
  return new CreateTenantUseCase(makeTenantAdminRepository(), makeAuditLogger()).execute(ctx, input);
}

// ── Update tenant (admin client bypasses RLS) ───────────────────
export async function updateTenantAction(id: string, input: UpdateTenantInput): Promise<Tenant> {
  const ctx = await requireSuperAdmin();
  return new UpdateTenantUseCase(makeTenantAdminRepository(), makeAuditLogger()).execute(
    ctx,
    id,
    input,
  );
}

// ── Suspend tenant (admin client bypasses RLS) ──────────────────
export async function suspendTenantAction(id: string, reason: string): Promise<void> {
  const ctx = await requireSuperAdmin();
  return new SuspendTenantUseCase(makeTenantAdminRepository(), makeAuditLogger()).execute(
    ctx,
    id,
    reason,
  );
}

// ── Soft delete tenant (admin client bypasses RLS) ──────────────
export async function deleteTenantAction(id: string): Promise<void> {
  const ctx = await requireSuperAdmin();
  return new DeleteTenantUseCase(makeTenantAdminRepository(), makeAuditLogger()).execute(ctx, id);
}

// ── Tenant Switcher: switch (or, with null, exit) acting tenant context ──
// Session-bound client (not the admin client above) -- see
// tenant-context.repository.ts for why. requireSuperAdmin() here is the
// Next.js-side authorization layer; switch_tenant_context itself
// independently re-validates super_admin server-side too (defense in
// depth, 07_functions.sql).
export async function switchTenantAction(tenantId: string | null): Promise<{
  tenantId: string;
  tenantName: string;
}> {
  const ctx = await requireSuperAdmin();
  return new SwitchTenantContextUseCase(makeTenantContextRepository()).execute(ctx, tenantId);
}

