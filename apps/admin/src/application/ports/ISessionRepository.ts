/**
 * Port — session heartbeat persistence for `recordCurrentSessionAction`.
 *
 * All access historically used the admin (service-role) client with
 * explicit user_id scoping; implementations must preserve that.
 */

/** Profile fields required to decide session/heartbeat eligibility */
export interface SessionProfileRow {
  tenant_id: string | null;
  region_id: string | null;
  deleted_at: string | null;
  account_status: string | null;
  login_count: number | null;
}

/** Status fields of an existing session row */
export interface SessionRow {
  is_active: boolean;
  deleted_at: string | null;
}

/** Payload for creating a new session row */
export interface CreateSessionInput {
  id: string;
  user_id: string;
  tenant_id: string | null;
  region_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  started_at: string;
}

export interface ISessionRepository {
  /** Fetches the profile row used for active-account validation. */
  getProfile(userId: string): Promise<SessionProfileRow | null>;

  /** Finds the caller's own session row by id (user_id scoped). */
  findSession(sessionId: string, userId: string): Promise<SessionRow | null>;

  /** Touches an existing session (updated_at bump). */
  touchSession(sessionId: string, userId: string, at: string): Promise<void>;

  /** Updates last_login only (heartbeat path — no login-count increment). */
  bumpLastLogin(userId: string, at: string): Promise<void>;

  /** Inserts a new active session row. */
  createSession(input: CreateSessionInput): Promise<void>;

  /** Records a fresh login: last_login bump + login_count increment. */
  recordLogin(userId: string, at: string, previousLoginCount: number): Promise<void>;
}
