import type { SupabaseClient } from '@supabase/supabase-js';

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

  // 5. Permission evaluation — the database is the final source of truth
  // for every permission decision from this point on, with `super_admin`
  // (handled in step 3, above) as the only explicit exception.
  //
  // There used to be a `roleAllowsPermission()` fast-path here that
  // returned an allow *without ever consulting the database* whenever a
  // static, hardcoded role->permission allowlist said yes. That allowlist
  // cannot see per-tenant `role_permissions` customizations or per-user
  // `user_permission_cache` overrides/revocations/expiries, so it could
  // silently grant access the database would have denied (a permission
  // revoked for one admin in one tenant, a role's grant that a tenant
  // deliberately narrowed, an expired cache entry, etc.) — i.e. exactly
  // the "role allows, but the permission itself is denied" case this
  // service exists to prevent. `roleAllowsPermission` is intentionally no
  // longer consulted here: every non-super_admin caller is now confirmed
  // against `user_has_permission` (tenant-scoped, DB-backed) before any
  // mutation is authorized.
  const permissions = Array.isArray(permission) ? permission : [permission];

  for (const p of permissions) {
    const { data: hasPerm, error: rpcError } = await supabase.rpc('user_has_permission', {
      p_user_id: userId,
      p_permission: p,
      p_tenant_id: callerTenantId ?? null,
    });

    // Fail closed: an RPC error must never be treated as an implicit
    // allow — try the next requested permission (if any) instead.
    if (rpcError) continue;

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
