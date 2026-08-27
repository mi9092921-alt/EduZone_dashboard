import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('env validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('successfully validates a valid environment', async () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    process.env['NEXT_PUBLIC_APP_ENV'] = 'production';

    const { env } = await import('./env');
    expect(env.NEXT_PUBLIC_APP_ENV).toBe('production');
  });

  it('throws an error if a required variable is missing', async () => {
    delete process.env['NEXT_PUBLIC_SUPABASE_URL'];
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'key';

    await expect(import('./env')).rejects.toThrow('Invalid environment variables');
  });

  it('throws an error if a URL is invalid', async () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'not-a-url';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'key';

    await expect(import('./env')).rejects.toThrow('Invalid environment variables');
  });

  it('defaults NEXT_PUBLIC_APP_ENV to development', async () => {
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'key';
    delete process.env['NEXT_PUBLIC_APP_ENV'];

    const { env } = await import('./env');
    expect(env.NEXT_PUBLIC_APP_ENV).toBe('development');
  });
});
