import 'server-only';

import { notFound } from 'next/navigation';

import { SEGMENT_ROLES, type ProtectedSegment } from '@/config/route-access.config';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Server-side page guard (PHASE 2.4/2.5 — G1 fix).
 *
 * Middleware only authenticates; `AdminShell`/Sidebar role checks are
 * client-side UI. This guard closes the gap: every privileged route segment
 * calls it from its `layout.tsx`, and it re-derives identity + role from the
 * server session before the segment renders. A denied user gets the 404
 * boundary — no data, no shell, no enumeration signal.
 *
 * Defense in depth (this guard is UX/boundary hardening, NOT the
 * authorization authority): RLS + server-action permission gates +
 * `validate_user_session()` remain the actual data controls.
 */
export async function requirePageAccess(segment: ProtectedSegment): Promise<void> {
  const supabase = await createServerClient();

  // A throwing getUser (malformed session state) must deny the same way as
  // an invalid session — never propagate an unhandled rejection past the
  // server boundary.
  let userId: string;
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) notFound();
    userId = userData.user.id;
  } catch (err) {
    if (err instanceof Error && 'digest' in err && err.digest === 'NEXT_NOT_FOUND') throw err;
    notFound();
  }

  // Role and account state always come from the DB profile keyed by the
  // server-validated auth.uid() — never from client input or JWT claims.
  const { data: profile } = await supabase
    .from('users')
    .select('primary_role, account_status')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile || profile.account_status !== 'active') notFound();

  const allowed = SEGMENT_ROLES[segment];
  if (!(allowed as readonly string[]).includes(profile.primary_role as string)) notFound();
}
