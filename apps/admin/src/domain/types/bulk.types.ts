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

// ── Job progress (from job_queue.error_msg during processing) ────
export interface BulkProgress {
  processed: number;
  total: number;
  failed?: number;
  succeeded?: number;
  failed_ids: string[];
  in_progress?: boolean;
  download_url?: string;
  expires_at?: string;
  format?: string;
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
