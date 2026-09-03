'use server';

import { assertSameTenant, requirePermission } from '@/adapters/actions/boundary';
import {
  ControlUserAccountUseCase,
  IssueWarningUseCase,
  TerminateUserSessionsUseCase,
} from '@/application/use-cases/users/account-control.use-case';
import { CreateUserUseCase } from '@/application/use-cases/users/create-user.use-case';
import { DeleteUserUseCase } from '@/application/use-cases/users/delete-user.use-case';
import { toClientMessage } from '@/domain/errors';
import { CreateUserInput, createUserSchema } from '@/domain/schemas/user.schema';
import type { AccountAction } from '@/domain/types/user.types';
import { makeAuditLogger } from '@/infrastructure/observability/audit-logger.service';
import { makeUserAdminRepository } from '@/infrastructure/repos/user-admin.repository';
import * as usersService from '@/infrastructure/repos/users.service';

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
    return await new CreateUserUseCase(makeUserAdminRepository(), makeAuditLogger()).execute(
      ctx,
      parsed,
    );
  } catch (error: unknown) {
    console.error('createUserAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}

/**
 * Deletes a user permanently via Supabase Admin API.
 * Falls back to soft-delete if auth deletion fails.
 */
export async function deleteUserAction(userId: string) {
  try {
    // Verify caller auth and permission
    const ctx = await requirePermission('users.write');

    // IDOR/BOLA guard: block deleting a user outside the caller's tenant
    // (super_admin exempt — see assertSameTenant). Deletion goes through the
    // Admin Auth API directly (not an RLS/tenant-scoped RPC), so this check
    // must happen here at the boundary.
    assertSameTenant(ctx, await usersService.getUserTenantId(userId));

    // Execute use case (auth deletion + soft-delete fallback policy)
    return await new DeleteUserUseCase(makeUserAdminRepository(), makeAuditLogger()).execute(
      ctx,
      userId,
    );
  } catch (error: unknown) {
    console.error('deleteUserAction error:', error);
    return { success: false, error: toClientMessage(error) };
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
    const ctx = await requirePermission('users.lock');
    return await new ControlUserAccountUseCase(makeUserAdminRepository(), makeAuditLogger()).execute(
      ctx,
      userId,
      action,
      reason,
      suspendHours,
    );
  } catch (error: unknown) {
    console.error('controlUserAccountAction error:', error);
    return { success: false, error: toClientMessage(error) };
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
    const ctx = await requirePermission(['sessions.manage', 'users.write']);
    return await new TerminateUserSessionsUseCase(makeUserAdminRepository(), makeAuditLogger()).execute(
      ctx,
      userId,
      reason,
    );
  } catch (error: unknown) {
    console.error('terminateUserSessionsAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}

export async function issueWarningAction(
  userId: string,
  reason: string,
  severity: 1 | 2 | 3,
  action: string = 'none',
): Promise<{ success: boolean; warningId?: string; error?: string }> {
  try {
    const ctx = await requirePermission('warnings.write');
    return await new IssueWarningUseCase(makeUserAdminRepository(), makeAuditLogger()).execute(
      ctx,
      userId,
      reason,
      severity,
      action,
    );
  } catch (error: unknown) {
    console.error('issueWarningAction error:', error);
    return { success: false, error: toClientMessage(error) };
  }
}
