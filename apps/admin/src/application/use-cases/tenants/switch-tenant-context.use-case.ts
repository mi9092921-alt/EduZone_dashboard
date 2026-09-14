import type { ITenantContextRepository, TenantContextResult } from '@/application/ports/ITenantContextRepository';
import type { RequestContext } from '@/domain/types/context.types';

/**
 * Switches (or exits) the calling super_admin's acting tenant context.
 *
 * No app-level audit call here (unlike the other tenant use cases in
 * this folder) -- switch_tenant_context (07_functions.sql) already
 * records a 'tenant_context_switched' activity_logs entry itself via
 * log_activity_async, inside the same transaction as the actual state
 * change. Logging again here would double the audit trail for every
 * switch.
 */
export class SwitchTenantContextUseCase {
  constructor(private readonly tenantContext: ITenantContextRepository) {}

  async execute(_ctx: Readonly<RequestContext>, tenantId: string | null): Promise<TenantContextResult> {
    return this.tenantContext.switchContext(tenantId);
  }
}
