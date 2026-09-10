import { container } from '@/container';
import type { Session } from '@/domain/types/user.types';

/**
 * Service for fetching a user's login sessions (IP + region + started_at).
 * Read-only. Row access is enforced by RLS (`sessions_select_policy`):
 * self or admin with a valid session.
 */
export async function getUserSessions(userId: string, limit = 20): Promise<Session[]> {
  const { supabase } = container;

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data as Session[];
}
