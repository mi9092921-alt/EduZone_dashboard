import { container } from '@/container';
import type {
  User,
  UserFilters,
  PaginatedResult,
  AccountAction,
  ControlResult,
  Device,
  Session,
  Warning,
  PermissionCacheEntry,
  UserRoleAssignment,
  UserStats,
} from '@/domain/types/user.types';

/**
 * Users service — all Supabase queries for the users domain.
 * No UI, no React — pure async functions.
 */

// ── List users (paginated + filtered) ────────────────────────────
export async function getUsers(
  filters: UserFilters,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<User>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('users')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.search) {
    query = query.or(
      `email.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`,
    );
  }
  if (filters.primary_role) query = query.eq('primary_role', filters.primary_role);
  if (filters.account_status) query = query.eq('account_status', filters.account_status);
  if (filters.tenant_id) query = query.eq('tenant_id', filters.tenant_id);
  if (filters.region_id) query = query.eq('region_id', filters.region_id);
  if (filters.warning_count_gte != null)
    query = query.gte('warning_count', filters.warning_count_gte);
  if (filters.last_login_from) query = query.gte('last_login', filters.last_login_from);
  if (filters.last_login_to) query = query.lte('last_login', filters.last_login_to);

  const { data, error, count } = await query;
  if (error) throw error;

  const total = count ?? 0;
  return {
    data: (data ?? []) as User[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── Single user ──────────────────────────────────────────────────
export async function getUserById(id: string): Promise<User> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw error;
  return data as User;
}

/**
 * Control account (lock/unlock/suspend/ban) via secure RPC.
 * This ensures atomic updates, audit logging, and permission enforcement.
 * v13: RPC now returns jsonb { status, until } instead of void.
 */
export async function controlUserAccount(
  id: string,
  action: AccountAction,
  reason?: string,
  suspendHours?: number,
): Promise<ControlResult> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('control_user_account', {
    p_user_id: id,
    p_action: action,
    p_reason: reason || null,
    p_suspend_hours: suspendHours || null,
  });

  if (error) {
    console.error(`Failed to execute ${action} on user ${id}:`, error);
    throw error;
  }

  // v13: Parse jsonb response { status: string, until: string | null }
  const result = data as { status?: string; until?: string } | null;
  return {
    success: true,
    message: result?.status ? `Account status changed to: ${result.status}` : undefined,
    auto_suspended: action === 'suspend' && !!result?.until,
  };
}

// ── Terminate sessions ───────────────────────────────────────────
export async function terminateUserSessions(userId: string, reason?: string): Promise<number> {
  const { supabase } = container;
  const { data, error } = await supabase.rpc('terminate_user_sessions', {
    p_user_id: userId,
    p_reason: reason || 'admin_terminated',
  });

  if (error) throw error;
  return (data as number | null) ?? 0;
}

// ── Reset devices ────────────────────────────────────────────────
export async function resetUserDevices(userId: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('reset_user_device', {
    p_user_id: userId,
  });

  if (error) throw error;
}

// ── Issue warning ────────────────────────────────────────────────
export async function issueWarning(
  userId: string,
  reason: string,
  severity: 1 | 2 | 3,
  action: string = 'none',
): Promise<string> {
  const { issueWarningAction } = await import('@/adapters/actions/user.actions');
  const result = await issueWarningAction(userId, reason, severity, action);
  if (!result.success) throw new Error(result.error);
  return result.warningId ?? '';
}

// ── Bind device ──────────────────────────────────────────────────
export async function bindDevice(
  deviceId: string,
  deviceInfo: Record<string, unknown>,
  platform?: 'android' | 'ios' | 'web' | string | null,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = container;
  const normalizedPlatform =
    platform === 'android' || platform === 'ios' || platform === 'web' ? platform : null;

  const { error } = await supabase.rpc('bind_device_for_current_user', {
    p_device_id: deviceId,
    p_device_info: deviceInfo,
    p_platform: normalizedPlatform,
  });

  if (error) {
    if (error.code === 'RATE_LIMITED' || error.message.includes('RATE_LIMITED')) {
      return { success: false, error: 'RATE_LIMITED' };
    }
    throw error;
  }
  return { success: true };
}

