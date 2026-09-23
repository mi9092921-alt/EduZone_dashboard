import 'server-only';

import { InfrastructureError } from '@/domain/errors';
import type { UserLocationLog } from '@/domain/types/analytics.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * User location logs privileged reads (SERVER-ONLY).
 *
 * P1 FIX (server/client boundary): this function uses the service-role
 * client (bypasses RLS / partition deny). The `server-only` guard makes any
 * client-bundled import fail the production build. Browser-safe reads live
 * in `./user_location_logs.service` (browser Supabase client).
 *
 * MUST only be called from a tenant-scoped server action. Throws on error
 * instead of swallowing it.
 */
export async function getUserLocationLogsAdmin(
  userId: string,
  limit = 20,
  offset = 0,
  tenantId?: string,
): Promise<UserLocationLog[]> {
  const admin = createAdminClient();
  let query = admin
    .from('user_location_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error) {
    throw new InfrastructureError(undefined, `getUserLocationLogsAdmin: ${error.message}`);
  }
  return (data ?? []) as UserLocationLog[];
}
