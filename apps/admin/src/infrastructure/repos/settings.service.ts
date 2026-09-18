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

export async function enableMaintenanceMode(params: MaintenanceModeParams): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('enable_maintenance_mode', {
    p_message: params.message,
    p_ends_at: params.ends_at,
    p_exclude_roles: params.exclude_roles ?? ['super_admin', 'admin'],
    p_exclude_users: params.exclude_users ?? [],
  });
  if (error) throw mapDbError(error, 'settings.service.ts');
}

export async function disableMaintenanceMode(): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('disable_maintenance_mode');

  if (error) throw mapDbError(error, 'settings.service.ts');
}

// ══════════════════════════════════════════════════
// APP LOCK
// ══════════════════════════════════════════════════

export async function lockApp(message: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('lock_app_for_all', { p_message: message });
  if (error) throw mapDbError(error, 'settings.service.ts');
}

export async function unlockApp(): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('unlock_app');

  if (error) throw mapDbError(error, 'settings.service.ts');
}
