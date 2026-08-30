import {
  getAllFeatureFlagsAction,
  getFeatureFlagByIdAction,
  createFeatureFlagAction,
  updateFeatureFlagAction,
  deleteFeatureFlagAction,
  toggleFeatureFlagAction,
  addRoleOverrideAction,
  removeRoleOverrideAction,
  addUserOverrideAction,
  removeUserOverrideAction,
  getAllRolesAction,
} from '@/application/actions/admin.actions';
import { container } from '@/container';
import type {
  FeatureFlag,
  FeatureFlagDetail,
  FeatureFlagRole,
  FeatureFlagUser,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
} from '@/domain/types/feature-flag.types';
import {
  mapDbRowToFeatureFlag,
  prepareFeatureFlagPayload,
} from '@/domain/types/feature-flag.types';

/**
 * Feature Flags service — all Supabase queries for feature flags.
 * No UI, no React — pure async functions.
 */

// ══════════════════════════════════════════════════
// READ
// ══════════════════════════════════════════════════

export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  if (typeof window !== 'undefined') {
    return getAllFeatureFlagsAction();
  }

  const { supabase } = container;
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('key');

  if (error) throw error;
  return (data ?? []).map(mapDbRowToFeatureFlag);
}

export async function getFeatureFlagById(id: string): Promise<FeatureFlagDetail> {
  if (typeof window !== 'undefined') {
    return getFeatureFlagByIdAction(id);
  }

  const { supabase } = container;

  // Fetch flag
  const { data: flag, error } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  // Fetch role overrides
  const { data: roleOverrides, error: roleErr } = await supabase
    .from('feature_flag_roles')
    .select('*, roles!feature_flag_roles_role_id_fkey(name, label)')
    .eq('flag_id', id);
  if (roleErr) throw roleErr;

  // Fetch user overrides
  const { data: userOverrides, error: userErr } = await supabase
    .from('feature_flag_users')
    .select('*, users!feature_flag_users_user_id_fkey(email, first_name, last_name)')
    .eq('flag_id', id);
  if (userErr) throw userErr;

  const mappedRoles: FeatureFlagRole[] = (roleOverrides ?? []).map((r: Record<string, unknown>) => {
    const role = r.roles as Record<string, string> | null;
    const mapped: FeatureFlagRole = {
      flag_id: r.flag_id as string,
      role_id: r.role_id as string,
      is_exclude: false, // Default to false (inclusion) since DB only supports inclusion
    };
    const labelToUse = role?.label || role?.name;
    if (labelToUse) mapped.role_name = labelToUse;
    if (role?.name) mapped.role_key = role.name;
    return mapped;
  });

  const mappedUsers: FeatureFlagUser[] = (userOverrides ?? []).map((u: Record<string, unknown>) => {
    const user = u.users as Record<string, string> | null;
    const mapped: FeatureFlagUser = {
      flag_id: u.flag_id as string,
      user_id: u.user_id as string,
      is_exclude: false, // Default to false
    };
    if (user?.email) mapped.user_email = user.email;
    const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : undefined;
    if (name) mapped.user_name = name;
    return mapped;
  });

  return {
    ...mapDbRowToFeatureFlag(flag),
    role_overrides: mappedRoles,
    user_overrides: mappedUsers,
  };
}

// ══════════════════════════════════════════════════
// WRITE
// ══════════════════════════════════════════════════

export async function createFeatureFlag(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
  if (typeof window !== 'undefined') {
    return createFeatureFlagAction(input);
  }

  const { supabase } = container;
  const payload = prepareFeatureFlagPayload(input);
  const { data, error } = await supabase
    .from('feature_flags')
    .insert(payload)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('FLAG_KEY_EXISTS');
    throw error;
  }
  return mapDbRowToFeatureFlag(data);
}

