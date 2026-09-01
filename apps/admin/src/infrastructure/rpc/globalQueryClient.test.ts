import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getQueryClient } from './globalQueryClient';

import { parseRpcError } from '@/domain/errors';

vi.mock('@/domain/errors', () => ({
  parseRpcError: vi.fn(),
  SESSION_INVALIDATING_CODES: new Set(['AUTH_REQUIRED', 'INVALID_TOKEN_VERSION']),
}));

describe('globalQueryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear browserQueryClient singleton for testing
    // @ts-expect-error test-only: window/location globals are not fully typed here
    global.window = {}; // Ensure we are in "browser" mode for getQueryClient
  });

  it('configures default staleTime and gcTime', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions().queries;

    expect(defaults?.staleTime).toBe(30_000);
    expect(defaults?.gcTime).toBe(300_000);
  });

  describe('retry logic', () => {
    it('does not retry for session-invalidating errors', () => {
      const client = getQueryClient();
      const retry = client.getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: unknown,
      ) => boolean;

      (parseRpcError as any).mockReturnValue({ code: 'AUTH_REQUIRED' });
      expect(retry(0, new Error())).toBe(false);

      (parseRpcError as any).mockReturnValue({ code: 'INVALID_TOKEN_VERSION' });
      expect(retry(0, new Error())).toBe(false);
    });

    it('does not retry for permission or not found errors', () => {
      const client = getQueryClient();
      const retry = client.getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: unknown,
      ) => boolean;

      (parseRpcError as any).mockReturnValue({ code: 'PERMISSION_DENIED' });
      expect(retry(0, new Error())).toBe(false);

      (parseRpcError as any).mockReturnValue({ code: 'NOT_FOUND' });
      expect(retry(0, new Error())).toBe(false);
    });

    it('retries up to 2 times for other errors', () => {
      const client = getQueryClient();
      const retry = client.getDefaultOptions().queries?.retry as (
        failureCount: number,
        error: unknown,
      ) => boolean;

      (parseRpcError as any).mockReturnValue({ code: 'UNKNOWN_ERROR' });

      expect(retry(0, new Error())).toBe(true);
      expect(retry(1, new Error())).toBe(true);
      expect(retry(2, new Error())).toBe(false);
    });
  });

  describe('mutation error handling', () => {
    it('redirects to login on session-invalidating errors', () => {
      const client = getQueryClient();
      const onError = client.getDefaultOptions().mutations?.onError as (error: unknown) => void;

      // Mock window.location
      const originalLocation = window.location;
      // @ts-expect-error test-only: window/location globals are not fully typed here
      delete window.location;
      window.location = { href: '' } as any;

      (parseRpcError as any).mockReturnValue({ code: 'AUTH_REQUIRED' });

      onError(new Error());

      expect(window.location.href).toContain('/login?reason=session_invalidated');

      // @ts-expect-error test-only: window/location globals are not fully typed here
      window.location = originalLocation;
    });

    it('does not redirect for non-auth errors', () => {
      const client = getQueryClient();
      const onError = client.getDefaultOptions().mutations?.onError as (error: unknown) => void;

      const originalLocation = window.location;
      // @ts-expect-error test-only: window/location globals are not fully typed here
      delete window.location;
      window.location = { href: '' } as any;

      (parseRpcError as any).mockReturnValue({ code: 'VALIDATION_ERROR' });

      onError(new Error());

      expect(window.location.href).toBe('');

      // @ts-expect-error test-only: window/location globals are not fully typed here
      window.location = originalLocation;
    });
  });
});