// ── Get devices ──────────────────────────────────────────────────
export async function getDevices(userId: string): Promise<Device[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('last_seen', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Device[];
}

// ── Get sessions ─────────────────────────────────────────────────
export async function getSessions(userId: string): Promise<Session[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as Session[];
}

// ── Get warnings ─────────────────────────────────────────────────
export async function getWarnings(userId: string): Promise<Warning[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('warnings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as Warning[];
}

// ── Get effective permissions ────────────────────────────────────
export async function getEffectivePermissions(userId: string): Promise<PermissionCacheEntry[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('user_permission_cache')
    .select('*')
    .eq('user_id', userId)
    .order('permission_name');

  if (error) throw error;
  return (data ?? []) as PermissionCacheEntry[];
}

// ── Get user roles ───────────────────────────────────────────────
export async function getUserRoles(userId: string): Promise<UserRoleAssignment[]> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('user_roles')
    .select('*, roles(name, label)')
    .eq('user_id', userId)
    .order('granted_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    // Spread all base row fields (user_id, role_id, granted_at, etc.)
    ...(row as Record<string, unknown>),
    // Flatten the joined roles relation into flat fields
    role_name: (row.roles as Record<string, string> | null)?.name,
    role_label: (row.roles as Record<string, string> | null)?.label,
  })) as UserRoleAssignment[];
}

// ── User stats (from RPC get_user_stats_summary) ──────────────────
function emptyUserStats(): UserStats {
  return {
    total_users: 0,
    active_users: 0,
    locked_users: 0,
    suspended_users: 0,
    banned_users: 0,
    student_count: 0,
    teacher_count: 0,
    admin_count: 0,
    dau: 0,
    wau: 0,
    mau: 0,
    last_updated: new Date().toISOString(),
  } as UserStats;
}

export async function getUserStats(tenantId?: string): Promise<UserStats | null> {
  const { supabase } = container;

  // v13: Use RPC for atomic and efficient aggregation
  const { data, error } = await supabase.rpc('get_user_stats_summary', {
    p_tenant_id: tenantId,
  });

  if (!error && data) {
    return data as UserStats;
  }

  let query = supabase
    .from('users')
    .select('account_status, primary_role, last_login')
    .is('deleted_at', null);

  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data: users, error: fallbackError } = await query;
  if (fallbackError) {
    return emptyUserStats();
  }

  const now = Date.now();
  const isAfter = (value: unknown, ms: number) =>
    typeof value === 'string' && new Date(value).getTime() > now - ms;

  return {
    total_users: users?.length ?? 0,
    active_users: users?.filter((u) => u.account_status === 'active').length ?? 0,
    locked_users: users?.filter((u) => u.account_status === 'locked').length ?? 0,
    suspended_users: users?.filter((u) => u.account_status === 'suspended').length ?? 0,
    banned_users: users?.filter((u) => u.account_status === 'banned').length ?? 0,
    student_count: users?.filter((u) => u.primary_role === 'student').length ?? 0,
    teacher_count: users?.filter((u) => u.primary_role === 'teacher').length ?? 0,
    admin_count: users?.filter((u) => u.primary_role === 'admin').length ?? 0,
    dau: users?.filter((u) => isAfter(u.last_login, 24 * 60 * 60 * 1000)).length ?? 0,
    wau: users?.filter((u) => isAfter(u.last_login, 7 * 24 * 60 * 60 * 1000)).length ?? 0,
    mau: users?.filter((u) => isAfter(u.last_login, 30 * 24 * 60 * 60 * 1000)).length ?? 0,
    last_updated: new Date().toISOString(),
  } as UserStats;
}

// ── Get all unique permissions ──────────────────────────────────
export async function getAllPermissions(): Promise<string[]> {
  const { supabase } = container;
  const { data, error } = await supabase.from('permissions').select('name').order('name');

  if (error) throw error;
  return (data ?? []).map((p) => p.name);
}

// ── Search users for targeting ───────────────────────────────────
export interface UserSearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  primary_role: string;
  avatar_url: string | null;
  last_login: string | null;
}

export async function searchUsers(
  query: string,
  limit = 20,
  tenantId?: string,
  role?: string,
): Promise<UserSearchResult[]> {
  const { supabase } = container;

  let q = supabase
    .from('users')
    .select('id, first_name, last_name, email, primary_role, avatar_url, last_login')
    .is('deleted_at', null);

  // Filter by role if provided
  if (role) {
    q = q.eq('primary_role', role);
  }

  // If query provided, apply search filters
  if (query.trim()) {
    q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`);
  }

  // Filter by tenant if provided
  if (tenantId) {
    q = q.eq('tenant_id', tenantId);
  }

  // Sort by most recent activity/creation
  q = q
    .order('last_login', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const { data, error } = await q.limit(limit);

  if (error) throw error;
  return data ?? [];
}
