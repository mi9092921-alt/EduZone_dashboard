import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CreateSessionInput,
  ISessionRepository,
  SessionProfileRow,
  SessionRow,
} from '@/application/ports/ISessionRepository';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Supabase implementation of ISessionRepository.
 *
 * Uses the service-role (admin) client — the sessions table is managed
 * server-side; every read is scoped to the owning user_id (same access
 * pattern as the original inline action code).
 */
export function makeSessionRepository(admin: SupabaseClient = createAdminClient()): ISessionRepository {
  return {
    async getProfile(userId: string): Promise<SessionProfileRow | null> {
      const { data: profile, error: profileError } = await admin
        .from('users')
        .select('id, tenant_id, region_id, deleted_at, account_status, login_count')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      return (profile as SessionProfileRow | null) ?? null;
    },

    async findSession(sessionId: string, userId: string): Promise<SessionRow | null> {
      const { data: existing, error: existingError } = await admin
        .from('sessions')
        .select('id, is_active, deleted_at')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) throw existingError;
      return (existing as SessionRow | null) ?? null;
    },

    async touchSession(sessionId: string, userId: string, at: string): Promise<void> {
      const { error } = await admin
        .from('sessions')
        .update({ updated_at: at })
        .eq('id', sessionId)
        .eq('user_id', userId);
      if (error) throw error;
    },

    async bumpLastLogin(userId: string, at: string): Promise<void> {
      await admin.from('users').update({ last_login: at }).eq('id', userId);
    },

    async createSession(input: CreateSessionInput): Promise<void> {
      const { error } = await admin.from('sessions').insert({
        id: input.id,
        user_id: input.user_id,
        tenant_id: input.tenant_id,
        region_id: input.region_id,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
        is_active: true,
        started_at: input.started_at,
        updated_at: input.started_at,
      });
      if (error) throw error;
    },

    async recordLogin(userId: string, at: string, previousLoginCount: number): Promise<void> {
      const { error } = await admin.from('users').update({
        last_login: at,
        login_count: previousLoginCount + 1,
      }).eq('id', userId);
      if (error) throw error;
    },
  };
}
