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

/**
 * check_dashboard_access — SECURITY DEFINER, granted to authenticated.
 * Returns the caller's dashboard access status (role/tenant/token_version/maintenance).
 */
export async function checkDashboardAccess(): Promise<
  { ok: true; access: DashboardAccessResult } | { ok: false; error: string }
> {
  const { supabase } = container;
  const { data, error } = await supabase.rpc('check_dashboard_access');

  if (error) {
    // PostgrestError properties are non-enumerable — extract explicitly for the log.
    console.error('[auth-rpc] check_dashboard_access failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: error.code || 'RPC_FAILED' };
  }

  return { ok: true, access: (data ?? {}) as DashboardAccessResult };
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
