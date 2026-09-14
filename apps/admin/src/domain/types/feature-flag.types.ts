/**
 * Feature Flag domain types — mirrors `feature_flags`, `feature_flag_roles`,
 * `feature_flag_users`, and `tenant_feature_flags` tables from Eduzone Schema v13.9.0.
 */

import type {
  FeatureFlag as BaseFeatureFlag,
  FeatureFlagStatus,
  TenantFeatureFlagOverride,
} from '@eduzone/types';

// Sync with v13
export type FeatureFlag = BaseFeatureFlag;
export type { FeatureFlagStatus, TenantFeatureFlagOverride };

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
  tenant_overrides?: TenantFeatureFlagOverride[];
}

export interface CreateFeatureFlagInput {
  key: string;
  label?: string;
  description?: string;
  is_enabled?: boolean;
  rollout_pct?: number; // 0..100 percentage from UI
  status?: FeatureFlagStatus;
  starts_at?: string;
  ends_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateFeatureFlagInput {
  label?: string;
  description?: string;
  is_enabled?: boolean;
  rollout_pct?: number; // 0..100 percentage from UI
  status?: FeatureFlagStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagDbRow {
  id: string;
  key: string;
  description?: string | null;
  is_enabled: boolean;
  rollout_pct: number; // Stored as Basis Points (0..10000) in database
  status?: FeatureFlagStatus;
  enabled_from?: string | null;
  enabled_until?: string | null;
  metadata?: { label?: string; starts_at?: string | null; ends_at?: string | null } | null;
  created_at: string;
  updated_at: string;
}

// Helper to map DB row to frontend FeatureFlag type.
export function mapDbRowToFeatureFlag(row: FeatureFlagDbRow | null): FeatureFlag | null {
  if (!row) return null;
  const metadata = row.metadata || {};

  // Friendly default label from key
  const defaultLabel = row.key
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Convert DB Basis Points (0..10000) to UI percentage (0..100)
  // If a legacy row already has <= 100 and it's not 0 or 10000, we still safely normalize
  const rawPct = row.rollout_pct ?? 0;
  const uiRolloutPct = rawPct > 100 ? Math.round(rawPct / 100) : rawPct;

  const startsAt = row.enabled_from ?? metadata.starts_at ?? null;
  const endsAt = row.enabled_until ?? metadata.ends_at ?? null;

  return {
    id: row.id,
    key: row.key,
    description: row.description ?? null,
    is_enabled: row.is_enabled,
    rollout_pct: uiRolloutPct,
    status: row.status || 'active',
    enabled_from: row.enabled_from ?? null,
    enabled_until: row.enabled_until ?? null,
    metadata: metadata as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
    label: metadata.label || defaultLabel,
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

// Helper to prepare the insert/update payload (maps percentage to basis points and populates DB columns)
export function prepareFeatureFlagPayload(
  input: CreateFeatureFlagInput | UpdateFeatureFlagInput,
  existingMetadata: Record<string, unknown> = {},
) {
  const { label, starts_at, ends_at, rollout_pct, status, ...rest } = input;

  const mergedMetadata: Record<string, unknown> = {
    ...existingMetadata,
    ...(rest.metadata || {}),
  };

  if (label !== undefined) mergedMetadata.label = label;
  if (starts_at !== undefined) mergedMetadata.starts_at = starts_at;
  if (ends_at !== undefined) mergedMetadata.ends_at = ends_at;

  const payload: Record<string, unknown> = {
    ...rest,
    metadata: mergedMetadata,
  };

  // Convert UI percentage (0..100) to Database Basis Points (0..10000)
  if (rollout_pct !== undefined) {
    const clampedPct = Math.max(0, Math.min(100, rollout_pct));
    payload.rollout_pct = Math.round(clampedPct * 100);
  }

  if (status !== undefined) {
    payload.status = status;
  }

  // Populate first-class DB columns for schedules if provided
  if (starts_at !== undefined) {
    payload.enabled_from = starts_at;
  }
  if (ends_at !== undefined) {
    payload.enabled_until = ends_at;
  }

  return payload;
}
