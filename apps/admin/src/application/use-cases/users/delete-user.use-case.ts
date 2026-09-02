import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';
import { toClientMessage } from '@/domain/errors';

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
 */
export class DeleteUserUseCase {
  constructor(private readonly users: IUserAdminRepository) {}

  async execute(userId: string): Promise<DeleteUserResult> {
    try {
      // Delete auth user (cascades to public.users if configured)
      const deleted = await this.users.deleteAuthUser(userId);

      // Fallback soft delete to hide from active views
      await this.users.softDeleteProfile(userId);

      if (!deleted.ok) {
        // If user wasn't in auth for some reason, we soft deleted them in public anyway.
        if (!deleted.message.includes('not found')) {
          return { success: false, error: deleted.message };
        }
      }

      return { success: true };
    } catch (error: unknown) {
      console.error('deleteUserAction error:', error);
      return { success: false, error: toClientMessage(error) };
    }
  }
}
