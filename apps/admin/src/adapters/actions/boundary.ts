import {
  authorizeCaller,
  authorizeSuperAdmin,
} from '@/application/authorization/authorization.service';
import { ForbiddenError, UnauthorizedError } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Shared Server-Action boundary gate — the single authentication +
 * authorization checkpoint used by every server action file.
 *
 * This replaces the previously duplicated per-file helpers
 * (`requirePermission`/`requireUser` in admin.actions.ts,
 * `verifyCallerPermission` in user.actions.ts, `requireSuperAdmin` in
 * tenants.actions.ts) so authorization cannot drift between boundaries.
 *
 * Deny-by-default: every helper throws `AuthorizationError` on failure.
 * All database/tenant context comes from the trusted server session —
 * never from client-supplied arguments.
 */

/** Authenticates the caller and requires one of the given permissions. */
export async function requirePermission(
  permission: string | string[],
): Promise<Readonly<RequestContext>> {
  const supabase = await createServerClient();
  return authorizeCaller(supabase, permission);
}

/** Authenticates the caller only (no permission required). */
export async function requireUser(): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new UnauthorizedError();
  return data.user.id;
}

/** Authenticates the caller and requires the super_admin role. */
export async function requireSuperAdmin(): Promise<Readonly<RequestContext>> {
  const supabase = await createServerClient();
  return authorizeSuperAdmin(supabase);
}

/**
 * IDOR/BOLA guard: asserts a single-resource action (delete/toggle/clear by
 * id) targets a resource owned by the caller's own tenant.
 *
 * `super_admin` (ctx.permissions includes '*', see authorizeCaller) is
 * exempt — the role is already granted cross-tenant access everywhere else
 * in the authorization service.
 *
 * Fails closed: a `null` resourceTenantId (lookup error or resource not
 * found) is treated as a mismatch rather than allowed through, so a
 * transient lookup failure can never widen access.
 */
export function assertSameTenant(
  ctx: Readonly<RequestContext>,
  resourceTenantId: string | null,
): void {
  if (ctx.permissions.includes('*')) return;
  if (!resourceTenantId || resourceTenantId !== ctx.tenantId) {
    throw new ForbiddenError('Cross-tenant access forbidden');
  }
}
