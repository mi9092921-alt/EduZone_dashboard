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
  profile?: { primary_role: string; tenant_id: string } | null;
  rpcResult?: boolean;
}) {
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
    rpc: vi.fn().mockResolvedValue({
      data: params.rpcResult ?? false,
      error: null,
    }),
  } as unknown as SupabaseClient;
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

  it('authorizes super_admin unconditionally with full wildcard permission', async () => {
    const supabase = createMockSupabase({
      user: { id: 'super-user' },
      profile: { primary_role: 'super_admin', tenant_id: 'tenant-1' },
    });

    const ctx = await authorizeCaller(supabase, 'any.permission');
    expect(ctx.userId).toBe('super-user');
    expect(ctx.role).toBe('super_admin');
    expect(ctx.tenantId).toBe('tenant-1');
  });

  it('authorizes admin via policy fast-path', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
    });

    const ctx = await authorizeCaller(supabase, 'courses.read');
    expect(ctx.userId).toBe('admin-user');
    expect(ctx.role).toBe('admin');
  });

  it('rejects cross-tenant access when targetTenantId differs', async () => {
    const supabase = createMockSupabase({
      user: { id: 'admin-user' },
      profile: { primary_role: 'admin', tenant_id: 'tenant-1' },
    });

    await expect(
      authorizeCaller(supabase, 'courses.read', { targetTenantId: 'tenant-2' }),
    ).rejects.toMatchObject({
      code: 'TENANT_MISMATCH',
      status: 403,
    });
  });

  it('falls back to database RPC check if not in fast-path', async () => {
    const supabase = createMockSupabase({
      user: { id: 'student-user' },
      profile: { primary_role: 'student', tenant_id: 'tenant-1' },
      rpcResult: true,
    });

    const ctx = await authorizeCaller(supabase, 'custom.permission');
    expect(ctx.userId).toBe('student-user');
  });

  it('throws FORBIDDEN if RPC returns false and policy does not allow', async () => {
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
});
