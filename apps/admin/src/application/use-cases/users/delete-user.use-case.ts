import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';
import { toClientMessage } from '@/domain/errors';
import type { RequestContext } from '@/domain/types/context.types';

export interface DeleteUserResult {
  success: boolean;
  error?: string;
}

/**
 * DeleteUserUseCase — permanent user deletion with soft-delete fallback.
 *
 * Business rules (moved verbatim from the former fat server action):
 *  1. Auth user deletion via the Admin API (cascades to public.users if
 *     configured).
 *  2. The profile row is ALWAYS soft-deleted (deleted_at + banned) as a
 *     belt-and-braces fallback so the user disappears from active views
 *     even when auth deletion fails.
 *  3. Auth deletion failures are tolerated when the user "was not found"
 *     (already gone) — any other failure is surfaced to the caller.
 *
 * M13 (§17): the use case is the audit-event source — success and failure
 * both emit `user_deleted` carrying the requestId correlation id.
 */
export class DeleteUserUseCase {
  constructor(
    private readonly users: IUserAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, userId: string): Promise<DeleteUserResult> {
    try {
      // Delete auth user (cascades to public.users if configured)
      const deleted = await this.users.deleteAuthUser(userId);

      // Fallback soft delete to hide from active views
      await this.users.softDeleteProfile(userId);

      if (!deleted.ok) {
        // If user wasn't in auth for some reason, we soft deleted them in public anyway.
        if (!deleted.message.includes('not found')) {
          await this.audit.record(ctx, {
            type: 'user_deleted',
            summary: 'User deletion failed',
            details: { reason: deleted.message },
            riskLevel: 'high',
            targetUserId: userId,
            outcome: 'failure',
          });
          return { success: false, error: deleted.message };
        }
      }

      await this.audit.record(ctx, {
        type: 'user_deleted',
        summary: 'User permanently deleted (auth) with soft-delete fallback',
        riskLevel: 'high',
        targetUserId: userId,
      });

      return { success: true };
    } catch (error: unknown) {
      console.error('deleteUserAction error:', error);
      await this.audit.record(ctx, {
        type: 'user_deleted',
        summary: 'User deletion crashed unexpectedly',
        riskLevel: 'high',
        targetUserId: userId,
        outcome: 'failure',
      });
      return { success: false, error: toClientMessage(error) };
    }
  }
}
