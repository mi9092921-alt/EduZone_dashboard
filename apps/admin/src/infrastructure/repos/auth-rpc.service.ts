import { container } from '@/container';

/**
 * Auth RPC service (M11 — RPC Boundary).
 *
 * Owns the session-lifecycle RPC call sites that previously lived directly
 * inside UI components (AuthProvider, LoginPage, Topbar) and the
 * useSessionCheck hook. RPCs are classified in infrastructure/rpc/rpc-catalog.ts;
 * UI/adapters must go through these wrappers, never call .rpc() directly.
 */

export interface DashboardAccessResult {
  allowed: boolean;
  role?: string;
  tenant_id?: string;
  token_version?: number | string | null;
  reason?: string;
  message?: string;
  until?: string;
}

// PGRST303 ("JWT issued at future") is a known transient upstream PostgREST
// bug: a stale cached view of "now" inside PostgREST occasionally makes a
// freshly-minted, genuinely valid JWT look like it was issued in the
// future. It affects any fresh authenticated request -- not just login --
// including this RPC firing from AuthProvider on every protected page
// mount and from the useSessionCheck heartbeat, not only from LoginPage.
// See the extensive report at
// https://github.com/orgs/supabase/discussions/48123 and the still-open
// https://github.com/PostgREST/postgrest/issues/5196. A short bounded
// retry with the same token is the documented mitigation while it
// settles; any other error is real and is returned immediately, unretried.
const PGRST303_RETRY_DELAYS_MS = [500, 1500];

/**
 * check_dashboard_access — SECURITY DEFINER, granted to authenticated.
 * Returns the caller's dashboard access status (role/tenant/token_version/maintenance).
 */
export async function checkDashboardAccess(): Promise<
  { ok: true; access: DashboardAccessResult } | { ok: false; error: string }
> {
  const { supabase } = container;
  let lastError: { message: string; code: string; details: string | null; hint: string | null } | null = null;

  for (let attempt = 0; attempt <= PGRST303_RETRY_DELAYS_MS.length; attempt++) {
    const { data, error } = await supabase.rpc('check_dashboard_access');

    if (!error) {
      return { ok: true, access: (data ?? {}) as DashboardAccessResult };
    }

    lastError = { message: error.message, code: error.code, details: error.details, hint: error.hint };

    const delayMs = error.code === 'PGRST303' ? PGRST303_RETRY_DELAYS_MS[attempt] : undefined;
    if (delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    break;
  }

  // PostgrestError properties are non-enumerable — extract explicitly for the log.
  console.error('[auth-rpc] check_dashboard_access failed:', lastError);
  return { ok: false, error: lastError?.code || 'RPC_FAILED' };
}

/**
 * logout_current_user — SECURITY DEFINER, granted to authenticated.
 * Bumps the caller's token_version and revokes active sessions before signOut.
 */
export async function logoutCurrentUser(): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('logout_current_user');
  if (error) {
    // Logout must always proceed — log and continue to auth.signOut().
    console.warn('[auth-rpc] logout_current_user failed:', error.message);
  }
}
