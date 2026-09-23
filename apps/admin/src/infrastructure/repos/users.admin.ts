import 'server-only';

import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Users privileged reads (SERVER-ONLY).
 *
 * P1 FIX (server/client boundary): every function here uses the service-role
 * client (bypasses RLS). The `server-only` guard makes any client-bundled
 * import fail the production build. Browser-safe users reads live in
 * `./users.service` (browser Supabase client via the DI container).
 *
 * MUST only be called from tenant-scoped server actions / route handlers —
 * never trust a client-supplied tenant id.
 */

// ── Tenant lookup for a user (cross-tenant IDOR guard support) ───
export async function getUserTenantId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.tenant_id as string) ?? null;
}
