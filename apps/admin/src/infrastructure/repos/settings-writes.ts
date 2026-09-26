import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Privileged settings writes executed under the CALLER'S OWN session client.
 *
 * 2026-09-26 security audit: the direct SECURITY DEFINER RPCs
 * (`enable/disable_maintenance_mode`, `lock_app_for_all`, `unlock_app`) are
 * EXECUTE-granted to service_role only (schema 10_permissions.sql) and their
 * internal auth.uid()-based permission checks can never pass from a service
 * connection either — every call failed with PERMISSION_DENIED and the
 * Maintenance Wizard / App Lock features were dead in all environments.
 *
 * These helpers write the same keys through `set_setting` — the SECURITY
 * DEFINER RPC granted to `authenticated` that internally enforces
 * `settings.write`, value typing, cache invalidation and the settings audit
 * trail (schema 07_functions.sql) — so the caller's identity stays intact
 * (settings_kv.updated_by) and the DB re-checks authorization on every call.
 *
 * The `.rpc(` call site lives here (infrastructure) per the M11 RPC boundary;
 * adapters/actions/settings.actions.ts owns the zod validation and the
 * requirePermission / requireSuperAdmin gates.
 */

export interface MaintenanceModeWriteParams {
  message: string;
  ends_at: string | null;
  exclude_roles?: string[];
  exclude_users?: string[];
}

async function setSettingViaSessionClient(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await supabase.rpc('set_setting', { p_key: key, p_value: value });
  if (error) throw new Error(`${key}: ${error.message}`);
}

/** Banner config first, flag LAST: a partial failure can never leave
 * maintenance mode ON without its message configured. */
export async function enableMaintenanceModeViaSession(
  supabase: SupabaseClient,
  params: MaintenanceModeWriteParams,
): Promise<void> {
  await setSettingViaSessionClient(supabase, 'maintenance_message', params.message);
  await setSettingViaSessionClient(
    supabase,
    'maintenance_excluded_roles',
    params.exclude_roles ?? ['super_admin', 'admin'],
  );
  await setSettingViaSessionClient(
    supabase,
    'maintenance_excluded_users',
    params.exclude_users ?? [],
  );
  await setSettingViaSessionClient(supabase, 'maintenance_ends_at', params.ends_at);
  await setSettingViaSessionClient(supabase, 'maintenance_mode', true);
}

export async function disableMaintenanceModeViaSession(supabase: SupabaseClient): Promise<void> {
  await setSettingViaSessionClient(supabase, 'maintenance_mode', false);
}

export async function lockAppViaSession(
  supabase: SupabaseClient,
  message: string,
): Promise<void> {
  await setSettingViaSessionClient(supabase, 'app_lock_message', message);
  await setSettingViaSessionClient(supabase, 'app_locked', true);
}

export async function unlockAppViaSession(supabase: SupabaseClient): Promise<void> {
  await setSettingViaSessionClient(supabase, 'app_locked', false);
}
