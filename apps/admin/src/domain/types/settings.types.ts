/**
 * Settings KV domain types — mirrors `settings_kv` table from Eduzone Schema v13.9.0.
 */

import type { Setting as BaseSetting } from '@eduzone/types';

export type SettingValueType = 'string' | 'integer' | 'boolean' | 'json';

export type SettingCategory = 'general' | 'security' | 'maintenance' | 'limits';

export interface SettingKv extends BaseSetting {
  // Sync with v13
}

/** Grouped settings for category tabs */
export interface SettingsByCategory {
  general: SettingKv[];
  security: SettingKv[];
  maintenance: SettingKv[];
  limits: SettingKv[];
}

/** Parameters for enabling maintenance mode */
export interface MaintenanceModeParams {
  message: string;
  message_en?: string;
  ends_at: string; // ISO 8601
  exclude_roles?: string[];
  exclude_users?: string[];
}

/** Cache invalidation queue entry */
export interface CacheInvalidationEntry {
  id: string;
  cache_key: string;
  cache_type: string;
  payload: Record<string, unknown>;
  channel: string;
  processed: boolean;
  created_at: string;
  processed_at: string | null;
}
