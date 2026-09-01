import type { PrimaryRole } from '@/domain/types/user.types';

/**
 * Immutable, request-scoped execution context.
 * Carries identity, tenancy, and permission scope for a single request or action.
 * MUST be passed explicitly to domain operations and application use-cases.
 */
export interface RequestContext {
  userId: string;
  tenantId: string;
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
    ...(params.requestId !== undefined ? { requestId: params.requestId } : {}),
  };
  return Object.freeze(ctx);
}

