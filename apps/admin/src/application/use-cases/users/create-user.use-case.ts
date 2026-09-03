import type { IAuditLogger } from '@/application/ports/IAuditLogger';
import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';
import { toClientMessage } from '@/domain/errors';
import type { CreateUserInput } from '@/domain/schemas/user.schema';
import type { RequestContext } from '@/domain/types/context.types';

export interface CreateUserResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * CreateUserUseCase — privileged user onboarding with compensation.
 *
 * Business rules (moved verbatim from the former fat server action):
 *  1. New users ALWAYS join the admin's own tenant — derived from the
 *     authorized caller context, never from client input.
 *  2. Default temporary password when none supplied.
 *  3. Compensation: if profile sync or role sync fails after the auth
 *     user was created, the orphaned auth user is deleted (best-effort)
 *     so no half-created account remains.
 *  4. M16 (F16-5): a failed compensation is never silent — it is logged
 *     server-side and appended to the returned error so operators can
 *     find and delete the orphaned auth user.
 *
 * M13 (§17): emits `user_created` audit events (success/failure/compensation)
 * with the requestId correlation id. Details never include the password.
 */
export class CreateUserUseCase {
  constructor(
    private readonly users: IUserAdminRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(ctx: Readonly<RequestContext>, input: CreateUserInput): Promise<CreateUserResult> {
    const failWithCompensation = async (
      userId: string,
      message: string,
    ): Promise<CreateUserResult> => {
      const deleted = await this.users.deleteAuthUser(userId);
      if (!deleted.ok && !deleted.message.includes('not found')) {
        console.error(
          `[CREATE_USER_COMPENSATION_FAILED] orphaned auth user ${userId} could not be deleted: ${deleted.message}`,
        );
        await this.audit.record(ctx, {
          type: 'user_created',
          summary: 'User creation rolled back, orphaned auth account remains',
          details: { failure: message, compensation: 'auth_delete_failed' },
          riskLevel: 'critical',
          targetUserId: userId,
          outcome: 'failure',
        });
        return {
          success: false,
          error: `${message} (cleanup failed — orphaned auth account ${userId} needs manual removal)`,
        };
      }
      await this.audit.record(ctx, {
        type: 'user_created',
        summary: 'User creation rolled back cleanly (compensation applied)',
        details: { failure: message },
        riskLevel: 'medium',
        targetUserId: userId,
        outcome: 'failure',
      });
      return { success: false, error: message };
    };

    try {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        return { success: false, error: 'Could not determine admin tenant ID' };
      }

      const created = await this.users.createAuthUser({
        email: input.email,
        password: input.password || 'Temp1234!',
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone,
      });

      if (!created.ok) {
        await this.audit.record(ctx, {
          type: 'user_created',
          summary: 'Auth user creation rejected',
          details: { reason: created.message },
          riskLevel: 'medium',
          outcome: 'failure',
        });
        return { success: false, error: created.message };
      }
      const userId = created.userId;

      // Sync profile in the main DB via upsert (admin client bypasses RLS)
      const profileSync = await this.users.upsertProfile({
        id: userId,
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone,
        primary_role: input.primary_role,
        tenant_id: tenantId,
      });

      if (!profileSync.ok) {
        return await failWithCompensation(
          userId,
          'User created but profile sync failed: ' + profileSync.message,
        );
      }

      const roleId = await this.users.findRoleIdByName(input.primary_role);
      if (!roleId) {
        return await failWithCompensation(
          userId,
          `User created but role sync failed: role ${input.primary_role} was not found`,
        );
      }

      const roleSync = await this.users.assignRole({
        user_id: userId,
        role_id: roleId,
        tenant_id: tenantId,
        granted_by: ctx.userId,
      });

      if (!roleSync.ok) {
        return await failWithCompensation(
          userId,
          'User created but role sync failed: ' + roleSync.message,
        );
      }

      await this.audit.record(ctx, {
        type: 'user_created',
        summary: 'User created and onboarded',
        details: { role: input.primary_role },
        riskLevel: 'medium',
        targetUserId: userId,
      });

      return { success: true, userId };
    } catch (error: unknown) {
      console.error('createUserAction error:', error);
      await this.audit.record(ctx, {
        type: 'user_created',
        summary: 'User creation crashed unexpectedly',
        riskLevel: 'high',
        outcome: 'failure',
      });
      return { success: false, error: toClientMessage(error) };
    }
  }
}
