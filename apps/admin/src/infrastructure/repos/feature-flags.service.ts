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
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Feature Flags service — all Supabase queries for feature flags.
 * No UI, no React — pure async functions.
 */

// ══════════════════════════════════════════════════
// READ
// ══════════════════════════════════════════════════

export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  const { supabase } = container;
  const { data, error } = await supabase.from('feature_flags').select('*').order('key');
  if (error) throw error;
  return (data ?? []).map(mapDbRowToFeatureFlag);
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function getAllFeatureFlagsAdmin(): Promise<FeatureFlag[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('feature_flags').select('*').order('key');
  if (error) throw error;
  return (data ?? []).map(mapDbRowToFeatureFlag);
}

export async function getFeatureFlagById(id: string): Promise<FeatureFlagDetail> {
  const { supabase } = container;

  const { data: flag, error } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  const { data: roleOverrides, error: roleErr } = await supabase
    .from('feature_flag_roles')
    .select('*, roles!feature_flag_roles_role_id_fkey(name, label)')
    .eq('flag_id', id);
  if (roleErr) throw roleErr;

  const { data: userOverrides, error: userErr } = await supabase
    .from('feature_flag_users')
    .select('*, users!feature_flag_users_user_id_fkey(email, first_name, last_name)')
    .eq('flag_id', id);
  if (userErr) throw userErr;

  const mappedRoles = mapRoleOverrides(roleOverrides ?? []);
  const mappedUsers = mapUserOverrides(userOverrides ?? []);

  return {
    ...mapDbRowToFeatureFlag(flag),
    role_overrides: mappedRoles,
    user_overrides: mappedUsers,
  };
}

/** Shared mapping helpers */
function mapRoleOverrides(roleOverrides: Record<string, unknown>[]): FeatureFlagRole[] {
  return roleOverrides.map((r: Record<string, unknown>) => {
    const role = r.roles as Record<string, string> | null;
    const mapped: FeatureFlagRole = {
      flag_id: r.flag_id as string,
      role_id: r.role_id as string,
      is_exclude: false,
    };
    const labelToUse = role?.label || role?.name;
    if (labelToUse) mapped.role_name = labelToUse;
    if (role?.name) mapped.role_key = role.name;
    return mapped;
  });
}

