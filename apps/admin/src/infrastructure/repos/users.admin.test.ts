import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getUserTenantId } from './users.admin';

// P1 (server/client boundary): privileged tenant lookup lives in the
// server-only `./users.admin` module. These tests pin its fail-closed
// contract — the boundary's IDOR guard depends on null-on-error.

// Mock the admin (service-role) client used by getUserTenantId
const mockAdminFrom: any = vi.fn();
vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockAdminFrom }),
}));

describe('users.admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserTenantId (cross-tenant IDOR guard support)', () => {
    it('returns the owning tenant_id for an existing user', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: 't-1' }, error: null }),
          }),
        }),
      }));

      const result = await getUserTenantId('user-1');
      expect(result).toBe('t-1');
    });

    it('returns null when the user does not exist', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }));

      const result = await getUserTenantId('missing');
      expect(result).toBeNull();
    });

    it('returns null on query error (fails closed)', async () => {
      mockAdminFrom.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
          }),
        }),
      }));

      const result = await getUserTenantId('user-1');
      expect(result).toBeNull();
    });
  });
});
