import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createAdminClient, getAdminClient } from './admin';

describe('AdminGateway (service_role client)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('creates an admin client when SUPABASE_SERVICE_ROLE_KEY is present', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-service-role-key-123';

    const client = createAdminClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('throws an informative error if SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createAdminClient()).toThrow('[AdminGateway] Missing SUPABASE_SERVICE_ROLE_KEY');
  });

  it('returns singleton instance with getAdminClient', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-service-role-key-123';

    const client1 = getAdminClient();
    const client2 = getAdminClient();
    expect(client1).toBe(client2);
  });
});
