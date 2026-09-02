import { z } from 'zod';

import type { BulkAction } from '@/domain/types/bulk.types';

/**
 * Zod input schemas for the /api/bulk-action route (M9 — DTO / Schema Boundary).
 *
 * The request body previously reached the business logic as a bare
 * `as BulkRequestBody` cast, so filter/param fields arrived as
 * `Record<string, unknown>` and were re-cast at every use site. These
 * schemas validate the public boundary once and give the route fully
 * typed values — unknown keys are stripped, not forwarded.
 *
 * Mirrors the DB CHECK constraints for job_queue payloads (severity 1-3,
 * suspend_hours 1-720) without touching the shared schema.
 */

export const BULK_ACTIONS = [
  'lock',
  'unlock',
  'suspend',
  'ban',
  'warn',
  'terminate_sessions',
  'reset_devices',
  'export',
  'delete',
] as const satisfies readonly BulkAction[];

const maxBulkSize = 500;

export const bulkFiltersSchema = z
  .object({
    user_ids: z.array(z.string().uuid()).max(maxBulkSize).optional(),
    search: z.string().max(200).optional(),
    primary_role: z.string().max(50).optional(),
    account_status: z.string().max(50).optional(),
    tenant_id: z.string().uuid().optional(),
    region_id: z.string().max(100).optional(),
  })
  .strict();

export const bulkParamsSchema = z
  .object({
    reason: z.string().max(1000).optional(),
    severity: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    suspend_hours: z.number().int().min(1).max(720).optional(),
    export_format: z.enum(['json', 'csv']).optional(),
  })
  .strict();

export const bulkActionRequestSchema = z
  .object({
    action: z.enum(BULK_ACTIONS),
    filters: bulkFiltersSchema,
    params: bulkParamsSchema.optional(),
    dry_run: z.boolean(),
  })
  .strict();

export type BulkFiltersInput = z.infer<typeof bulkFiltersSchema>;
export type BulkParamsInput = z.infer<typeof bulkParamsSchema>;
export type BulkActionRequest = z.infer<typeof bulkActionRequestSchema>;

/** Overall max selected users — keeps MAX_BULK_SIZE in sync with the route. */
export const MAX_BULK_SIZE = maxBulkSize;
