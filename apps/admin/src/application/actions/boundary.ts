import {
  authorizeCaller,
  authorizeSuperAdmin,
} from '@/application/authorization/authorization.service';
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
  if (error || !data?.user) throw new Error('Unauthorized');
  return data.user.id;
}

/** Authenticates the caller and requires the super_admin role. */
export async function requireSuperAdmin(): Promise<Readonly<RequestContext>> {
  const supabase = await createServerClient();
  return authorizeSuperAdmin(supabase);
}
