import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  CreateTenantUseCase,
  DeleteTenantUseCase,
  SuspendTenantUseCase,
  UpdateTenantUseCase,
} from './manage-tenants.use-case';

import type { ITenantAdminRepository } from '@/application/ports/ITenantAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';
import type { CreateTenantInput } from '@/domain/types/tenant.types';


function makeRepo(overrides: Partial<ITenantAdminRepository> = {}): ITenantAdminRepository {
  return {
    slugExists: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue({ id: 'tenant-new', slug: 'new-school' }),
    update: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Updated' }),
    suspend: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    logSuspension: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ITenantAdminRepository;
}

const superCtx = createRequestContext({
  userId: 'super-1',
  tenantId: 'global',
  role: 'super_admin',
  permissions: ['*'],
});

const input: CreateTenantInput = { slug: 'new-school', name: 'New School' };

describe('CreateTenantUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies platform defaults server-side', async () => {
    const repo = makeRepo();

    await new CreateTenantUseCase(repo).execute(input);

    expect(repo.slugExists).toHaveBeenCalledWith('new-school');
    expect(repo.create).toHaveBeenCalledWith({
      slug: 'new-school',
      name: 'New School',
      plan: 'free',
      region_id: 'me-south-1',
      max_users: 1000,
      max_courses: 50,
      max_storage_bytes: 10_737_418_240,
      metadata: {},
    });
  });

  it('respects caller-provided overrides over the defaults', async () => {
    const repo = makeRepo();

    await new CreateTenantUseCase(repo).execute({
      ...input,
      plan: 'pro',
      max_users: 5000,
      metadata: { tier: 'gold' },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'pro', max_users: 5000, metadata: { tier: 'gold' } }),
    );
  });

  it('throws a ConflictError with the stable SLUG_TAKEN signal before any insert', async () => {
    const repo = makeRepo({ slugExists: vi.fn().mockResolvedValue(true) });

    await expect(new CreateTenantUseCase(repo).execute(input)).rejects.toThrow(
      'A tenant with this slug already exists',
    );
    await expect(new CreateTenantUseCase(repo).execute(input)).rejects.toMatchObject({
      code: 'DUPLICATE',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('M16 (F16-3): maps a slug race (insert fails, re-check finds the slug) to SLUG_TAKEN', async () => {
    const slugExists = vi
      .fn()
      .mockResolvedValueOnce(false) // pre-check passes...
      .mockResolvedValue(true); // ...concurrent create wins before the insert
    const repo = makeRepo({
      slugExists,
      create: vi.fn().mockRejectedValue({ code: '23505', message: 'duplicate key' }),
    });

    await expect(new CreateTenantUseCase(repo).execute(input)).rejects.toMatchObject({
      code: 'DUPLICATE',
    });
    expect(slugExists).toHaveBeenCalledTimes(2);
    // The message is the stable, user-facing conflict text — never raw DB text.
    await expect(new CreateTenantUseCase(repo).execute(input)).rejects.toThrow(
      'A tenant with this slug already exists',
    );
  });

  it('M16 (F16-3): rethrows unrelated create failures untouched', async () => {
    const repo = makeRepo({
      create: vi.fn().mockRejectedValue(new Error('db offline')),
    });

    await expect(new CreateTenantUseCase(repo).execute(input)).rejects.toThrow('db offline');
  });
});

describe('UpdateTenantUseCase', () => {
  it('delegates the update', async () => {
    const repo = makeRepo();

    await new UpdateTenantUseCase(repo).execute('tenant-1', { name: 'Updated' });

    expect(repo.update).toHaveBeenCalledWith('tenant-1', { name: 'Updated' });
  });
});

describe('SuspendTenantUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suspends and writes the audit entry', async () => {
    const repo = makeRepo();

    await new SuspendTenantUseCase(repo).execute(superCtx, 'tenant-1', 'policy violation');

    expect(repo.suspend).toHaveBeenCalledWith('tenant-1', 'policy violation', expect.any(String));
    expect(repo.logSuspension).toHaveBeenCalledWith({
      userId: 'super-1',
      tenantId: 'tenant-1',
      reason: 'policy violation',
    });
  });

  it('does not fail the suspension when the audit write fails', async () => {
    const repo = makeRepo({
      logSuspension: vi.fn().mockRejectedValue(new Error('audit table locked')),
    });

    await expect(
      new SuspendTenantUseCase(repo).execute(superCtx, 'tenant-1', 'reason'),
    ).resolves.toBeUndefined();
    expect(repo.suspend).toHaveBeenCalled();
  });
});

describe('DeleteTenantUseCase', () => {
  it('soft-deletes the tenant', async () => {
    const repo = makeRepo();

    await new DeleteTenantUseCase(repo).execute('tenant-1');

    expect(repo.softDelete).toHaveBeenCalledWith('tenant-1');
  });
});
