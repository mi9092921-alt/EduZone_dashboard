import type { AuditEventInput, IAuditLogger } from '@/application/ports/IAuditLogger';
import type { RequestContext } from '@/domain/types/context.types';
import { logActivityAsync } from '@/infrastructure/repos/jobs-rpc.service';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Supabase implementation of IAuditLogger (M13 — Execution Plan §17).
 *
 * Writes through `log_activity_async` (SECURITY DEFINER, granted to
 * authenticated + service_role) so every entry lands in
 * activity_log_queue → flush_activity_logs → the hash-chained activity_logs.
 * The service-role client is required because dashboard actions act on
 * behalf of the *initiator* while bypassing RLS for privileged ops — the
 * function itself re-verifies service_role / self / admin-with-session.
 *
 * Never throws (audit is best-effort after the operation succeeded) but
 * logs transport failures server-side so a silently broken audit path is
 * observable.
 */
export class SupabaseAuditLogger implements IAuditLogger {
  async record(ctx: Readonly<RequestContext>, event: AuditEventInput): Promise<void> {
    const admin = createAdminClient();
    const details: Record<string, unknown> = {
      request_id: ctx.requestId ?? null,
      actor_role: ctx.role,
      outcome: event.outcome ?? 'success',
      ...(event.summary !== undefined && { summary: event.summary }),
      ...(event.targetUserId !== undefined && { target_user_id: event.targetUserId }),
      ...(event.details ?? {}),
    };

    try {
      await logActivityAsync(admin, {
        userId: ctx.userId,
        type: event.type,
        details,
        riskLevel: event.riskLevel ?? 'low',
        tenantId: ctx.tenantId || null,
      });
    } catch (error) {
      console.error('[audit-logger] log_activity_async failed:', {
        type: event.type,
        request_id: details.request_id,
        actor: ctx.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Factory — the single construction site wired from server boundaries. */
export function makeAuditLogger(): IAuditLogger {
  return new SupabaseAuditLogger();
}
