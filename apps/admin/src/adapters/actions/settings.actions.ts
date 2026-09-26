'use server';

import { z } from 'zod';

import { requirePermission, requireSuperAdmin } from '@/adapters/actions/boundary';
import { toClientMessage } from '@/domain/errors';
import {
  disableMaintenanceModeViaSession,
  enableMaintenanceModeViaSession,
  lockAppViaSession,
  unlockAppViaSession,
} from '@/infrastructure/repos/settings-writes';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Server-Action boundary for maintenance-mode and app-lock writes.
 *
 * WHY THIS EXISTS (2026-09-26 security audit): the browser previously called
 * the SECURITY DEFINER RPCs `enable_maintenance_mode` / `disable_maintenance_mode`
 * and `lock_app_for_all` / `unlock_app` directly from client components
 * (settings.service.ts). Those RPCs are EXECUTE-granted to service_role ONLY
 * (schema 10_permissions.sql), and their internal
 * user_has_permission(auth.uid(), …) / is_current_user_super_admin() checks can
 * never pass on a service-role connection either (auth.uid() is NULL there), so
 * every call failed with PERMISSION_DENIED — the Maintenance Wizard and App Lock
 * features could not succeed in any environment.
 *
 * The writes now go through `set_setting` (see infrastructure/repos/
 * settings-writes.ts) under the CALLER'S OWN session, so auth.uid() stays a
 * real user and the DB re-enforces `settings.write` on every call. The DB
 * additionally pins the app-lock keys (app_locked, app_lock_message) to
 * super_admin inside set_setting itself.
 *
 * Authorization gates (app layer, matching the dead RPCs' internal checks):
 *  - maintenance mode → `settings.write` (same permission
 *    enable_maintenance_mode enforced internally),
 *  - app lock/unlock → super_admin (same check lock_app_for_all/unlock_app
 *    enforced internally, and now also pinned DB-side in set_setting).
 */

const maintenanceParamsSchema = z.object({
  message: z.string().trim().min(1).max(500),
  message_en: z.string().trim().max(500).optional(),
  ends_at: z.union([z.string().datetime({ offset: true }), z.null()]),
  exclude_roles: z
    .array(z.enum(['student', 'teacher', 'admin', 'super_admin']))
    .max(4)
    .optional(),
  exclude_users: z.array(z.string().uuid()).max(100).optional(),
});

/** Enables maintenance mode (settings.write gate; mirrors enable_maintenance_mode). */
export async function enableMaintenanceModeAction(
  params: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = maintenanceParamsSchema.parse(params);
    // requirePermission returns the cookie-bound session client — the write
    // must run under the caller's own JWT so set_setting's internal
    // settings.write check and updated_by audit column stay intact.
    const { supabase } = await requirePermission('settings.write');
    await enableMaintenanceModeViaSession(supabase, {
      message: parsed.message,
      ends_at: parsed.ends_at ?? null,
      ...(parsed.exclude_roles !== undefined ? { exclude_roles: parsed.exclude_roles } : {}),
      ...(parsed.exclude_users !== undefined ? { exclude_users: parsed.exclude_users } : {}),
    });
    return { success: true };
  } catch (error: unknown) {
    console.error('enableMaintenanceModeAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}

/** Disables maintenance mode (settings.write gate; mirrors disable_maintenance_mode). */
export async function disableMaintenanceModeAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requirePermission('settings.write');
    await disableMaintenanceModeViaSession(supabase);
    return { success: true };
  } catch (error: unknown) {
    console.error('disableMaintenanceModeAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}

/** Locks the whole app (super_admin gate; mirrors lock_app_for_all). */
export async function lockAppAction(
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsedMessage = z.string().trim().min(1).max(500).parse(message);
    await requireSuperAdmin();
    const supabase = await createServerClient();
    await lockAppViaSession(supabase, parsedMessage);
    return { success: true };
  } catch (error: unknown) {
    console.error('lockAppAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}

/** Unlocks the whole app (super_admin gate; mirrors unlock_app). */
export async function unlockAppAction(): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const supabase = await createServerClient();
    await unlockAppViaSession(supabase);
    return { success: true };
  } catch (error: unknown) {
    console.error('unlockAppAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}
