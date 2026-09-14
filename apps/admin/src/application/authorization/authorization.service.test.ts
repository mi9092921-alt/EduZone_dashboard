import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';

import {
  authorizeCaller,
  authorizeSuperAdmin,
  AuthorizationError,
} from './authorization.service';

function createMockSupabase(params: {
  user?: { id: string } | null;
  userError?: Error | null;
  profile?: {
    primary_role: string;
    tenant_id: string;
    acting_tenant_id?: string | null;
  } | null;
  /** Default result for any permission not listed in `rpcResults`. */
  rpcResult?: boolean;
  /** Per-permission override, keyed by the `p_permission` RPC arg. */
  rpcResults?: Record<string, boolean>;
  /** get_current_tenant_id() RPC result -- distinct from rpcResult/
   * rpcResults (both for user_has_permission), since the mock now needs
   * to differentiate by RPC name for the Tenant Switcher branch. */
  currentTenantIdRpcResult?: string | null;
}) {
  const rpc = vi.fn().mockImplementation((fnName: string, args?: { p_permission: string }) => {
    if (fnName === 'get_current_tenant_id') {
      return Promise.resolve({ data: params.currentTenantIdRpcResult ?? null, error: null });
    }
    const value = (args && params.rpcResults?.[args.p_permission]) ?? params.rpcResult ?? false;
    return Promise.resolve({ data: value, error: null });
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: params.user ?? null },
        error: params.userError ?? null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: params.profile ?? null,
        error: null,
      }),
    }),
    rpc,
  } as unknown as SupabaseClient & { rpc: typeof rpc };
}

