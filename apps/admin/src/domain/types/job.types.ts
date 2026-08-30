/**
 * Job queue domain types — synced with Eduzone Schema v13.9.0
 * job_queue table.
 */

import type { Job as BaseJob, JobStatus } from '@eduzone/types';

export type { JobStatus };

// ── Job ──────────────────────────────────────────────────────────
// Sync with finished_at and error_message in v13
export type Job = BaseJob;

// ── Filters ──────────────────────────────────────────────────────
export interface JobFilters {
  status?: JobStatus;
  job_type?: string;
  dateFrom?: string;
}

// ── Status counts ────────────────────────────────────────────────
export interface JobStatusCounts {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  dead: number;
}
