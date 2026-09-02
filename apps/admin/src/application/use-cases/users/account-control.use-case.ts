import type { IUserAdminRepository } from '@/application/ports/IUserAdminRepository';
import { toClientMessage } from '@/domain/errors';
import type { AccountAction } from '@/domain/types/user.types';

export interface ControlAccountResult {
  success: boolean;
  accountStatus?: string;
  until?: string;
  error?: string;
}

export interface TerminateSessionsResult {
  success: boolean;
  count?: number;
  error?: string;
}

export interface IssueWarningResult {
  success: boolean;
  warningId?: string;
  error?: string;
}

/**
 * Privileged account-control use cases backed by v13 RPCs whose PUBLIC
 * EXECUTE has been revoked (service-role only):
 *  - ControlUserAccountUseCase   → control_user_account
 *  - TerminateUserSessionsUseCase → terminate_user_sessions
 *  - IssueWarningUseCase          → issue_warning (RLS-backed server client)
 *
 * Error policy (unchanged from the former actions): RPC failures log a
 * specific prefix server-side and map to a generic success:false result;
 * unexpected failures log the action-level prefix.
 */
export class ControlUserAccountUseCase {
  constructor(private readonly users: IUserAdminRepository) {}

  async execute(
    userId: string,
    action: AccountAction,
    reason?: string,
    suspendHours?: number,
  ): Promise<ControlAccountResult> {
    try {
      const result = await this.users.controlAccount({
        userId,
        action,
        reason: reason ?? null,
        suspendHours: suspendHours ?? null,
      });

      return {
        success: true,
        ...(result?.status !== undefined && { accountStatus: result.status }),
        ...(result?.until !== undefined && { until: result.until }),
      };
    } catch (rpcError) {
      console.error(`[controlUserAccountAction] ${action} on ${userId} failed:`, rpcError);
      return { success: false, error: toClientMessage(rpcError) };
    }
  }
}

export class TerminateUserSessionsUseCase {
  constructor(private readonly users: IUserAdminRepository) {}

  async execute(userId: string, reason?: string): Promise<TerminateSessionsResult> {
    try {
      const count = await this.users.terminateSessions(userId, reason ?? 'admin_terminated');
      return { success: true, count: count ?? 0 };
    } catch (rpcError) {
      console.error(
        `[terminateUserSessionsAction] terminate sessions for ${userId} failed:`,
        rpcError,
      );
      return { success: false, error: toClientMessage(rpcError) };
    }
  }
}

export class IssueWarningUseCase {
  constructor(private readonly users: IUserAdminRepository) {}

  async execute(
    userId: string,
    reason: string,
    severity: 1 | 2 | 3,
    action: string = 'none',
  ): Promise<IssueWarningResult> {
    try {
      const warningId = await this.users.issueWarning({
        userId,
        reason,
        severity,
        note: action && action !== 'none' ? action : null,
      });
      return { success: true, warningId };
    } catch (rpcError) {
      console.error(`[issueWarningAction] warning for ${userId} failed:`, rpcError);
      return { success: false, error: toClientMessage(rpcError) };
    }
  }
}
