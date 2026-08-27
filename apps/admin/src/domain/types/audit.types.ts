/**
 * Audit domain types — synced with Eduzone Schema v13.9.0
 * activity_log_queue, activity_logs, audit_chain_state tables.
 */

import type {
  ActivityLog as BaseActivityLog,
  ActivityLogQueueEntry as BaseActivityLogQueueEntry,
  AuditChainState as BaseAuditChainState,
  RiskLevel,
} from '@eduzone/types';

export type { RiskLevel };

// ── Activity log (flushed — from activity_logs) ──────────────────
export interface ActivityLog extends BaseActivityLog {
  // Join extensions
  user_email?: string;
  device_name?: string;
  user_agent?: string | null;
  region_id?: string | null;
}

// ── Activity log queue entry (unflushed) ─────────────────────────
export interface ActivityLogQueueEntry extends BaseActivityLogQueueEntry {
  // Join extensions
  user_email?: string;
}

// ── Audit chain state ────────────────────────────────────────────
export interface AuditChainState extends BaseAuditChainState {
  // No extensions
}

// ── Filters ──────────────────────────────────────────────────────
export interface AuditFilters {
  user_id?: string | undefined;
  activity_type?: string[] | undefined;
  risk_level?: RiskLevel[] | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  tenant_id?: string | undefined;
}

// ── Verification result ──────────────────────────────────────────
export interface VerificationResult {
  valid: boolean;
  entriesVerified: number;
  failedAtSeq?: number;
}
