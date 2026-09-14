import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * tenants.actions.ts — switchTenantAction (Tenant Switcher, Wave 4).
 *
 * Same mocking convention as admin.actions.tenant-scoping.test.ts: mock
 * the boundary module to control ctx, mock the repository the use case
 * depends on, then assert the action wires the two together correctly --
 * in particular that the super_admin gate (requireSuperAdmin) is what
 * stands between an unauthenticated/non-super_admin caller and the
 * underlying switch, at the Next.js layer (the switch_tenant_context RPC
 * itself independently re-validates server-side too, per Wave 1 --
 * this file only covers the Next.js-side boundary).
 */

const mockRequireSuperAdmin = vi.fn();
vi.mock('@/adapters/actions/boundary', () => ({
  requireSuperAdmin: (...args: unknown[]) => mockRequireSuperAdmin(...args),
}));

const mockSwitchContext = vi.fn();
vi.mock('@/infrastructure/repos/tenant-context.repository', () => ({
  makeTenantContextRepository: () => ({ switchContext: (...args: unknown[]) => mockSwitchContext(...args) }),
}));

// Unrelated exports from the same file -- stubbed so the module resolves
// cleanly without pulling in the admin/service-role client chain.
vi.mock('@/application/use-cases/tenants/manage-tenants.use-case', () => ({
  CreateTenantUseCase: vi.fn(),
  UpdateTenantUseCase: vi.fn(),
  SuspendTenantUseCase: vi.fn(),
  DeleteTenantUseCase: vi.fn(),
}));
vi.mock('@/infrastructure/repos/tenant-admin.repository', () => ({
  makeTenantAdminRepository: vi.fn(),
}));
vi.mock('@/infrastructure/observability/audit-logger.service', () => ({
  makeAuditLogger: vi.fn(() => ({ record: vi.fn() })),
}));

import { switchTenantAction } from './tenants.actions';

function superAdminCtx(overrides: Partial<{ tenantId: string; homeTenantId: string }> = {}) {
  return {
    userId: 'super-1',
    tenantId: overrides.tenantId ?? 'tenant-home',
    homeTenantId: overrides.homeTenantId ?? 'tenant-home',
    role: 'super_admin',
    permissions: ['*'],
  };
}

describe('switchTenantAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSwitchContext.mockResolvedValue({ tenantId: 'tenant-2', tenantName: 'Tenant Two' });
  });

  it('gates on requireSuperAdmin before touching the repository', async () => {
    mockRequireSuperAdmin.mockResolvedValue(superAdminCtx());

    await switchTenantAction('tenant-2');

    expect(mockRequireSuperAdmin).toHaveBeenCalledTimes(1);
    expect(mockSwitchContext).toHaveBeenCalledWith('tenant-2');
  });

  it('propagates the requireSuperAdmin rejection for a non-super_admin caller, never touching the repository', async () => {
    mockRequireSuperAdmin.mockRejectedValue(
      Object.assign(new Error('Super admin access required'), { code: 'FORBIDDEN', status: 403 }),
    );

    await expect(switchTenantAction('tenant-2')).rejects.toThrow('Super admin access required');
    expect(mockSwitchContext).not.toHaveBeenCalled();
  });

  it('passes null through unchanged (exit back to home tenant)', async () => {
    mockRequireSuperAdmin.mockResolvedValue(superAdminCtx({ tenantId: 'tenant-2' }));
    mockSwitchContext.mockResolvedValue({ tenantId: 'tenant-home', tenantName: 'Home Tenant' });

    const result = await switchTenantAction(null);

    expect(mockSwitchContext).toHaveBeenCalledWith(null);
    expect(result).toEqual({ tenantId: 'tenant-home', tenantName: 'Home Tenant' });
  });

  it('returns the repository result unchanged', async () => {
    mockRequireSuperAdmin.mockResolvedValue(superAdminCtx());

    const result = await switchTenantAction('tenant-2');

    expect(result).toEqual({ tenantId: 'tenant-2', tenantName: 'Tenant Two' });
  });

  it('propagates a repository/RPC error (e.g. a tenant that went inactive) unchanged', async () => {
    mockRequireSuperAdmin.mockResolvedValue(superAdminCtx());
    mockSwitchContext.mockRejectedValue(new Error('TENANT_NOT_FOUND_OR_INACTIVE'));

    await expect(switchTenantAction('bad-tenant')).rejects.toThrow('TENANT_NOT_FOUND_OR_INACTIVE');
  });
});
