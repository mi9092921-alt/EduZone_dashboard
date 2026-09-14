import { describe, it, expect, vi } from 'vitest';

import { SwitchTenantContextUseCase } from './switch-tenant-context.use-case';

import type { ITenantContextRepository } from '@/application/ports/ITenantContextRepository';
import { createRequestContext } from '@/domain/types/context.types';

function makeRepo(overrides: Partial<ITenantContextRepository> = {}): ITenantContextRepository {
  return {
    switchContext: vi.fn().mockResolvedValue({ tenantId: 'tenant-2', tenantName: 'Tenant Two' }),
    ...overrides,
  };
}

const superCtx = createRequestContext({
  userId: 'super-1',
  tenantId: 'tenant-1',
  homeTenantId: 'tenant-1',
  role: 'super_admin',
  permissions: ['*'],
  requestId: 'req_test_switch',
});

describe('SwitchTenantContextUseCase', () => {
  it('delegates to the repository with the given tenantId and returns its result', async () => {
    const repo = makeRepo();
    const useCase = new SwitchTenantContextUseCase(repo);

    const result = await useCase.execute(superCtx, 'tenant-2');

    expect(repo.switchContext).toHaveBeenCalledWith('tenant-2');
    expect(result).toEqual({ tenantId: 'tenant-2', tenantName: 'Tenant Two' });
  });

  it('passes null through unchanged (exit back to home tenant)', async () => {
    const repo = makeRepo({
      switchContext: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', tenantName: 'Home Tenant' }),
    });
    const useCase = new SwitchTenantContextUseCase(repo);

    const result = await useCase.execute(superCtx, null);

    expect(repo.switchContext).toHaveBeenCalledWith(null);
    expect(result).toEqual({ tenantId: 'tenant-1', tenantName: 'Home Tenant' });
  });

  it('propagates repository errors (e.g. TENANT_NOT_FOUND_OR_INACTIVE) unchanged', async () => {
    const repo = makeRepo({
      switchContext: vi.fn().mockRejectedValue(new Error('TENANT_NOT_FOUND_OR_INACTIVE')),
    });
    const useCase = new SwitchTenantContextUseCase(repo);

    await expect(useCase.execute(superCtx, 'bad-tenant')).rejects.toThrow(
      'TENANT_NOT_FOUND_OR_INACTIVE',
    );
  });
});