describe('AuthorizationService', () => {
  it('throws UNAUTHORIZED when user is not logged in', async () => {
    const supabase = createMockSupabase({ user: null });

    await expect(authorizeCaller(supabase, 'users.read')).rejects.toThrowError(AuthorizationError);
    await expect(authorizeCaller(supabase, 'users.read')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('authorizes super_admin unconditionally with full wildcard permission, without consulting the DB', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'tenant-1' },
      rpcResult: false, // even if the DB would say no, super_admin never asks it
    });

    const ctx = await authorizeCaller(supabase, 'any.permission');
    expect(ctx.userId).toBe('super-user');
    expect(ctx.role).toBe('super_admin');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('confirms an admin permission via the database RPC — no fast-path bypass', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
      rpcResult: true,
    });

    const ctx = await authorizeCaller(supabase, 'courses.read');

    expect(ctx.userId).toBe('admin-user');
    expect(ctx.role).toBe('admin');
    // The DB was actually asked, scoped to the caller's own tenant — this
    // is the whole point of the fix: a role-level allow is no longer
    // enough on its own.
    expect(supabase.rpc).toHaveBeenCalledWith('user_has_permission', {
      p_user_id: 'admin-user',
      p_permission: 'courses.read',
      p_tenant_id: 'tenant-1',
    });
  });

  it('denies an admin when the static role allowlist would allow it but the DB says no (permission revoked)', async () => {
    // This is the core regression case for P1-SEC-005: `roleAllowsPermission`
    // treats 'admin' as allowed to do almost everything, but a specific
    // tenant may have revoked a permission (role_permissions edit, or an
    // expired/absent user_permission_cache grant). The database must be
    // able to override the role-level default in the deny direction.
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
      rpcResult: false,
    });

    await expect(authorizeCaller(supabase, 'users.write')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('grants a permission via the DB even when the static role allowlist would not include it', async () => {
    // The DB must also be able to override the role-level default in the
    // *allow* direction (a tenant-specific grant beyond the generic
    // allowlist) — proving the allowlist has no veto either way.
    const supabase = createMockSupabase({
      user: { id: 'teacher-user' },
      profile: { primary_role: 'teacher', tenant_id: 'tenant-1' },
      rpcResults: { 'tenants.manage': true },
    });

    const ctx = await authorizeCaller(supabase, 'tenants.manage');
    expect(ctx.userId).toBe('teacher-user');
  });

  it('rejects cross-tenant access when targetTenantId differs, without ever calling the DB', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
      rpcResult: true,
    });

    await expect(
      authorizeCaller(supabase, 'courses.read', { targetTenantId: 'tenant-2' }),
    ).rejects.toMatchObject({
      code: 'TENANT_MISMATCH',
      status: 403,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("scopes the DB permission check to the caller's own tenant_id (never a client-supplied one)", async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
      rpcResult: true,
    });

    await authorizeCaller(supabase, 'users.write');

    expect(supabase.rpc).toHaveBeenCalledWith(
      'user_has_permission',
      expect.objectContaining({ p_tenant_id: 'tenant-1' }),
    );
  });

  it('cannot privilege-escalate to a super_admin-only permission via role alone', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
      rpcResult: false,
    });

    await expect(authorizeCaller(supabase, 'tenants.manage')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('falls back to database RPC check for a permission with no role-level default', async () => {
    const supabase = createMockSupabase({
      user: { id: 'student-user' },
      profile: { primary_role: 'student', tenant_id: 'tenant-1' },
      rpcResult: true,
    });

    const ctx = await authorizeCaller(supabase, 'custom.permission');
    expect(ctx.userId).toBe('student-user');
  });

  it('throws FORBIDDEN if the RPC returns false', async () => {
    const supabase = createMockSupabase({
      user: { id: 'student-user' },
      profile: { primary_role: 'student', tenant_id: 'tenant-1' },
      rpcResult: false,
    });

    await expect(authorizeCaller(supabase, 'users.delete')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('fails closed (denies) when the RPC itself errors, rather than granting access', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'admin-user' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { primary_role: 'admin', tenant_id: 'tenant-1' },
          error: null,
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('rpc unavailable') }),
    } as unknown as SupabaseClient;

    await expect(authorizeCaller(supabase, 'users.write')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('authorizes super_admin specifically via authorizeSuperAdmin', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'global' },
    });

    const ctx = await authorizeSuperAdmin(supabase);
    expect(ctx.role).toBe('super_admin');
  });

  it('rejects non-super_admin in authorizeSuperAdmin', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
    });

    await expect(authorizeSuperAdmin(supabase)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  // ── Tenant Switcher (Wave 2) ──────────────────────────────────────
  it('resolves tenantId via get_current_tenant_id() RPC for a switched super_admin, and sets homeTenantId', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'tenant-home', acting_tenant_id: 'tenant-acting' },
      currentTenantIdRpcResult: 'tenant-acting',
    });

    const ctx = await authorizeCaller(supabase, 'any.permission');
    expect(ctx.tenantId).toBe('tenant-acting');
    expect(ctx.homeTenantId).toBe('tenant-home');
    expect(supabase.rpc).toHaveBeenCalledWith('get_current_tenant_id');
  });

  it('does NOT call get_current_tenant_id() RPC for a non-switched super_admin (zero extra cost in the common case)', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'tenant-home', acting_tenant_id: null },
    });

    const ctx = await authorizeCaller(supabase, 'any.permission');
    expect(ctx.tenantId).toBe('tenant-home');
    expect(ctx.homeTenantId).toBe('tenant-home');
    expect(supabase.rpc).not.toHaveBeenCalledWith('get_current_tenant_id', expect.anything());
  });

  it('falls back to the home tenant if get_current_tenant_id() RPC returns null (e.g. acting tenant went inactive)', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'tenant-home', acting_tenant_id: 'tenant-stale' },
      currentTenantIdRpcResult: null,
    });

    const ctx = await authorizeCaller(supabase, 'any.permission');
    expect(ctx.tenantId).toBe('tenant-home');
  });

  it('never sets homeTenantId for a non-super_admin caller', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
      // Post-P1-SEC-005: the DB is genuinely consulted now (no more
      // role-allowlist fast-path), so the permission check must be
      // told to succeed for this test to reach the assertion it cares
      // about (homeTenantId), rather than failing on the unrelated
      // permission check first.
      rpcResult: true,
    });

    const ctx = await authorizeCaller(supabase, 'courses.read');
    expect(ctx.homeTenantId).toBeUndefined();
  });

  it('authorizeSuperAdmin also resolves the switched tenant via requireSuperAdmin path', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'tenant-home', acting_tenant_id: 'tenant-acting' },
      currentTenantIdRpcResult: 'tenant-acting',
    });

    const ctx = await authorizeSuperAdmin(supabase);
    expect(ctx.tenantId).toBe('tenant-acting');
    expect(ctx.homeTenantId).toBe('tenant-home');
  });
});
