import { container } from '@/container';

/**
 * Telemetry Service
 * 
 * Handles non-blocking application telemetry and location logging.
 * Adheres to the RLS-first contract by utilizing secure RPC wrappers.
 */

export interface TelemetryParams {
  latitude: number;
  longitude: number;
  accuracy?: number;
  provider?: string;
  deviceId?: string;
  metadata?: Record<string, any>;
}

/**
 * Logs the current application open location for the authenticated user.
 * This RPC handles throttling (default 3 mins) on the database side.
 * 
 * @param params Latitude, longitude and optional device metadata
 */
export async function logAppLocation(params: TelemetryParams): Promise<void> {
  const { supabase } = container;

  const { error } = await supabase.rpc('log_app_open_location', {
    p_latitude: params.latitude,
    p_longitude: params.longitude,
    p_accuracy: params.accuracy || null,
    p_source: params.provider || 'gps',
    p_session_id: null, // Session tracking not enabled in v13 telemetry
    p_device_info: params.metadata || {},
  });

  if (error) {
    // Throttling is expected behavior (3-min window)
    if (error.code === 'RATE_LIMITED' || error.message.includes('throttle')) {
      console.info('Telemetry log throttled (expected):', error.message);
      return;
    }
    // Real errors logged as warnings
    console.warn('Telemetry log failed:', error.message);
  }
}