export async function updateFeatureFlag(
  id: string,
  input: UpdateFeatureFlagInput,
): Promise<FeatureFlag> {
  if (typeof window !== 'undefined') {
    return updateFeatureFlagAction(id, input);
  }

  const { supabase } = container;

  const { data: existing } = await supabase
    .from('feature_flags')
    .select('metadata')
    .eq('id', id)
    .single();

  const payload = prepareFeatureFlagPayload(input, existing?.metadata || {});

  const { data, error } = await supabase
    .from('feature_flags')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return mapDbRowToFeatureFlag(data);
}

export async function deleteFeatureFlag(id: string): Promise<void> {
  if (typeof window !== 'undefined') {
    return deleteFeatureFlagAction(id);
  }

  const { supabase } = container;
  const { error } = await supabase
    .from('feature_flags')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function toggleFeatureFlag(id: string, enabled: boolean): Promise<void> {
  if (typeof window !== 'undefined') {
    return toggleFeatureFlagAction(id, enabled);
  }

  const { supabase } = container;
  const { error } = await supabase
    .from('feature_flags')
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ══════════════════════════════════════════════════
// OVERRIDES
// ══════════════════════════════════════════════════

export async function addRoleOverride(
  flagId: string,
  roleId: string,
  isExclude: boolean = false,
): Promise<void> {
  if (typeof window !== 'undefined') {
    return addRoleOverrideAction(flagId, roleId, isExclude);
  }

  const { supabase } = container;

  const { data: { user } } = await supabase.auth.getUser();
  let tenantId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    tenantId = profile?.tenant_id ?? null;
  }

  if (!tenantId) {
    const { data: tenantData } = await supabase.from('tenants').select('id').limit(1).maybeSingle();
    tenantId = tenantData?.id ?? null;
  }

  if (!tenantId) {
    throw new Error('No tenant found to associate override with');
  }

  const { error } = await supabase
    .from('feature_flag_roles')
    .upsert(
      { tenant_id: tenantId, flag_id: flagId, role_id: roleId },
      { onConflict: 'tenant_id,flag_id,role_id' }
    );
  if (error) throw error;
}

export async function removeRoleOverride(flagId: string, roleId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    return removeRoleOverrideAction(flagId, roleId);
  }

  const { supabase } = container;
  const { error } = await supabase
    .from('feature_flag_roles')
    .delete()
    .eq('flag_id', flagId)
    .eq('role_id', roleId);
  if (error) throw error;
}

export async function addUserOverride(
  flagId: string,
  userId: string,
  isExclude: boolean = false,
): Promise<void> {
  if (typeof window !== 'undefined') {
    return addUserOverrideAction(flagId, userId, isExclude);
  }

  const { supabase } = container;

  let tenantId: string | null = null;
  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', userId).maybeSingle();
  tenantId = userData?.tenant_id ?? null;

  if (!tenantId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();
      tenantId = profile?.tenant_id ?? null;
    }
  }

  if (!tenantId) {
    const { data: tenantData } = await supabase.from('tenants').select('id').limit(1).maybeSingle();
    tenantId = tenantData?.id ?? null;
  }

  if (!tenantId) {
    throw new Error('No tenant found to associate override with');
  }

  const { error } = await supabase
    .from('feature_flag_users')
    .upsert(
      { tenant_id: tenantId, flag_id: flagId, user_id: userId },
      { onConflict: 'tenant_id,flag_id,user_id' }
    );
  if (error) throw error;
}

export async function removeUserOverride(flagId: string, userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    return removeUserOverrideAction(flagId, userId);
  }

  const { supabase } = container;
  const { error } = await supabase
    .from('feature_flag_users')
    .delete()
    .eq('flag_id', flagId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ══════════════════════════════════════════════════
// ROLES LIST (for override selectors)
// ══════════════════════════════════════════════════

export async function getAllRoles(): Promise<{ id: string; name: string; key: string }[]> {
  if (typeof window !== 'undefined') {
    return getAllRolesAction();
  }

  const { supabase } = container;
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, label')
    .order('name');

  if (error) throw error;
  
  return (data ?? []).map((r: { id: string; name: string; label: string | null }) => ({
    id: r.id,
    name: r.label || r.name,
    key: r.name,
  }));
}
