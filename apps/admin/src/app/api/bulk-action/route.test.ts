import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Authorization regression coverage for POST /api/bulk-action.
 *
 * This route runs every downstream query through the service_role client
 * (see route.ts), so its own permission + tenant checks are the ONLY gate —
 * there is no RLS backstop. These tests pin exactly the properties P1-SEC-005
 * requires:
 *   1. A role that would generically "allow" an action is not enough on its
 *      own — the database's `user_has_permission` decision is final.
 *   2. Cross-tenant access is impossible for non-super_admin callers, even
 *      though the route operates via the admin (service_role) client.
 *   3. `super_admin` is the only explicit bypass.
 */

const CALLER_TENANT = '11111111-1111-1111-1111-111111111111';
const ATTACKER_TENANT = '22222222-2222-2222-2222-222222222222';
const SUPER_ADMIN_TARGET_TENANT = '33333333-3333-3333-3333-333333333333';

interface AuthState {
  user: { id: string } | null;
  profile: { primary_role: string; tenant_id: string } | null;
  rpcResult: boolean | null;
}

const authState: AuthState = { user: null, profile: null, rpcResult: null };

function chainable(result: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'neq'];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  (builder as { then?: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const rpcSpy = vi.fn();
const adminUsersEqSpy = vi.fn();
const adminCountResult: { count: number; error: unknown } = { count: 0, error: null };

vi.mock('@/infrastructure/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authState.user },
        error: authState.user ? null : new Error('not authenticated'),
      }),
    },
    from: vi.fn(() =>
      chainable({
        data: authState.profile,
        error: authState.profile ? null : new Error('no profile'),
      }),
    ),
    rpc: rpcSpy,
  })),
}));

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => {
      const builder = chainable(adminCountResult);
      const originalEq = builder.eq as (...args: unknown[]) => unknown;
      builder.eq = vi.fn((...args: unknown[]) => {
        adminUsersEqSpy(...args);
        return originalEq(...args);
      });
      return builder;
    }),
  })),
}));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/bulk-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const lockRequestBody = {
  action: 'lock',
  filters: { tenant_id: ATTACKER_TENANT },
  dry_run: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 'caller-1' };
  authState.profile = { primary_role: 'admin', tenant_id: CALLER_TENANT };
  authState.rpcResult = false;
  adminCountResult.count = 0;
  adminCountResult.error = null;
  rpcSpy.mockImplementation(() => Promise.resolve({ data: authState.rpcResult, error: null }));
});

describe('POST /api/bulk-action — authorization', () => {
  it('denies an admin when the DB says the permission is not granted, even though the static role allowlist would have allowed it', async () => {
    // 'admin' + 'users.lock' is exactly the combination the old
    // roleAllowsPermission() fast-path would have approved without ever
    // asking the database. The DB must be the final word.
    authState.profile = { primary_role: 'admin', tenant_id: CALLER_TENANT };
    authState.rpcResult = false;

    const res = await POST(makeRequest(lockRequestBody));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe('FORBIDDEN');
    expect(json.message).toContain('users.lock');
    // The DB really was asked, scoped to the action's exact required
    // permission and the caller's own tenant.
    expect(rpcSpy).toHaveBeenCalledWith('user_has_permission', {
      p_user_id: 'caller-1',
      p_permission: 'users.lock',
      p_tenant_id: CALLER_TENANT,
    });
  });

  it('cannot privilege-escalate a denied action by any client-supplied field', async () => {
    authState.profile = { primary_role: 'admin', tenant_id: CALLER_TENANT };
    authState.rpcResult = false;

    const res = await POST(
      makeRequest({
        action: 'delete',
        filters: {
          tenant_id: CALLER_TENANT,
          user_ids: ['00000000-0000-0000-0000-000000000001'],
        },
        params: { reason: 'trying anyway' },
        dry_run: false,
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('FORBIDDEN');
  });

  it("allows the request through to the tenant-scoped query once the DB grants the permission, and never trusts a client-supplied tenant_id", async () => {
    authState.profile = { primary_role: 'admin', tenant_id: CALLER_TENANT };
    authState.rpcResult = true;
    adminCountResult.count = 5;

    const res = await POST(makeRequest(lockRequestBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ estimated_count: 5, dry_run: true });
    // filters.tenant_id was ATTACKER_TENANT -- the query must have been
    // scoped to the caller's own tenant instead.
    expect(adminUsersEqSpy).toHaveBeenCalledWith('tenant_id', CALLER_TENANT);
    expect(adminUsersEqSpy).not.toHaveBeenCalledWith('tenant_id', ATTACKER_TENANT);
  });

  it('bypasses the DB permission check only for super_admin, and lets super_admin cross tenants', async () => {
    authState.profile = { primary_role: 'super_admin', tenant_id: 'system-tenant' };
    authState.rpcResult = false; // even if the DB would deny, super_admin never asks
    adminCountResult.count = 3;

    const res = await POST(
      makeRequest({
        action: 'lock',
        filters: { tenant_id: SUPER_ADMIN_TARGET_TENANT },
        dry_run: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(rpcSpy).not.toHaveBeenCalled();
    // super_admin's own restrictTenantId is undefined -- the client-supplied
    // filters.tenant_id is honored precisely because the caller is the one
    // explicit exception, not because the tenant check was skipped.
    expect(adminUsersEqSpy).toHaveBeenCalledWith('tenant_id', SUPER_ADMIN_TARGET_TENANT);
  });

  it('denies a teacher attempting an action outside their allowed set, confirmed by the DB', async () => {
    authState.profile = { primary_role: 'teacher', tenant_id: CALLER_TENANT };
    authState.rpcResult = false;

    const res = await POST(
      makeRequest({
        action: 'reset_devices',
        filters: { tenant_id: CALLER_TENANT },
        dry_run: true,
      }),
    );

    expect(res.status).toBe(403);
    expect(rpcSpy).toHaveBeenCalledWith('user_has_permission', {
      p_user_id: 'caller-1',
      p_permission: 'users.write',
      p_tenant_id: CALLER_TENANT,
    });
  });

  it('rejects unauthenticated requests before any permission check', async () => {
    authState.user = null;

    const res = await POST(makeRequest(lockRequestBody));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
