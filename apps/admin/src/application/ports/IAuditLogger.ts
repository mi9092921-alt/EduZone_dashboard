import type { RequestContext } from '@/domain/types/context.types';

/**
 * Audit logger port (M13 — Audit & Observability, Execution Plan §17).
 *
 * The audit-event SOURCE is the use case, not the UI: every sensitive
 * operation emits an audit entry through this port with the correlation id
 * (requestId) from the caller's RequestContext, so
 * `operation → audit entry → correlation id → observable log` is testable.
 *
 * Implementations write through `log_activity_async` (SECURITY DEFINER,
 * queued → flushed into the hash-chained activity_logs by flush_activity_logs),
 * so the tamper-evident chain stays intact — no direct activity_logs inserts.
 *
 * Audit writes are best-effort by contract: implementations must never throw
 * for transport failures (the operation already succeeded), but callers still
 * await the promise so tests can observe the emitted entry.
 */
export interface AuditEventInput {
  /** Stable activity type recorded in activity_logs (e.g. 'user_created'). */
  readonly type: string;
  /** Human-readable summary (client-safe — no secrets, no raw DB text). */
  readonly summary?: string;
  /** Structured payload — must stay free of passwords/tokens/secrets. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Risk classification for alerting (default 'low'). */
  readonly riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** Resource the action targeted, when distinct from the actor. */
  readonly targetUserId?: string;
  /** Outcome of the operation. Default 'success'. */
  readonly outcome?: 'success' | 'failure';
}

export interface IAuditLogger {
  /** Records an audit event attributed to the given request context. */
  record(ctx: Readonly<RequestContext>, event: AuditEventInput): Promise<void>;
}

/** Generates a request-scoped correlation id (used by the auth boundary). */
export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
