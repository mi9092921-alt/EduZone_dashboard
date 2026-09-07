/**
 * Bulk operations domain types.
 */

// ── Bulk actions ─────────────────────────────────────────────────
export type BulkAction =
  | 'lock'
  | 'unlock'
  | 'suspend'
  | 'ban'
  | 'warn'
  | 'terminate_sessions'
  | 'reset_devices'
  | 'export'
  | 'delete';

// ── Dry-run response ─────────────────────────────────────────────
export interface BulkDryRunResponse {
  estimated_count: number;
  dry_run: true;
}

// ── Submit response ──────────────────────────────────────────────
export interface BulkSubmitResponse {
  job_id: string;
  estimated_count: number;
  status: string;
  created_at: string;
}

// ── Job progress (from job_queue.result — PERF-02 FIX moved structured
//    progress out of error_message; legacy rows may still carry the old
//    error_message JSON, which bulk.service.ts still parses as fallback) ────
export interface BulkProgress {
  processed: number;
  total: number;
  failed?: number;
  succeeded?: number;
  failed_ids: string[];
  succeeded_ids?: string[];
  truncated?: boolean;
  remaining?: number;
  in_progress?: boolean;
  download_url?: string;
  expires_at?: string;
  format?: string;
}

/**
 * Final outcome written by bulk-worker into job_queue.result (PERF-02 FIX).
 * succeeded_ids doubles as the resume checkpoint: on retry the worker skips
 * every id already listed here, guaranteeing zero double-impact (F-02).
 */
export interface BulkJobResult {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  succeeded_ids: string[];
  failed_ids: string[];
  truncated: boolean;
  remaining?: number;
}

// ── Action config (for UI display) ───────────────────────────────
export interface BulkActionConfig {
  id: BulkAction;
  label: string;
  icon: string;
  color: string;
  confirmMessage: (count: number) => string;
  requiresParams: boolean;
}
