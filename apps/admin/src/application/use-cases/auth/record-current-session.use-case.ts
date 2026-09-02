import type { ISessionRepository } from '@/application/ports/ISessionRepository';
import { getErrorMessage } from '@/domain/errors';

export interface RecordSessionResult {
  success: boolean;
  active?: boolean;
  error?: string;
}

/**
 * RecordCurrentSessionUseCase — the login/session heartbeat.
 *
 * Business rules (moved verbatim from the former fat server action):
 *  1. Only active, non-deleted accounts may hold sessions.
 *  2. Existing active session → touch (updated_at) + last_login bump
 *     (best-effort — last_login failures never fail the heartbeat).
 *  3. New session → insert row with client metadata (IP / user agent
 *     captured at the boundary) + record login stats (count increment).
 *  4. Request metadata is passed IN — this use case never touches
 *     Next.js request APIs (framework-free application layer).
 */
export class RecordCurrentSessionUseCase {
  constructor(private readonly sessions: ISessionRepository) {}

  async execute(params: {
    userId: string;
    sessionId: string;
    clientIp: string | null;
    userAgent: string | null;
  }): Promise<RecordSessionResult> {
    const { userId, sessionId, clientIp, userAgent } = params;
    const now = new Date().toISOString();

    let profile;
    try {
      profile = await this.sessions.getProfile(userId);
    } catch {
      return { success: false, active: false, error: 'User is not active' };
    }

    if (!profile || profile.deleted_at || profile.account_status !== 'active') {
      return { success: false, active: false, error: 'User is not active' };
    }

    let existing;
    try {
      existing = await this.sessions.findSession(sessionId, userId);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }

    if (existing) {
      if (!existing.is_active || existing.deleted_at) {
        return { success: false, active: false, error: 'Session is inactive' };
      }

      try {
        await this.sessions.touchSession(sessionId, userId, now);
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }

      try {
        await this.sessions.bumpLastLogin(userId, now);
      } catch {
        // last_login refresh is best-effort on the heartbeat path
      }

      return { success: true, active: true };
    }

    try {
      await this.sessions.createSession({
        id: sessionId,
        user_id: userId,
        tenant_id: profile.tenant_id,
        region_id: profile.region_id,
        ip_address: clientIp,
        user_agent: userAgent,
        started_at: now,
      });
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }

    try {
      await this.sessions.recordLogin(userId, now, profile.login_count ?? 0);
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }

    return { success: true, active: true };
  }
}
