import type { IAuditLogger } from '@/application/ports/IAuditLogger';
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
 *
 * M13 (§17): the use case is the audit-event source — tenant create,
 * suspend and delete all emit events via the injected IAuditLogger
 * (routed through the queued log_activity_async pipeline), replacing the
 * former direct activity_logs insert inside the repository.
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
  constructor(
    private readonly tenants: ITenantAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, input: CreateTenantInput): Promise<Tenant> {
    // Pre-check slug uniqueness (fast, user-friendly path). This does NOT
    // close the create-race by itself — the DB unique index
    // uq_tenants_slug_active is the real guarantee; the 23505 fallthrough
    // below maps that race into the same stable SLUG_TAKEN error.
    if (await this.tenants.slugExists(input.slug)) {
      throw new ConflictError('A tenant with this slug already exists', `SLUG_TAKEN: ${input.slug}`);
    }

    try {
      const tenant = await this.tenants.create({
        slug: input.slug,
        name: input.name,
        plan: input.plan ?? CREATE_TENANT_DEFAULTS.plan,
        region_id: input.region_id ?? CREATE_TENANT_DEFAULTS.region_id,
        max_users: input.max_users ?? CREATE_TENANT_DEFAULTS.max_users,
        max_courses: input.max_courses ?? CREATE_TENANT_DEFAULTS.max_courses,
        max_storage_bytes: input.max_storage_bytes ?? CREATE_TENANT_DEFAULTS.max_storage_bytes,
        metadata: input.metadata ?? {},
      });

      await this.audit.record(ctx, {
        type: 'tenant_created',
        summary: `Tenant created: ${tenant.slug}`,
        details: { slug: tenant.slug, plan: tenant.plan ?? null },
        riskLevel: 'high',
        targetUserId: tenant.id,
      });

      return tenant;
    } catch (error: unknown) {
      // M16 (F16-3): two concurrent creates with the same slug — one insert
      // wins, the loser hits uq_tenants_slug_active (23505). Re-check the
      // slug so the caller always gets the stable SLUG_TAKEN conflict, never
      // a raw DB error.
      if (await this.tenants.slugExists(input.slug)) {
        throw new ConflictError(
          'A tenant with this slug already exists',
          `SLUG_TAKEN (race): ${input.slug}`,
        );
      }
      throw error;
    }
  }
}

export class UpdateTenantUseCase {
  constructor(
    private readonly tenants: ITenantAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, id: string, input: UpdateTenantInput): Promise<Tenant> {
    const tenant = await this.tenants.update(id, input);
    await this.audit.record(ctx, {
      type: 'tenant_updated',
      summary: `Tenant updated: ${tenant.slug ?? id}`,
      details: { fields: Object.keys(input) },
      riskLevel: 'high',
      targetUserId: id,
    });
    return tenant;
  }
}

export class SuspendTenantUseCase {
  constructor(
    private readonly tenants: ITenantAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, id: string, reason: string): Promise<void> {
    await this.tenants.suspend(id, reason, new Date().toISOString());

    // M13: audit entry via the queued pipeline (was a direct activity_logs
    // insert in the repository). Best-effort: a failed audit write never
    // fails the suspension.
    try {
      await this.audit.record(ctx, {
        type: 'tenant_suspended',
        summary: 'Tenant suspended',
        details: { reason },
        riskLevel: 'high',
        targetUserId: id,
      });
    } catch {
      // Non-fatal: continue even if audit logging fails
    }
  }
}

export class DeleteTenantUseCase {
  constructor(
    private readonly tenants: ITenantAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, id: string): Promise<void> {
    await this.tenants.softDelete(id);
    await this.audit.record(ctx, {
      type: 'tenant_deleted',
      summary: 'Tenant soft-deleted',
      riskLevel: 'high',
      targetUserId: id,
    });
  }
}
