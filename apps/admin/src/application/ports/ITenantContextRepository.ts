/**
 * Port — session-scoped tenant context switching (Tenant Switcher,
 * super_admin only).
 *
 * Deliberately separate from ITenantAdminRepository: that port's
 * implementation uses the service-role (admin) client to manage
 * arbitrary tenant rows by id, bypassing RLS. This operation is the
 * opposite shape — it acts on the CALLING super_admin's own session
 * (`auth.uid()` inside switch_tenant_context, 07_functions.sql), so it
 * must go through the session-bound server client, never the admin
 * client (which has no JWT / auth.uid() at all).
 */

export interface TenantContextResult {
  tenantId: string;
  tenantName: string;
}

export interface ITenantContextRepository {
  /**
   * Switches (or exits, when tenantId is null) the caller's acting
   * tenant context. All validation (super_admin role, target tenant
   * exists/active) happens inside the switch_tenant_context RPC itself;
   * this is a thin pass-through.
   */
  switchContext(tenantId: string | null): Promise<TenantContextResult>;
}
