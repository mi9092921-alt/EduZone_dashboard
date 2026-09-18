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
    const details: Record<string, unknown> = {
      request_id: ctx.requestId ?? null,
      actor_role: ctx.role,
      outcome: event.outcome ?? 'success',
      ...(event.summary !== undefined && { summary: event.summary }),
      ...(event.targetUserId !== undefined && { target_user_id: event.targetUserId }),
      // Tenant Switcher: a switched super_admin's ctx.tenantId is the
      // *acting* tenant. It must NOT be sent as the log_activity_async
      // tenant override -- the actor has no (user_id, tenant_id) membership
      // row there, so the override poisoned activity_log_queue and wedged
      // flush_activity_logs with a 23503 FK violation
      // (activity_logs_user_tenant_fkey). The RPC derives the actor's home
      // tenant from public.users instead; the acting tenant is preserved
      // here for traceability.
      ...(ctx.homeTenantId !== undefined &&
        ctx.homeTenantId !== ctx.tenantId && {
          acting_tenant_id: ctx.tenantId,
        }),
      ...(event.details ?? {}),
    };

    try {
      // Keep client construction inside the best-effort boundary. If server
      // configuration is incomplete, auditing must not turn an already
      // successful destructive operation into a failed Server Action.
      const admin = createAdminClient();
      await logActivityAsync(admin, {
        userId: ctx.userId,
        type: event.type,
        details,
        riskLevel: event.riskLevel ?? 'low',
        // Null override: let log_activity_internal derive the tenant from
        // the actor's own public.users row -- always FK-valid by construct.
        tenantId: null,
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
