import { container } from '@/container';
import type { UserLocationLog, CoordinatePoint } from '@/domain/types/analytics.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Service for fetching high-precision user location logs.
 */

export async function getUserLocationLogs(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<UserLocationLog[]> {
  const { supabase } = container;

  const { data, error } = await supabase
    .from('user_location_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return [];
  }

  return data as UserLocationLog[];
}

/**
 * Admin (service_role) variant of getUserLocationLogs.
 *
 * `user_location_logs` is partitioned with `partition_deny_direct` on every
 * child partition, so authenticated browser reads return incomplete rows.
 * Uses service-role and MUST only be called from a tenant-scoped server
 * action. Throws on error instead of swallowing it.
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
  if (error) throw error;
  return (data ?? []) as UserLocationLog[];
}

export async function getGlobalCoordinatePoints(limit = 1000): Promise<CoordinatePoint[]> {
  const { supabase } = container;

  // We fetch a sample of recent geographic points
  const { data, error } = await supabase
    .from('user_location_logs')
    .select('latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data.map((d: { latitude: number | null; longitude: number | null }) => ({
    lat: Number(d.latitude),
    lng: Number(d.longitude),
  }));
}
