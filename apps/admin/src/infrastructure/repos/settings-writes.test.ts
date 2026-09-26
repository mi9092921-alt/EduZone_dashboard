import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';


import {
  disableMaintenanceModeViaSession,
  enableMaintenanceModeViaSession,
  lockAppViaSession,
  unlockAppViaSession,
} from './settings-writes';

/**
 * Regression guards for the 2026-09-26 security-audit fix: maintenance mode
 * and app lock were previously written through SECURITY DEFINER RPCs that are
 * service-role-granted yet internally require a user identity — dead for every
 * caller. The flows now write the same keys via `set_setting` under the
 * caller's own session. These tests pin the write ORDER (the enabling flag is
 * written LAST so a partial failure can never leave maintenance mode or the
 * app lock ON unconfigured) and the fail-closed behavior on a rejected key.
 */

function makeClient(failOnKey?: string) {
  const calls: Array<{ key: string; value: unknown }> = [];
  const rpc = vi.fn(async (_fn: string, args: { p_key: string; p_value: unknown }) => {
    if (failOnKey && args.p_key === failOnKey) {
      return { error: { code: '42501', message: 'PERMISSION_DENIED' } };
    }
    calls.push({ key: args.p_key, value: args.p_value });
    return { error: null };
  });
  return { client: { rpc } as unknown as SupabaseClient, calls, rpc };
}

describe('settings-writes (maintenance mode / app lock via set_setting)', () => {
  it('enable writes banner config first and flips maintenance_mode LAST', async () => {
    const { client, calls } = makeClient();

    await enableMaintenanceModeViaSession(client, {
      message: 'brb',
      ends_at: '2026-10-01T00:00:00.000Z',
      exclude_roles: ['super_admin'],
      exclude_users: ['00000000-0000-0000-0000-00000000000a'],
    });

    expect(calls.map((c) => c.key)).toEqual([
      'maintenance_message',
      'maintenance_excluded_roles',
      'maintenance_excluded_users',
      'maintenance_ends_at',
      'maintenance_mode',
    ]);
    expect(calls[calls.length - 1].value).toBe(true);
  });

  it('enable never flips the flag when a config write is denied', async () => {
    const { client, calls } = makeClient('maintenance_message');

    await expect(
      enableMaintenanceModeViaSession(client, { message: 'x', ends_at: null }),
    ).rejects.toThrow('maintenance_message');

    expect(calls).toEqual([]);
  });

  it('disable only writes the maintenance_mode flag', async () => {
    const { client, calls } = makeClient();

    await disableMaintenanceModeViaSession(client);

    expect(calls).toEqual([{ key: 'maintenance_mode', value: false }]);
  });

  it('lock writes the message before app_locked', async () => {
    const { client, calls } = makeClient();

    await lockAppViaSession(client, 'Locked for maintenance');

    expect(calls.map((c) => c.key)).toEqual(['app_lock_message', 'app_locked']);
    expect(calls[calls.length - 1].value).toBe(true);
  });

  it('unlock only writes the app_locked flag', async () => {
    const { client, calls } = makeClient();

    await unlockAppViaSession(client);

    expect(calls).toEqual([{ key: 'app_locked', value: false }]);
  });
});
