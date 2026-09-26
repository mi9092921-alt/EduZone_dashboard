import {
  disableMaintenanceModeAction,
  enableMaintenanceModeAction,
  lockAppAction,
  unlockAppAction,
} from '@/adapters/actions/settings.actions';
import { container } from '@/container';
import { mapDbError } from '@/domain/errors';
import { InfrastructureError, NotFoundError, UnauthorizedError } from '@/domain/errors';
import type {
  SettingKv,
  SettingsByCategory,
  MaintenanceModeParams,
} from '@/domain/types/settings.types';

/**
 * Settings service — all Supabase queries for the settings_kv domain.
 * No UI, no React — pure async functions.
 */

interface SettingKvRow {
  key: string;
  value: unknown;
  category: 'general' | 'security' | 'maintenance' | 'limits';
  description?: string | null;
  is_public?: boolean;
  version?: number;
  updated_by?: string | null;
  updated_at: string;
}

// Helper to map DB row to frontend type SettingKv
function mapDbRowToSetting(row: SettingKvRow): SettingKv {
  let valueType: 'string' | 'integer' | 'boolean' | 'json' = 'string';
  let valueStr = '';

  if (typeof row.value === 'boolean') {
    valueType = 'boolean';
    valueStr = row.value ? 'true' : 'false';
  } else if (typeof row.value === 'number') {
    valueType = 'integer';
    valueStr = String(row.value);
  } else if (typeof row.value === 'object' && row.value !== null) {
    valueType = 'json';
    valueStr = JSON.stringify(row.value, null, 2);
  } else {
    valueType = 'string';
    valueStr = String(row.value ?? '');
  }

  // Format key to a friendly label
  const label = row.key
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    key: row.key,
    value: valueStr,
    value_type: valueType,
    category: row.category,
    label: label,
    description: row.description ?? null,
    is_public: row.is_public ?? false,
    is_encrypted: false,
    version: row.version ?? 1,
    updated_by: row.updated_by ?? null,
    created_at: row.updated_at,
    updated_at: row.updated_at,
  };
}

// ══════════════════════════════════════════════════
// READ
// ══════════════════════════════════════════════════

export async function getAllSettings(): Promise<SettingKv[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('settings_kv')
    .select('*')
    .order('category')
    .order('key');

  if (error) throw mapDbError(error, 'settings.service.ts');
  return (data ?? []).map(mapDbRowToSetting);
}

export async function getSettingsByCategory(): Promise<SettingsByCategory> {
  const all = await getAllSettings();
  const grouped: SettingsByCategory = {
    general: [],
    security: [],
    maintenance: [],
    limits: [],
  };
  for (const s of all) {
    const cat = s.category as keyof SettingsByCategory;
    if (grouped[cat]) grouped[cat].push(s);
    else grouped.general.push(s);
  }
  return grouped;
}

export async function getSetting(key: string): Promise<string | null> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('settings_kv')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) throw mapDbError(error, 'settings.service.ts');
  if (!data) return null;
  if (typeof data.value === 'object' && data.value !== null) {
    return JSON.stringify(data.value);
  }
  return String(data.value);
}

// ══════════════════════════════════════════════════
// WRITE
// ══════════════════════════════════════════════════

export async function setSetting(key: string, value: string, valueType?: string): Promise<void> {
  const { supabase } = container;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError('ADMIN_ONLY: sign-in required');

  let parsedValue: unknown = value;
  if (valueType === 'boolean') {
    parsedValue = value === 'true' || value === '1' || value === 'yes';
  } else if (valueType === 'integer') {
    const intVal = parseInt(value, 10);
    parsedValue = isNaN(intVal) ? 0 : intVal;
  } else if (valueType === 'json') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }
  }

  // settings_kv is super-admin-only at the table policy level. Use the
  // SECURITY DEFINER RPC, which enforces settings.write and invalidates cache.
  const { error } = await supabase.rpc('set_setting', {
    p_key: key,
    p_value: parsedValue,
  });

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Setting');
    throw new InfrastructureError(undefined, `setSetting(${key}): ${error.message}`);
  }
}

export async function createSetting(
  setting: Partial<SettingKv> & { key: string; value: string },
): Promise<SettingKv> {
  const { supabase } = container;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError('ADMIN_ONLY: sign-in required');

  let parsedValue: unknown = setting.value;
  const valueType = setting.value_type;
  if (valueType === 'boolean') {
    parsedValue = setting.value === 'true' || setting.value === '1';
  } else if (valueType === 'integer') {
    const intVal = parseInt(setting.value, 10);
    parsedValue = isNaN(intVal) ? 0 : intVal;
  } else if (valueType === 'json') {
    try {
      parsedValue = JSON.parse(setting.value);
    } catch {
      parsedValue = setting.value;
    }
  }

  const insertPayload = {
    key: setting.key,
    value: parsedValue,
    category: setting.category ?? 'general',
    description: setting.description,
    is_public: setting.is_public ?? false,
    version: setting.version ?? 1,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('settings_kv')
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw mapDbError(error, 'settings.service.ts');
  return mapDbRowToSetting(data);
}

export async function deleteSetting(key: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.from('settings_kv').delete().eq('key', key);

  if (error) throw mapDbError(error, 'settings.service.ts');
}

// ══════════════════════════════════════════════════
// MAINTENANCE MODE
// ══════════════════════════════════════════════════

// 2026-09-26 security audit: these four privileged writes moved to server
// actions (settings.actions.ts) because the direct SECURITY DEFINER RPCs
// (`enable/disable_maintenance_mode`, `lock_app_for_all`, `unlock_app`) are
// EXECUTE-granted to service_role only and their internal auth.uid()-based
// permission checks can never pass from any client or service connection —
// every call failed with PERMISSION_DENIED. The actions write through
// `set_setting` under the caller's own session (DB-enforced settings.write)
// and re-apply the stricter gates app-side (settings.write / super_admin).

/** Thrown when a settings server action reports failure, keeping the
 * generic-message + hidden-detail error contract of this module. */
async function unwrapActionResult(result: { success: boolean; error?: string }): Promise<void> {
  if (!result.success) {
    throw new InfrastructureError(undefined, result.error ?? 'settings action failed');
  }
}

export async function enableMaintenanceMode(params: MaintenanceModeParams): Promise<void> {
  await unwrapActionResult(await enableMaintenanceModeAction(params));
}

export async function disableMaintenanceMode(): Promise<void> {
  await unwrapActionResult(await disableMaintenanceModeAction());
}

// ══════════════════════════════════════════════════
// APP LOCK
// ══════════════════════════════════════════════════

export async function lockApp(message: string): Promise<void> {
  await unwrapActionResult(await lockAppAction(message));
}

export async function unlockApp(): Promise<void> {
  await unwrapActionResult(await unlockAppAction());
}
