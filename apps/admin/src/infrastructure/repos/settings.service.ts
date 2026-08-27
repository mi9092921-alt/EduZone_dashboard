import { container } from '@/container';
import type {
  SettingKv,
  SettingsByCategory,
  MaintenanceModeParams,
} from '@/domain/types/settings.types';

/**
 * Settings service — all Supabase queries for the settings_kv domain.
 * No UI, no React — pure async functions.
 */

// Helper to map DB row to frontend type SettingKv
function mapDbRowToSetting(row: any): SettingKv {
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
    description: row.description,
    is_public: row.is_public,
    is_encrypted: false,
    version: row.version,
    updated_by: row.updated_by,
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

  if (error) throw error;
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

  if (error) throw error;
  if (!data) return null;
  if (typeof data.value === 'object' && data.value !== null) {
    return JSON.stringify(data.value);
  }
  return String(data.value);
}

// ══════════════════════════════════════════════════
// WRITE
// ══════════════════════════════════════════════════

export async function setSetting(
  key: string,
  value: string,
  valueType?: string,
): Promise<void> {
  const { supabase } = container;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ADMIN_ONLY');

  let parsedValue: any = value;
  if (valueType === 'boolean') {
    parsedValue = (value === 'true' || value === '1' || value === 'yes');
  } else if (valueType === 'integer') {
    parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) parsedValue = 0;
  } else if (valueType === 'json') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }
  }

  const updatePayload: Record<string, unknown> = {
    value: parsedValue,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('settings_kv')
    .update(updatePayload)
    .eq('key', key);

  if (error) {
    if (error.code === 'PGRST116') throw new Error('SETTING_NOT_FOUND');
    throw error;
  }
}

export async function createSetting(setting: Partial<SettingKv> & { key: string; value: string }): Promise<SettingKv> {
  const { supabase } = container;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ADMIN_ONLY');

  let parsedValue: any = setting.value;
  const valueType = setting.value_type;
  if (valueType === 'boolean') {
    parsedValue = (setting.value === 'true' || setting.value === '1');
  } else if (valueType === 'integer') {
    parsedValue = parseInt(setting.value, 10);
    if (isNaN(parsedValue)) parsedValue = 0;
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

  if (error) throw error;
  return mapDbRowToSetting(data);
}

export async function deleteSetting(key: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase
    .from('settings_kv')
    .delete()
    .eq('key', key);

  if (error) throw error;
}

// ══════════════════════════════════════════════════
// MAINTENANCE MODE
// ══════════════════════════════════════════════════

export async function enableMaintenanceMode(params: MaintenanceModeParams): Promise<void> {
  const { supabase } = container;

  const settings: Array<{ key: string; value: any; category: string }> = [
    { key: 'maintenance_mode', value: true, category: 'maintenance' },
    { key: 'maintenance_message', value: params.message, category: 'maintenance' },
    { key: 'maintenance_ends_at', value: params.ends_at, category: 'maintenance' },
  ];

  if (params.message_en) {
    settings.push({
      key: 'maintenance_message_en',
      value: params.message_en,
      category: 'maintenance',
    });
  }
  if (params.exclude_roles?.length) {
    settings.push({
      key: 'maintenance_exclude_roles',
      value: params.exclude_roles,
      category: 'maintenance',
    });
  }
  if (params.exclude_users?.length) {
    settings.push({
      key: 'maintenance_exclude_users',
      value: params.exclude_users,
      category: 'maintenance',
    });
  }

  const { data: { user } } = await supabase.auth.getUser();

  for (const s of settings) {
    const { error } = await supabase
      .from('settings_kv')
      .upsert(
        { ...s, updated_by: user?.id, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    if (error) throw error;
  }
}

export async function disableMaintenanceMode(): Promise<void> {
  const { supabase } = container;
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('settings_kv')
    .upsert(
      {
        key: 'maintenance_mode',
        value: false,
        category: 'maintenance',
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );

  if (error) throw error;
}

// ══════════════════════════════════════════════════
// APP LOCK
// ══════════════════════════════════════════════════

export async function lockApp(message: string): Promise<void> {
  const { supabase } = container;
  const { data: { user } } = await supabase.auth.getUser();

  const settings = [
    { key: 'app_locked', value: true, category: 'maintenance' },
    { key: 'app_lock_message', value: message, category: 'maintenance' },
  ];

  for (const s of settings) {
    const { error } = await supabase
      .from('settings_kv')
      .upsert(
        { ...s, updated_by: user?.id, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    if (error) throw error;
  }
}

export async function unlockApp(): Promise<void> {
  const { supabase } = container;
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('settings_kv')
    .upsert(
      {
        key: 'app_locked',
        value: false,
        category: 'maintenance',
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );

  if (error) throw error;
}

