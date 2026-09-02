import type { ITenantAdminRepository } from '@/application/ports/ITenantAdminRepository';
import { ConflictError } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';
import type { CreateTenantInput, Tenant, UpdateTenantInput } from '@/domain/types/tenant.types';

/**
 * Tenant management use cases (super-admin only, gated at the boundary).
 *
 * Business rules (moved verbatim from the former fat server actions):
 *  - Create: slug uniqueness is enforced BEFORE insert with a stable,
 *    user-facing 'SLUG_TAKEN' error code; platform defaults are applied
 *    server-side (plan, region, quotas, metadata).
 *  - Suspend: suspension reason + timestamp are recorded in tenant
 *    metadata, and an audit entry is written best-effort (a failed audit
 *    write never fails the suspension).
 *  - Delete: soft delete (status = deleted + deleted_at), never a hard
 *    delete — the shared DB contract with EduZone_App is preserved.
 */

/** Platform defaults applied on tenant creation (server-side authority) */
const CREATE_TENANT_DEFAULTS = {
  plan: 'free',
  region_id: 'me-south-1',
  max_users: 1000,
  max_courses: 50,
  max_storage_bytes: 10_737_418_240, // 10 GiB
} as const;

export class CreateTenantUseCase {
  constructor(private readonly tenants: ITenantAdminRepository) {}

  async execute(input: CreateTenantInput): Promise<Tenant> {
    // Pre-check slug uniqueness
    if (await this.tenants.slugExists(input.slug)) {
      throw new ConflictError('A tenant with this slug already exists', `SLUG_TAKEN: ${input.slug}`);
    }

    return this.tenants.create({
      slug: input.slug,
      name: input.name,
      plan: input.plan ?? CREATE_TENANT_DEFAULTS.plan,
      region_id: input.region_id ?? CREATE_TENANT_DEFAULTS.region_id,
      max_users: input.max_users ?? CREATE_TENANT_DEFAULTS.max_users,
      max_courses: input.max_courses ?? CREATE_TENANT_DEFAULTS.max_courses,
      max_storage_bytes: input.max_storage_bytes ?? CREATE_TENANT_DEFAULTS.max_storage_bytes,
      metadata: input.metadata ?? {},
    });
  }
}

export class UpdateTenantUseCase {
  constructor(private readonly tenants: ITenantAdminRepository) {}

  async execute(id: string, input: UpdateTenantInput): Promise<Tenant> {
    return this.tenants.update(id, input);
  }
}

export class SuspendTenantUseCase {
  constructor(private readonly tenants: ITenantAdminRepository) {}

  async execute(ctx: Readonly<RequestContext>, id: string, reason: string): Promise<void> {
    await this.tenants.suspend(id, reason, new Date().toISOString());

    // Log the suspension via activity_logs if available
    try {
      await this.tenants.logSuspension({ userId: ctx.userId, tenantId: id, reason });
    } catch {
      // Non-fatal: continue even if audit log fails
    }
  }
}

export class DeleteTenantUseCase {
  constructor(private readonly tenants: ITenantAdminRepository) {}

  async execute(id: string): Promise<void> {
    return this.tenants.softDelete(id);
  }
}
