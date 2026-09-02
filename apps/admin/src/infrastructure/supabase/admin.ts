import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, getServerEnv } from '@/lib/env';

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Creates a fresh, unauthenticated Supabase Admin (service_role) client.
 *
 * INVARIANTS & SECURITY:
 * 1. ONLY accessible in server runtime (guarded by getServerEnv).
 * 2. Auth persistence and token auto-refresh are disabled.
 * 3. Bypasses PostgreSQL Row Level Security (RLS) — caller code MUST
 *    perform explicit authorization and tenant isolation checks before use.
 */
export function createAdminClient(): SupabaseClient {
  const serverEnv = getServerEnv();
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('❌ [AdminGateway] Missing SUPABASE_SERVICE_ROLE_KEY. Server-only operations cannot proceed.');
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Returns a cached singleton Supabase Admin (service_role) client for stateless operations.
 */
export function getAdminClient(): SupabaseClient {
  if (!cachedAdminClient) {
    cachedAdminClient = createAdminClient();
  }
  return cachedAdminClient;
}
