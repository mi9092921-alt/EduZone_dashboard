import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const notFound = vi.fn(() => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
  });
  const getUser = vi.fn();
  const profileQuery = vi.fn();
  return { notFound, getUser, profileQuery };
});

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('@/infrastructure/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.profileQuery,
  })),
}));

import { requirePageAccess } from './page-guard';

function profileResult(profile: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    maybeSingle: async () => ({ data: profile }),
  };
  return builder;
}

beforeEach(() => {
  mocks.notFound.mockClear();
  mocks.getUser.mockReset();
  mocks.profileQuery.mockReset();
});

describe('requirePageAccess (G1 server-side route guard)', () => {
  it('allows super_admin into a super_admin-only segment', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mocks.profileQuery.mockReturnValue(profileResult({ primary_role: 'super_admin', account_status: 'active' }));

    await expect(requirePageAccess('tenants')).resolves.toBeUndefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('404s a teacher opening an admin-only segment by direct URL', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mocks.profileQuery.mockReturnValue(profileResult({ primary_role: 'teacher', account_status: 'active' }));

    await expect(requirePageAccess('users')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it('404s a student (defense in depth — login already rejects them)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u3' } }, error: null });
    mocks.profileQuery.mockReturnValue(profileResult({ primary_role: 'student', account_status: 'active' }));

    await expect(requirePageAccess('dashboard')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s an authenticated but non-active account (suspended/locked/banned)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u4' } }, error: null });
    mocks.profileQuery.mockReturnValue(profileResult({ primary_role: 'admin', account_status: 'suspended' }));

    await expect(requirePageAccess('settings')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the profile row is missing (deleted user with a live JWT)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u5' } }, error: null });
    mocks.profileQuery.mockReturnValue(profileResult({ data: null }));

    await expect(requirePageAccess('dashboard')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when server-side session validation fails (revoked/expired token)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'session expired' } });

    await expect(requirePageAccess('dashboard')).rejects.toThrow('NEXT_NOT_FOUND');
    // Must not leak profile intent: no DB query before auth succeeds.
    expect(mocks.profileQuery).not.toHaveBeenCalled();
  });

  it('404s when auth.getUser() throws (malformed session state)', async () => {
    mocks.getUser.mockRejectedValue(new Error('malformed'));

    await expect(requirePageAccess('dashboard')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
