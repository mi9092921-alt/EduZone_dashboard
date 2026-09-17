import { container } from '@/container';
import { InfrastructureError } from '@/domain/errors';
import type { Session } from '@/domain/types/user.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Service for fetching a user's login sessions (IP + region + started_at).
 * Read-only. Row access is enforced by RLS (`sessions_select_policy`):
 * self or admin with a valid session.
 */
export async function getUserSessions(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<Session[]> {
  const { supabase } = container;

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return [];
  }

  return data as Session[];
}

/**
 * Admin (service_role) variant of getUserSessions.
 *
 * `sessions` is partitioned and every child partition denies authenticated
 * reads (`partition_deny_direct`), so browser-client queries return
 * incomplete rows. Uses service-role and MUST only be called from a
 * tenant-scoped server action. Throws on error (no silent [] — callers
 * need to distinguish "no sessions" from "query failed").
 */
export async function getUserSessionsAdmin(
  userId: string,
  limit = 20,
  offset = 0,
  tenantId?: string,
): Promise<Session[]> {
  const admin = createAdminClient();
  let query = admin
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error) {
    throw new InfrastructureError(
      undefined,
      `getUserSessionsAdmin: ${error.message}`,
    );
  }
  return (data ?? []) as Session[];
}
