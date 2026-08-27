import { z } from 'zod';

/**
 * Zod schemas for settings & feature flag mutations.
 * Refactored to accept a translator function (t) for localized error messages.
 */

// ── Settings ──────────────────────────────────────────────────

export const getSetSettingSchema = (t: any) => z.object({
  key: z.string().min(1, t('validation.key_required')),
  value: z.string(),
  value_type: z.enum(['string', 'integer', 'boolean', 'json']).default('string'),
});

export const getMaintenanceModeSchema = (t: any) => z.object({
  message: z.string().min(5, t('validation.message_min', { min: 5 })).max(2000),
  message_en: z.string().max(2000).optional(),
  ends_at: z.string().refine(
    (val) => new Date(val) > new Date(),
    { message: t('validation.future_date') },
  ),
  exclude_roles: z.array(z.string()).optional(),
  exclude_users: z.array(z.string()).optional(),
});

export const getAppLockSchema = (t: any) => z.object({
  message: z.string().min(5, t('validation.message_min', { min: 5 })).max(2000),
});

// ── Feature Flags ────────────────────────────────────────────

export const getCreateFeatureFlagSchema = (t: any) => z.object({
  key: z
    .string()
    .min(3, t('validation.key_min', { min: 3 }))
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, t('validation.key_format')),
  label: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  is_enabled: z.boolean().default(false),
  rollout_pct: z.number().int().min(0).max(100).default(100),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
});

export const getUpdateFeatureFlagSchema = (t: any) => z.object({
  label: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  is_enabled: z.boolean().optional(),
  rollout_pct: z.number().int().min(0).max(100).optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const addFlagOverrideSchema = z.object({
  flag_id: z.string().uuid(),
  target_id: z.string().uuid(),
  is_exclude: z.boolean().default(false),
});

// Types based on the factory functions (using default t for inference)
const dummyT = (key: string) => key;
export type SetSettingInput = z.infer<ReturnType<typeof getSetSettingSchema>>;
export type MaintenanceModeInput = z.infer<ReturnType<typeof getMaintenanceModeSchema>>;
export type AppLockInput = z.infer<ReturnType<typeof getAppLockSchema>>;
export type CreateFeatureFlagInput = z.infer<ReturnType<typeof getCreateFeatureFlagSchema>>;
export type UpdateFeatureFlagInput = z.infer<ReturnType<typeof getUpdateFeatureFlagSchema>>;
export type AddFlagOverrideInput = z.infer<typeof addFlagOverrideSchema>;
