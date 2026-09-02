'use server';

import { requirePermission } from '@/adapters/actions/boundary';
import {
  ControlUserAccountUseCase,
  IssueWarningUseCase,
  TerminateUserSessionsUseCase,
} from '@/application/use-cases/users/account-control.use-case';
import { CreateUserUseCase } from '@/application/use-cases/users/create-user.use-case';
import { DeleteUserUseCase } from '@/application/use-cases/users/delete-user.use-case';
import { getErrorMessage } from '@/domain/errors';
import { CreateUserInput, createUserSchema } from '@/domain/schemas/user.schema';
import type { AccountAction } from '@/domain/types/user.types';
import { makeUserAdminRepository } from '@/infrastructure/repos/user-admin.repository';

/**
 * Thin Server-Action boundary for the user-lifecycle domain.
 *
 * Contract per action: validate (zod) → authenticate/authorize (shared
 * boundary gate) → execute use case → map response. All privileged DB
 * access (auth admin API, profile/role sync, control/terminate RPCs)
 * lives in infrastructure/repos/user-admin.repository.ts behind the
 * IUserAdminRepository port; business rules live in the use cases.
 */

/**
 * Creates a new user via Supabase Admin API natively.
 * Uses service role key for privileged operations.
 */
export async function createUserAction(data: CreateUserInput) {
  try {
    // 1. Validate input
    const parsed = createUserSchema.parse(data);

    // 2. Verify caller auth and permission (deny-by-default)
    const ctx = await requirePermission('users.write');

    // 3. Execute use case (tenant comes from the trusted caller context)
    return await new CreateUserUseCase(makeUserAdminRepository()).execute(ctx, parsed);
  } catch (error: unknown) {
    console.error('createUserAction error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Deletes a user permanently via Supabase Admin API.
 * Falls back to soft-delete if auth deletion fails.
 */
export async function deleteUserAction(userId: string) {
  try {
    // Verify caller auth and permission
    await requirePermission('users.write');

    // Execute use case (auth deletion + soft-delete fallback policy)
    return await new DeleteUserUseCase(makeUserAdminRepository()).execute(userId);
  } catch (error: unknown) {
    console.error('deleteUserAction error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Control a user account (lock/unlock/suspend/ban) via the v13 RPC.
 *
 * v13: `control_user_account` has PUBLIC EXECUTE revoked; requires service_role.
 * Callers must be authenticated and hold the `users.lock` permission.
 */
export async function controlUserAccountAction(
  userId: string,
  action: AccountAction,
  reason?: string,
  suspendHours?: number,
): Promise<{ success: boolean; accountStatus?: string; until?: string; error?: string }> {
  try {
    await requirePermission('users.lock');
    return await new ControlUserAccountUseCase(makeUserAdminRepository()).execute(
      userId,
      action,
      reason,
      suspendHours,
    );
  } catch (error: unknown) {
    console.error('controlUserAccountAction error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Terminate all active sessions for a user via the v13 RPC.
 *
 * v13: `terminate_user_sessions` has PUBLIC EXECUTE revoked; requires service_role.
 * Callers must be authenticated and hold the `sessions.manage` permission.
 */
export async function terminateUserSessionsAction(
  userId: string,
  reason?: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission(['sessions.manage', 'users.write']);
    return await new TerminateUserSessionsUseCase(makeUserAdminRepository()).execute(
      userId,
      reason,
    );
  } catch (error: unknown) {
    console.error('terminateUserSessionsAction error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function issueWarningAction(
  userId: string,
  reason: string,
  severity: 1 | 2 | 3,
  action: string = 'none',
): Promise<{ success: boolean; warningId?: string; error?: string }> {
  try {
    await requirePermission('warnings.write');
    return await new IssueWarningUseCase(makeUserAdminRepository()).execute(
      userId,
      reason,
      severity,
      action,
    );
  } catch (error: unknown) {
    console.error('issueWarningAction error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}
