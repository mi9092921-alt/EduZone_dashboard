import type { PrimaryRole } from '@/domain/types/user.types';

/**
 * Immutable, request-scoped execution context.
 * Carries identity, tenancy, and permission scope for a single request or action.
 * MUST be passed explicitly to domain operations and application use-cases.
 */
export interface RequestContext {
  userId: string;
  tenantId: string;
  /**
   * Set only for a super_admin who has switched tenant context (Tenant
   * Switcher) -- their real home tenant, distinct from `tenantId` (the
   * tenant currently being viewed/managed). Absent for every other
   * caller, where it would just equal `tenantId`.
   */
  homeTenantId?: string;
  role: PrimaryRole;
  permissions: readonly string[];
  requestId?: string;
}

/**
 * Factory to create a validated, frozen RequestContext.
 */
export function createRequestContext(params: RequestContext): Readonly<RequestContext> {
  const ctx: RequestContext = {
    userId: params.userId,
    tenantId: params.tenantId,
    role: params.role,
    permissions: Object.freeze([...params.permissions]),
    ...(params.homeTenantId !== undefined ? { homeTenantId: params.homeTenantId } : {}),
    ...(params.requestId !== undefined ? { requestId: params.requestId } : {}),
  };
  return Object.freeze(ctx);
}

