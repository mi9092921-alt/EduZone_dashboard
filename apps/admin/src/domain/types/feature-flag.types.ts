/**
 * Feature Flag domain types — mirrors `feature_flags`, `feature_flag_roles`,
 * and `feature_flag_users` tables from Eduzone Schema v13.9.0.
 */

import type { FeatureFlag as BaseFeatureFlag } from '@eduzone/types';

export interface FeatureFlag extends BaseFeatureFlag {
  // Sync with v13
}

export interface FeatureFlagRole {
  flag_id: string;
  role_id: string;
  is_exclude: boolean;
  /** Joined from roles table */
  role_name?: string;
  role_key?: string;
}

export interface FeatureFlagUser {
  flag_id: string;
  user_id: string;
  is_exclude: boolean;
  /** Joined from users table */
  user_email?: string;
  user_name?: string;
}

export interface FeatureFlagDetail extends FeatureFlag {
  role_overrides: FeatureFlagRole[];
  user_overrides: FeatureFlagUser[];
}

export interface CreateFeatureFlagInput {
  key: string;
  label?: string;
  description?: string;
  is_enabled?: boolean;
  rollout_pct?: number;
  starts_at?: string;
  ends_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateFeatureFlagInput {
  label?: string;
  description?: string;
  is_enabled?: boolean;
  rollout_pct?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown>;
}

// Helper to map DB row to frontend FeatureFlag type
export function mapDbRowToFeatureFlag(row: any): FeatureFlag {
  if (!row) return row;
  const metadata = row.metadata || {};
  
  // Friendly default label from key
  const defaultLabel = row.key
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    id: row.id,
    key: row.key,
    description: row.description,
    is_enabled: row.is_enabled,
    rollout_pct: row.rollout_pct,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    label: metadata.label || defaultLabel,
    starts_at: metadata.starts_at || null,
    ends_at: metadata.ends_at || null,
  };
}

// Helper to prepare the insert/update payload (moves label, starts_at, ends_at into metadata)
export function prepareFeatureFlagPayload(input: any, existingMetadata: any = {}) {
  const { label, starts_at, ends_at, ...rest } = input;
  
  const mergedMetadata = {
    ...existingMetadata,
    ...(rest.metadata || {}),
  };
  
  if (label !== undefined) mergedMetadata.label = label;
  if (starts_at !== undefined) mergedMetadata.starts_at = starts_at;
  if (ends_at !== undefined) mergedMetadata.ends_at = ends_at;

  return {
    ...rest,
    metadata: mergedMetadata,
  };
}

