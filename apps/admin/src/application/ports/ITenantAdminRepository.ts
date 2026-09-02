import type { Tenant, UpdateTenantInput } from '@/domain/types/tenant.types';

/**
 * Port — privileged (service-role) tenant management persistence.
 * All operations are super-admin gated at the boundary before reaching
 * the use cases; implementations use the admin client which bypasses RLS.
 */

/** Payload for creating a tenant row (defaults resolved by the use case) */
export interface NewTenantRow {
  slug: string;
  name: string;
  plan: string;
  region_id: string;
  max_users: number;
  max_courses: number;
  max_storage_bytes: number;
  metadata: Record<string, unknown>;
}

export interface ITenantAdminRepository {
  /** True when a non-deleted tenant with this slug already exists. */
  slugExists(slug: string): Promise<boolean>;

  /** Inserts the tenant row and returns it. */
  create(row: NewTenantRow): Promise<Tenant>;

  /** Updates mutable tenant fields and returns the updated row. */
  update(id: string, input: UpdateTenantInput): Promise<Tenant>;

  /** Marks the tenant suspended, recording reason + timestamp in metadata. */
  suspend(id: string, reason: string, suspendedAt: string): Promise<void>;

  /** Soft-deletes the tenant (status = deleted + deleted_at). */
  softDelete(id: string): Promise<void>;

  /** Best-effort audit entry for the suspension (activity_logs). */
  logSuspension(input: { userId: string; tenantId: string; reason: string }): Promise<void>;
}
