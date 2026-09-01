import { container } from '@/container';
import type { UserLocationLog, CoordinatePoint } from '@/domain/types/analytics.types';

/**
 * Service for fetching high-precision user location logs.
 */

export async function getUserLocationLogs(userId: string, limit = 20): Promise<UserLocationLog[]> {
  const { supabase } = container;

  const { data, error } = await supabase
    .from('user_location_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data as UserLocationLog[];
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
