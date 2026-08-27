'use server';

import { createClient } from '@supabase/supabase-js';
import { CreateUserInput, createUserSchema } from '@/domain/schemas/user.schema';
import { createServerClient } from '@/infrastructure/supabase/server';
import type { AccountAction } from '@/domain/types/user.types';

// ── Helper: build a service-role admin client ────────────────────────────────
function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase environment variables missing');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Helper: verify caller authentication and a required permission ────────────
async function verifyCallerPermission(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  permission: string | string[],
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { user: null, error: 'Unauthorized' as const };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('primary_role, tenant_id')
    .eq('id', userData.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (profile?.primary_role === 'super_admin') {
    return { user: userData.user, error: null };
  }

  const permissions = Array.isArray(permission) ? permission : [permission];
  if (roleAllowsPermissions(profile?.primary_role as string | undefined, permissions)) {
    return { user: userData.user, error: null };
  }

  let hasPerm = false;

  for (const p of permissions) {
    const { data } = await supabase.rpc('user_has_permission', {
      p_user_id: userData.user.id,
      p_permission: p,
      p_tenant_id: profile?.tenant_id ?? null,
    });

    if (data) {
      hasPerm = true;
      break;
    }
  }

  if (!hasPerm) {
    return { user: null, error: `Permission Denied: user lacks ${permissions.join(' or ')}` as const };
  }

  return { user: userData.user, error: null };
}

function roleAllowsPermissions(role: string | undefined, permissions: string[]) {
  if (role === 'admin') {
    return permissions.some((permission) => permission !== 'tenants.manage');
  }

  if (role === 'teacher') {
    const allowed = new Set([
      'courses.read',
      'courses.write',
      'courses.manage',
      'users.read',
      'warnings.write',
      'reports.read',
      'notifications.send',
      'notifications.delete',
    ]);
    return permissions.some((permission) => allowed.has(permission));
  }

  if (role === 'student') {
    return permissions.some((permission) => permission === 'courses.read' || permission === 'reports.read');
  }

  return false;
}

/**
 * Creates a new user via Supabase Admin API natively.
 * Uses service role key for privileged operations.
 */
export async function createUserAction(data: CreateUserInput) {
  try {
    // 1. Validate input
    const parsed = createUserSchema.parse(data);

    const supabase = await createServerClient();

    // 2. Verify caller auth and permission
    const { user, error: authError } = await verifyCallerPermission(supabase, 'users.write');
    if (authError || !user) {
      return { success: false, error: authError ?? 'Unauthorized' };
    }

    // 3. Fetch admin's tenant_id from the base table.
    const { data: adminProfile, error: profileError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .single();

    if (profileError || !adminProfile) {
      return { success: false, error: 'Could not determine admin tenant ID' };
    }

    // 4. Perform admin operations using service_role client
    const supabaseAdmin = createAdminClient();

    const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password || 'Temp1234!',
      email_confirm: true,
      user_metadata: {
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        phone: parsed.phone,
      },
    });

    if (authCreateError) {
      return { success: false, error: authCreateError.message };
    }

    if (!authData?.user) {
      return { success: false, error: 'User creation failed silently' };
    }

    // 5. Sync profile in the main DB via upsert (admin client bypasses RLS)
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: authData.user.id,
        email: parsed.email,
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        phone: parsed.phone,
        primary_role: parsed.primary_role,
        tenant_id: adminProfile.tenant_id,
      });

    if (updateError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return {
        success: false,
        error: 'User created but profile sync failed: ' + updateError.message,
      };
    }

    const { data: role, error: roleLookupError } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('name', parsed.primary_role)
      .maybeSingle();

    if (roleLookupError || !role?.id) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return {
        success: false,
        error: `User created but role sync failed: role ${parsed.primary_role} was not found`,
      };
    }

    const { error: roleSyncError } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        {
          user_id: authData.user.id,
          role_id: role.id,
          tenant_id: adminProfile.tenant_id,
          granted_by: user.id,
          is_active: true,
        },
        { onConflict: 'user_id,role_id,tenant_id' },
      );

    if (roleSyncError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return {
        success: false,
        error: 'User created but role sync failed: ' + roleSyncError.message,
      };
    }

    return { success: true, userId: authData.user.id };
  } catch (error: any) {
    console.error('createUserAction error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deletes a user permanently via Supabase Admin API.
 * Falls back to soft-delete if auth deletion fails.
 */
export async function deleteUserAction(userId: string) {
  try {
    const supabase = await createServerClient();

    // Verify caller auth and permission
    const { user, error: authError } = await verifyCallerPermission(supabase, 'users.write');
    if (authError || !user) {
      return { success: false, error: authError ?? 'Unauthorized' };
    }

    // Connect with Admin privileges
    const supabaseAdmin = createAdminClient();

    // Delete auth user (cascades to public.users if configured)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    // Fallback soft delete to hide from active views
    await supabaseAdmin
      .from('users')
      .update({ deleted_at: new Date().toISOString(), account_status: 'banned' })
      .eq('id', userId);

    if (deleteError) {
      // If user wasn't in auth for some reason, we soft deleted them in public anyway.
      if (!deleteError.message.includes('not found')) {
        return { success: false, error: deleteError.message };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('deleteUserAction error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Control a user account (lock/unlock/suspend/ban) via the v13 RPC.
 *
 * v13: `control_user_account` has PUBLIC EXECUTE revoked; requires service_role.
 * Callers must be authenticated and hold the `users.lock` permission.
 */
export async function controlUserAccountAction(
  userId: string,
  action: AccountAction,
  reason?: string,
  suspendHours?: number,
): Promise<{ success: boolean; accountStatus?: string; until?: string; error?: string }> {
  try {
    const supabase = await createServerClient();
    const { user, error: authError } = await verifyCallerPermission(supabase, 'users.lock');
    if (authError || !user) {
      return { success: false, error: authError ?? 'Unauthorized' };
    }

    // Use service_role client — v13 RPC requires it
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.rpc('control_user_account', {
      p_user_id: userId,
      p_action: action,
      p_reason: reason ?? null,
      p_suspend_hours: suspendHours ?? null,
    });

    if (error) {
      console.error(`[controlUserAccountAction] ${action} on ${userId} failed:`, error);
      return { success: false, error: error.message };
    }

    const result = data as { status?: string; until?: string } | null;
    return {
      success: true,
      ...(result?.status !== undefined && { accountStatus: result.status }),
      ...(result?.until !== undefined && { until: result.until }),
    };
  } catch (error: any) {
    console.error('controlUserAccountAction error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Terminate all active sessions for a user via the v13 RPC.
 *
 * v13: `terminate_user_sessions` has PUBLIC EXECUTE revoked; requires service_role.
 * Callers must be authenticated and hold the `sessions.manage` permission.
 */
export async function terminateUserSessionsAction(
  userId: string,
  reason?: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const supabase = await createServerClient();
    const { user, error: authError } = await verifyCallerPermission(supabase, ['sessions.manage', 'users.write']);
    if (authError || !user) {
      return { success: false, error: authError ?? 'Unauthorized' };
    }

    // Use service_role client — v13 RPC requires it
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.rpc('terminate_user_sessions', {
      p_user_id: userId,
      p_reason: reason ?? 'admin_terminated',
    });

    if (error) {
      console.error(
        `[terminateUserSessionsAction] terminate sessions for ${userId} failed:`,
        error,
      );
      return { success: false, error: error.message };
    }

    return { success: true, count: (data as number | null) ?? 0 };
  } catch (error: any) {
    console.error('terminateUserSessionsAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function issueWarningAction(
  userId: string,
  reason: string,
  severity: 1 | 2 | 3,
  action: string = 'none',
): Promise<{ success: boolean; warningId?: string; error?: string }> {
  try {
    const supabase = await createServerClient();
    const { user, error: authError } = await verifyCallerPermission(supabase, 'warnings.write');
    if (authError || !user) {
      return { success: false, error: authError ?? 'Unauthorized' };
    }

    const { data, error } = await supabase.rpc('issue_warning', {
      p_user_id: userId,
      p_reason: reason,
      p_severity: severity,
      p_note: action && action !== 'none' ? action : null,
    });

    if (error) {
      console.error(`[issueWarningAction] warning for ${userId} failed:`, error);
      return { success: false, error: error.message };
    }

    return { success: true, warningId: data as string };
  } catch (error: any) {
    console.error('issueWarningAction error:', error);
    return { success: false, error: error.message };
  }
}