function mapUserOverrides(userOverrides: Record<string, unknown>[]): FeatureFlagUser[] {
  return userOverrides.map((u: Record<string, unknown>) => {
    const user = u.users as Record<string, string> | null;
    const mapped: FeatureFlagUser = {
      flag_id: u.flag_id as string,
      user_id: u.user_id as string,
      is_exclude: false,
    };
    if (user?.email) mapped.user_email = user.email;
    const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : undefined;
    if (name) mapped.user_name = name;
    return mapped;
  });
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function getFeatureFlagByIdAdmin(id: string): Promise<FeatureFlagDetail> {
  const admin = createAdminClient();

  const { data: flag, error } = await admin.from('feature_flags').select('*').eq('id', id).single();
  if (error) throw error;

  const { data: roleOverrides, error: roleErr } = await admin
    .from('feature_flag_roles')
    .select('*, roles!feature_flag_roles_role_id_fkey(name, label)')
    .eq('flag_id', id);
  if (roleErr) throw roleErr;

  const { data: userOverrides, error: userErr } = await admin
    .from('feature_flag_users')
    .select('*, users!feature_flag_users_user_id_fkey(email, first_name, last_name)')
    .eq('flag_id', id);
  if (userErr) throw userErr;

  return {
    ...mapDbRowToFeatureFlag(flag),
    role_overrides: mapRoleOverrides(roleOverrides ?? []),
    user_overrides: mapUserOverrides(userOverrides ?? []),
  };
}

// ══════════════════════════════════════════════════
// WRITE
// ══════════════════════════════════════════════════

export async function createFeatureFlag(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
  const { supabase } = container;
  const payload = prepareFeatureFlagPayload(input);
  const { data, error } = await supabase.from('feature_flags').insert(payload).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('FLAG_KEY_EXISTS');
    throw error;
  }
  return mapDbRowToFeatureFlag(data);
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function createFeatureFlagAdmin(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
  const admin = createAdminClient();
  const payload = prepareFeatureFlagPayload(input);
  const { data, error } = await admin.from('feature_flags').insert(payload).select().single();
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

/** Server-action variant — uses service_role to bypass RLS. */
export async function updateFeatureFlagAdmin(
  id: string,
  input: UpdateFeatureFlagInput,
): Promise<FeatureFlag> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from('feature_flags').select('metadata').eq('id', id).single();
  const payload = prepareFeatureFlagPayload(input, existing?.metadata || {});
  const { data, error } = await admin
    .from('feature_flags')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapDbRowToFeatureFlag(data);
}

export async function deleteFeatureFlag(id: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.from('feature_flags').delete().eq('id', id);
  if (error) throw error;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function deleteFeatureFlagAdmin(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('feature_flags').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleFeatureFlag(id: string, enabled: boolean): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase
    .from('feature_flags')
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function toggleFeatureFlagAdmin(id: string, enabled: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
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
  _isExclude: boolean = false,
): Promise<void> {
  const { supabase } = container;

  const { data: { user } } = await supabase.auth.getUser();
  let tenantId: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle();
    tenantId = profile?.tenant_id ?? null;
  }
  if (!tenantId) {
    const { data: tenantData } = await supabase.from('tenants').select('id').limit(1).maybeSingle();
    tenantId = tenantData?.id ?? null;
  }
  if (!tenantId) throw new Error('No tenant found to associate override with');

  const { error } = await supabase
    .from('feature_flag_roles')
    .upsert({ tenant_id: tenantId, flag_id: flagId, role_id: roleId }, { onConflict: 'tenant_id,flag_id,role_id' });
  if (error) throw error;
}

/** Server-action variant — uses service_role and ctx.tenantId. */
export async function addRoleOverrideAdmin(
  flagId: string,
  roleId: string,
  tenantId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const { data } = await admin.from('tenants').select('id').limit(1).maybeSingle();
    resolvedTenantId = data?.id ?? null;
  }
  if (!resolvedTenantId) throw new Error('No tenant found to associate override with');
  const { error } = await admin
    .from('feature_flag_roles')
    .upsert({ tenant_id: resolvedTenantId, flag_id: flagId, role_id: roleId }, { onConflict: 'tenant_id,flag_id,role_id' });
  if (error) throw error;
}

export async function removeRoleOverride(flagId: string, roleId: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.from('feature_flag_roles').delete().eq('flag_id', flagId).eq('role_id', roleId);
  if (error) throw error;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function removeRoleOverrideAdmin(flagId: string, roleId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('feature_flag_roles').delete().eq('flag_id', flagId).eq('role_id', roleId);
  if (error) throw error;
}

export async function addUserOverride(
  flagId: string,
  userId: string,
  _isExclude: boolean = false,
): Promise<void> {
  const { supabase } = container;

  let tenantId: string | null = null;
  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', userId).maybeSingle();
  tenantId = userData?.tenant_id ?? null;

  if (!tenantId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle();
      tenantId = profile?.tenant_id ?? null;
    }
  }
  if (!tenantId) {
    const { data: tenantData } = await supabase.from('tenants').select('id').limit(1).maybeSingle();
    tenantId = tenantData?.id ?? null;
  }
  if (!tenantId) throw new Error('No tenant found to associate override with');

  const { error } = await supabase
    .from('feature_flag_users')
    .upsert({ tenant_id: tenantId, flag_id: flagId, user_id: userId }, { onConflict: 'tenant_id,flag_id,user_id' });
  if (error) throw error;
}

/** Server-action variant — uses service_role and ctx.tenantId. */
export async function addUserOverrideAdmin(
  flagId: string,
  userId: string,
  tenantId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const { data: userData } = await admin.from('users').select('tenant_id').eq('id', userId).maybeSingle();
    resolvedTenantId = userData?.tenant_id ?? null;
  }
  if (!resolvedTenantId) {
    const { data } = await admin.from('tenants').select('id').limit(1).maybeSingle();
    resolvedTenantId = data?.id ?? null;
  }
  if (!resolvedTenantId) throw new Error('No tenant found to associate override with');
  const { error } = await admin
    .from('feature_flag_users')
    .upsert({ tenant_id: resolvedTenantId, flag_id: flagId, user_id: userId }, { onConflict: 'tenant_id,flag_id,user_id' });
  if (error) throw error;
}

export async function removeUserOverride(flagId: string, userId: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.from('feature_flag_users').delete().eq('flag_id', flagId).eq('user_id', userId);
  if (error) throw error;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function removeUserOverrideAdmin(flagId: string, userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('feature_flag_users').delete().eq('flag_id', flagId).eq('user_id', userId);
  if (error) throw error;
}

// ══════════════════════════════════════════════════
// ROLES LIST (for override selectors)
// ══════════════════════════════════════════════════

export async function getAllRoles(): Promise<{ id: string; name: string; key: string }[]> {
  const { supabase } = container;
  const { data, error } = await supabase.from('roles').select('id, name, label').order('name');
  if (error) throw error;
  return (data ?? []).map((r: { id: string; name: string; label: string | null }) => ({
    id: r.id,
    name: r.label || r.name,
    key: r.name,
  }));
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function getAllRolesAdmin(): Promise<{ id: string; name: string; key: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('roles').select('id, name, label').order('name');
  if (error) throw error;
  return (data ?? []).map((r: { id: string; name: string; label: string | null }) => ({
    id: r.id,
    name: r.label || r.name,
    key: r.name,
  }));
}
