import { z } from 'zod';

/**
 * Server-boundary schemas for Server Actions that accept object payloads.
 *
 * Server Actions deserialize client arguments into plain JS objects — the
 * TypeScript parameter types are erased at runtime. Authorization gates
 * (`requirePermission`/`assertSameTenant`) decide WHO may call an action;
 * these schemas decide WHAT shape it accepts. Both are required at the
 * boundary (PHASE 2.9): a malformed payload must be rejected before it
 * reaches a service-role repository.
 *
 * Length limits mirror the DB CHECK constraints / use-case validations
 * (e.g. notification title 3..100, body 10..500) so a payload accepted here
 * cannot fail downstream with a raw DB error.
 */

const FEATURE_FLAG_STATUSES = ['active', 'deprecated', 'archived'] as const;
const JOB_STATUSES = ['pending', 'processing', 'done', 'failed', 'dead'] as const;

export const createFeatureFlagAdminSchema = z.object({
  key: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'key must be snake_case'),
  label: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  is_enabled: z.boolean().optional(),
  rollout_pct: z.number().int().min(0).max(100).optional(),
  status: z.enum(FEATURE_FLAG_STATUSES).optional(),
  starts_at: z.string().max(40).optional(),
  ends_at: z.string().max(40).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateFeatureFlagAdminSchema = z.object({
  label: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  is_enabled: z.boolean().optional(),
  rollout_pct: z.number().int().min(0).max(100).optional(),
  status: z.enum(FEATURE_FLAG_STATUSES).optional(),
  starts_at: z.string().max(40).nullable().optional(),
  ends_at: z.string().max(40).nullable().optional(),
  // Non-nullable like the client form (settings.schema) and the domain
  // UpdateFeatureFlagInput: null metadata has no "clear" semantics in
  // prepareFeatureFlagPayload (null || {} === {}), so reject it explicitly.
  metadata: z.record(z.unknown()).optional(),
});

export const jobFiltersSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  job_type: z.string().max(100).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD')
    .optional(),
});

export const courseAnnouncementInputSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(3).max(100),
  body: z.string().min(10).max(500),
});

const TENANT_PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;
const TENANT_STATUSES = ['active', 'suspended', 'deleted'] as const;

/**
 * PHASE 2.9: tenant boundaries accept raw client objects (TS types erased).
 * Slug/name limits mirror the DB constraints; numeric quotas are bounded so
 * a crafted payload cannot request absurd limits before the use case runs.
 */
export const createTenantInputSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be URL-friendly (lowercase, hyphens only)'),
  name: z.string().min(3).max(200),
  plan: z.enum(TENANT_PLANS).optional(),
  region_id: z.string().max(64).optional(),
  max_users: z.number().int().min(1).max(1_000_000).optional(),
  max_courses: z.number().int().min(1).max(100_000).optional(),
  max_storage_bytes: z.number().int().min(1).max(10_737_418_240_000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateTenantInputSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  plan: z.enum(TENANT_PLANS).optional(),
  region_id: z.string().max(64).optional(),
  max_users: z.number().int().min(1).max(1_000_000).optional(),
  max_courses: z.number().int().min(1).max(100_000).optional(),
  max_storage_bytes: z.number().int().min(1).max(10_737_418_240_000).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  metadata: z.record(z.unknown()).optional(),
});
