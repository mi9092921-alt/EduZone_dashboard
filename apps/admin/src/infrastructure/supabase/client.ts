import { createBrowserClient as createClient } from '@supabase/ssr';

import { env } from '@/lib/env';

let client: ReturnType<typeof createClient> | null = null;

// Unique ID for the current browser session/tab lifecycle
const SESSION_ID = typeof window !== 'undefined' ? crypto.randomUUID() : 'server-side';

/**
 * Singleton Supabase browser client.
 * Uses NEXT_PUBLIC env vars — safe for client-side.
 */
export function createBrowserClient() {
  if (client) return client;

  try {
    client = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            'X-Request-ID': SESSION_ID,
          },
        },
      },
    );

    return client;
  } catch (err) {
    console.error('[SupabaseClient] Failed to create browser client:', err);
    throw err;
  }
}
