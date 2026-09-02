import type { AccountAction } from '@/domain/types/user.types';

/**
 * Port — user lifecycle operations that require elevated (service-role)
 * privileges: auth-user creation/deletion, profile & role sync, account
 * control RPCs, session termination, and warning issuance.
 *
 * Methods return discriminated results (instead of throwing) where the
 * caller historically needed to branch on the DB error and apply
 * compensation — keep exact messages so client contracts stay stable.
 */

/** Generic step result carrying the raw DB error message when failed */
export interface StepResult {
  ok: boolean;
  message?: string;
}

/** Input for auth-user creation (Supabase Admin API) */
export interface CreateAuthUserInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string | undefined;
}

/** Input for profile sync (public.users upsert) */
export interface UpsertProfileInput {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | undefined;
  primary_role: string;
  tenant_id: string;
}

/** Input for role assignment (public.user_roles upsert) */
export interface AssignRoleInput {
  user_id: string;
  role_id: string;
  tenant_id: string;
  granted_by: string;
}

/** Input for the control_user_account privileged RPC */
export interface ControlAccountInput {
  userId: string;
  action: AccountAction;
  reason: string | null;
  suspendHours: number | null;
}

/** Input for the issue_warning RPC */
export interface IssueWarningInput {
  userId: string;
  reason: string;
  severity: 1 | 2 | 3;
  note: string | null;
}

export interface IUserAdminRepository {
  /**
   * Creates an auth user (email confirmed). Returns the new auth user id,
   * or the raw error message on failure.
   */
  createAuthUser(input: CreateAuthUserInput): Promise<{ ok: true; userId: string } | { ok: false; message: string }>;

  /** Syncs the public.users profile row (admin client bypasses RLS). */
  upsertProfile(input: UpsertProfileInput): Promise<StepResult>;

  /** Looks up a role id by role name. Returns null when missing or on error. */
  findRoleIdByName(name: string): Promise<string | null>;

  /** Assigns an active role to the user within the tenant. */
  assignRole(input: AssignRoleInput): Promise<StepResult>;

  /** Deletes the auth user. Returns the raw error message when it fails. */
  deleteAuthUser(userId: string): Promise<{ ok: true } | { ok: false; message: string }>;

  /** Soft-deletes (hides) the profile row: deleted_at + account_status = banned. */
  softDeleteProfile(userId: string): Promise<void>;

  /**
   * Runs the control_user_account RPC (lock/unlock/suspend/ban).
   * Returns the RPC jsonb payload { status, until }.
   */
  controlAccount(input: ControlAccountInput): Promise<{ status?: string; until?: string } | null>;

  /** Runs the terminate_user_sessions RPC. Returns the terminated count. */
  terminateSessions(userId: string, reason: string): Promise<number | null>;

  /** Runs the issue_warning RPC. Returns the new warning id. */
  issueWarning(input: IssueWarningInput): Promise<string>;
}
