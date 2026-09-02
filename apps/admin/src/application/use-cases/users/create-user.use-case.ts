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
 */
export class CreateUserUseCase {
  constructor(private readonly users: IUserAdminRepository) {}

  async execute(ctx: Readonly<RequestContext>, input: CreateUserInput): Promise<CreateUserResult> {
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
        await this.users.deleteAuthUser(userId);
        return {
          success: false,
          error: 'User created but profile sync failed: ' + profileSync.message,
        };
      }

      const roleId = await this.users.findRoleIdByName(input.primary_role);
      if (!roleId) {
        await this.users.deleteAuthUser(userId);
        return {
          success: false,
          error: `User created but role sync failed: role ${input.primary_role} was not found`,
        };
      }

      const roleSync = await this.users.assignRole({
        user_id: userId,
        role_id: roleId,
        tenant_id: tenantId,
        granted_by: ctx.userId,
      });

      if (!roleSync.ok) {
        await this.users.deleteAuthUser(userId);
        return {
          success: false,
          error: 'User created but role sync failed: ' + roleSync.message,
        };
      }

      return { success: true, userId };
    } catch (error: unknown) {
      console.error('createUserAction error:', error);
      return { success: false, error: toClientMessage(error) };
    }
  }
}
