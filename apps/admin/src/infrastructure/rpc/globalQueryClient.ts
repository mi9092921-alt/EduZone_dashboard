'use client';

import { QueryClient } from '@tanstack/react-query';

import { parseRpcError, SESSION_INVALIDATING_CODES } from '@/domain/errors';

/**
 * Global React Query client.
 * Configured with:
 * - Global error handler (auto-logout on session invalidation)
 * - Stale/gc times per the PRD spec
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30 seconds
        gcTime: 5 * 60_000, // 5 minutes
        retry: (failureCount, error) => {
          const appError = parseRpcError(error);
          // Don't retry on auth/permission errors
          if (SESSION_INVALIDATING_CODES.has(appError.code)) return false;
          if (appError.code === 'PERMISSION_DENIED') return false;
          if (appError.code === 'NOT_FOUND') return false;
          // Retry up to 2 times for other errors
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
        onError: (error) => {
          const appError = parseRpcError(error);
          // Session-invalidating errors → hard logout
          if (SESSION_INVALIDATING_CODES.has(appError.code)) {
            // Redirect to login with reason
            if (typeof window !== 'undefined') {
              window.location.href = '/login?reason=session_invalidated';
            }
          }
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Get or create the singleton QueryClient.
 * On server, creates a new client per request.
 * On browser, reuses the same client.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always make a new client
    return makeQueryClient();
  }
  // Browser: reuse existing client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
