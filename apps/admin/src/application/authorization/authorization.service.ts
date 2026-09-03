import type { SupabaseClient } from '@supabase/supabase-js';

import { roleAllowsPermission } from '@/application/authorization/policy';
import { createRequestId } from '@/application/ports/IAuditLogger';
import { createRequestContext, type RequestContext } from '@/domain/types/context.types';
import type { PrimaryRole } from '@/domain/types/user.types';

export interface AuthorizeOptions {
  requireSuperAdmin?: boolean;
  targetTenantId?: string | null;
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'TENANT_MISMATCH',
    public readonly status: number = 403,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Unified, deny-by-default authorization service for server actions and API routes.
 * Validates authentication, role permissions, tenant context, and returns a frozen RequestContext.
 */
export async function authorizeCaller(
  supabase: SupabaseClient,
  permission: string | string[],
  options?: AuthorizeOptions,
): Promise<Readonly<RequestContext>> {
  // 1. Authenticate caller
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new AuthorizationError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const userId = userData.user.id;

  // 2. Fetch user profile for role and tenant
  const { data: profile, error: profError } = await supabase
    .from('users')
    .select('primary_role, tenant_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (profError || !profile) {
    throw new AuthorizationError('User profile not found or inactive', 'UNAUTHORIZED', 401);
  }

  const role = profile.primary_role as PrimaryRole;
  const callerTenantId = profile.tenant_id as string;

  // M13: request-scoped correlation id — minted once per authorization and
  // carried by every audit event / log entry emitted during this request.
  const requestId = createRequestId();

  // 3. Super Admin Check
  if (options?.requireSuperAdmin) {
    if (role !== 'super_admin') {
      throw new AuthorizationError('Super admin access required', 'FORBIDDEN', 403);
    }

    return createRequestContext({
      userId,
      tenantId: callerTenantId,
      role,
      permissions: ['*'],
      requestId,
    });
  }

  if (role === 'super_admin') {
    return createRequestContext({
      userId,
      tenantId: callerTenantId,
      role,
      permissions: ['*'],
      requestId,
    });
  }

  // 4. Tenant verification if targetTenantId is specified
  if (options?.targetTenantId && options.targetTenantId !== callerTenantId) {
    throw new AuthorizationError('Cross-tenant access forbidden', 'TENANT_MISMATCH', 403);
  }

  // 5. Permission evaluation
  const permissions = Array.isArray(permission) ? permission : [permission];

  // Fast-path evaluation via policy
  if (roleAllowsPermission(role, permissions)) {
    return createRequestContext({
      userId,
      tenantId: callerTenantId,
      role,
      permissions,
      requestId,
    });
  }

  // Database-backed permission check via RPC
  for (const p of permissions) {
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      p_user_id: userId,
      p_permission: p,
      p_tenant_id: callerTenantId ?? null,
    });

    if (hasPerm) {
      return createRequestContext({
        userId,
        tenantId: callerTenantId,
        role,
        permissions: [p],
        requestId,
      });
    }
  }

  throw new AuthorizationError(
    `Permission denied. Requires one of: ${permissions.join(', ')}`,
    'FORBIDDEN',
    403,
  );
}

/**
 * Super-admin only authorization gate.
 */
export async function authorizeSuperAdmin(supabase: SupabaseClient): Promise<Readonly<RequestContext>> {
  return authorizeCaller(supabase, '*', { requireSuperAdmin: true });
}
