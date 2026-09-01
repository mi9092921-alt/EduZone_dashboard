'use server';

import { createClient } from '@supabase/supabase-js';

import type { Tenant, CreateTenantInput, UpdateTenantInput } from '@/domain/types/tenant.types';
import { createServerClient } from '@/infrastructure/supabase/server';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('primary_role, tenant_id')
    .eq('id', userData.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (profile?.primary_role !== 'super_admin') {
    throw new Error('Permission Denied: tenants management requires super_admin role');
  }

  return { userId: userData.user.id };
}

// ── Create tenant (admin client bypasses RLS) ───────────────────
export async function createTenantAction(input: CreateTenantInput): Promise<Tenant> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  // Pre-check slug uniqueness
  const { count } = await admin
    .from('tenants')
    .select('id', { count: 'exact', head: true })
    .eq('slug', input.slug)
    .is('deleted_at', null);

  if ((count ?? 0) > 0) {
    throw new Error('SLUG_TAKEN: A tenant with this slug already exists');
  }

  const { data, error } = await admin
    .from('tenants')
    .insert({
      slug: input.slug,
      name: input.name,
      plan: input.plan ?? 'free',
      region_id: input.region_id ?? 'me-south-1',
      max_users: input.max_users ?? 1000,
      max_courses: input.max_courses ?? 50,
      max_storage_bytes: input.max_storage_bytes ?? 10_737_418_240,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return data as Tenant;
}

// ── Update tenant (admin client bypasses RLS) ───────────────────
export async function updateTenantAction(id: string, input: UpdateTenantInput): Promise<Tenant> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('tenants')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Tenant;
}

// ── Suspend tenant (admin client bypasses RLS) ──────────────────
export async function suspendTenantAction(id: string, reason: string): Promise<void> {
  const { userId } = await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('tenants')
    .update({
      status: 'suspended',
      metadata: { suspended_reason: reason, suspended_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;

  // Log the suspension via activity_logs if available
  try {
    await admin.from('activity_logs').insert({
      user_id: userId,
      tenant_id: id,
      activity_type: 'tenant_suspended',
      details: { reason },
      risk_level: 'high',
    });
  } catch {
    // Non-fatal: continue even if audit log fails
  }
}

// ── Soft delete tenant (admin client bypasses RLS) ──────────────
export async function deleteTenantAction(id: string): Promise<void> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('tenants')
    .update({
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}
