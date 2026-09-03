import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SendNotificationUseCase } from './send-notification.use-case';

import type {
  INotificationAdminRepository,
  ResolveNotificationTargetsInput,
} from '@/application/ports/INotificationAdminRepository';
import { createRequestContext } from '@/domain/types/context.types';
import type { SendNotificationInput } from '@/domain/types/notification.types';


function makeRepo(overrides: Partial<INotificationAdminRepository> = {}): INotificationAdminRepository {
  return {
    resolveTargetUserIds: vi.fn().mockResolvedValue([]),
    insertNotification: vi.fn().mockResolvedValue('notif-1'),
    attachNotificationTargets: vi.fn().mockResolvedValue(undefined),
    fanoutToUsers: vi.fn().mockResolvedValue(undefined),
    triggerInstantPush: vi.fn().mockResolvedValue(undefined),
    listForAdmin: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(undefined),
    listMine: vi.fn().mockResolvedValue([]),
    countMine: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as INotificationAdminRepository;
}

const ctx = createRequestContext({
  userId: 'admin-1',
  tenantId: 'tenant-1',
  role: 'admin',
  permissions: ['notifications.send'],
});

describe('SendNotificationUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input: SendNotificationInput = { title: 'Hello', body: 'World' };

  it('throws when the caller has no tenant context', async () => {
    const repo = makeRepo();
    const useCase = new SendNotificationUseCase(repo);
    const noTenantCtx = createRequestContext({
      userId: 'admin-1',
      tenantId: '',
      role: 'admin',
      permissions: ['notifications.send'],
    });

    await expect(useCase.execute(noTenantCtx, input)).rejects.toThrow('Tenant context is missing');
    expect(repo.insertNotification).not.toHaveBeenCalled();
  });

  it('inserts without fanout when no recipients resolve', async () => {
    const repo = makeRepo();
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await new SendNotificationUseCase(repo).execute(ctx, input);

    expect(result).toBe('notif-1');
    expect(repo.resolveTargetUserIds).toHaveBeenCalledWith(input, 'tenant-1');
    expect(repo.insertNotification).toHaveBeenCalledWith(input, 'tenant-1', 'admin-1');
    expect(repo.attachNotificationTargets).not.toHaveBeenCalled();
    expect(repo.fanoutToUsers).not.toHaveBeenCalled();
  });

  it('attaches targets and fans out when recipients resolve', async () => {
    const repo = makeRepo();
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue(['u1', 'u2']);

    await new SendNotificationUseCase(repo).execute(ctx, input);

    expect(repo.attachNotificationTargets).toHaveBeenCalledWith('notif-1', ['u1', 'u2']);
    expect(repo.fanoutToUsers).toHaveBeenCalledWith('notif-1', 'tenant-1', ['u1', 'u2']);
  });

  it('still returns the notification id when the instant push trigger fails', async () => {
    const repo = makeRepo({
      triggerInstantPush: vi.fn().mockRejectedValue(new Error('push down')),
    });
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue(['u1']);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await new SendNotificationUseCase(repo).execute(ctx, input);

    expect(result).toBe('notif-1');
    expect(repo.fanoutToUsers).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SEND_NOTIFICATION_ACTION_PUSH_ERROR]',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('forwards explicit target ids resolution untouched', async () => {
    const repo = makeRepo();
    const explicitInput: ResolveNotificationTargetsInput & SendNotificationInput = {
      ...input,
      target_user_ids: ['u9'],
    };
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue(['u9']);

    await new SendNotificationUseCase(repo).execute(ctx, explicitInput);

    expect(repo.resolveTargetUserIds).toHaveBeenCalledWith(explicitInput, 'tenant-1');
  });

  it('M16 (F16-4): compensates by soft-deleting the notification when the fanout fails', async () => {
    const repo = makeRepo({
      fanoutToUsers: vi.fn().mockRejectedValue(new Error('fanout down')),
    });
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue(['u1', 'u2']);

    await expect(new SendNotificationUseCase(repo).execute(ctx, input)).rejects.toThrow(
      'fanout down',
    );
    // The orphan notification row is removed so the caller's retry starts clean.
    expect(repo.softDelete).toHaveBeenCalledWith('notif-1', 'tenant-1');
    expect(repo.triggerInstantPush).not.toHaveBeenCalled();
  });

  it('M16 (F16-4): still throws the original fanout error when the compensation itself fails', async () => {
    const repo = makeRepo({
      attachNotificationTargets: vi.fn().mockRejectedValue(new Error('targets down')),
      softDelete: vi.fn().mockRejectedValue(new Error('cleanup down')),
    });
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue(['u1']);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(new SendNotificationUseCase(repo).execute(ctx, input)).rejects.toThrow(
      'targets down',
    );
    expect(repo.softDelete).toHaveBeenCalledWith('notif-1', 'tenant-1');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SEND_NOTIFICATION_COMPENSATION_FAILED]',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('M16 (F16-4): does not compensate when no recipients resolved (nothing fanned out)', async () => {
    const repo = makeRepo();
    (repo.resolveTargetUserIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await new SendNotificationUseCase(repo).execute(ctx, input);

    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
