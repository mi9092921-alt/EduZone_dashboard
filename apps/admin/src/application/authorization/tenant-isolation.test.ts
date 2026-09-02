import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';

import {
  authorizeCaller,
  authorizeSuperAdmin,
  AuthorizationError,
} from './authorization.service';

function createMockSupabaseForTenant(params: {
  userId: string;
  role: string;
  tenantId: string;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: params.userId } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          primary_role: params.role,
          tenant_id: params.tenantId,
        },
        error: null,
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  } as unknown as SupabaseClient;
}

describe('P0 Tenant Isolation Security Matrix', () => {
  const TENANT_A = 'tenant-alpha-uuid';
  const TENANT_B = 'tenant-beta-uuid';

  it('enforces that Tenant A user cannot access resources under Tenant B', async () => {
    const userClientA = createMockSupabaseForTenant({
      userId: 'user-a-1',
      role: 'admin',
      tenantId: TENANT_A,
    });

    await expect(
      authorizeCaller(userClientA, 'courses.read', { targetTenantId: TENANT_B }),
    ).rejects.toMatchObject({
      code: 'TENANT_MISMATCH',
      status: 403,
    });
  });

  it('allows Tenant A user to access resources matching their own tenantId', async () => {
    const userClientA = createMockSupabaseForTenant({
      userId: 'user-a-1',
      role: 'admin',
      tenantId: TENANT_A,
    });

    const ctx = await authorizeCaller(userClientA, 'courses.read', {
      targetTenantId: TENANT_A,
    });

    expect(ctx.userId).toBe('user-a-1');
    expect(ctx.tenantId).toBe(TENANT_A);
  });

  it('prevents teachers in Tenant A from operating across tenants', async () => {
    const teacherClientA = createMockSupabaseForTenant({
      userId: 'teacher-a-1',
      role: 'teacher',
      tenantId: TENANT_A,
    });

    await expect(
      authorizeCaller(teacherClientA, 'courses.write', { targetTenantId: TENANT_B }),
    ).rejects.toMatchObject({
      code: 'TENANT_MISMATCH',
      status: 403,
    });
  });

  it('permits super_admin to execute cross-tenant actions safely', async () => {
    const superAdminClient = createMockSupabaseForTenant({
      userId: 'super-root',
      role: 'super_admin',
      tenantId: 'global-tenant',
    });

    const ctx = await authorizeCaller(superAdminClient, 'courses.read', {
      targetTenantId: TENANT_B,
    });

    expect(ctx.userId).toBe('super-root');
    expect(ctx.role).toBe('super_admin');
  });

  it('blocks regular admin from invoking super-admin only tenant management', async () => {
    const adminClientA = createMockSupabaseForTenant({
      userId: 'admin-a-1',
      role: 'admin',
      tenantId: TENANT_A,
    });

    await expect(authorizeSuperAdmin(adminClientA)).rejects.toThrowError(AuthorizationError);
  });
});
