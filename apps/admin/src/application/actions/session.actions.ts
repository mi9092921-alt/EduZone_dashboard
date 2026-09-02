'use server';

import { headers } from 'next/headers';

import { requireUser } from '@/application/actions/boundary';
import { RecordCurrentSessionUseCase } from '@/application/use-cases/auth/record-current-session.use-case';
import { makeSessionRepository } from '@/infrastructure/repos/session.repository';

/**
 * Thin Server-Action boundary for the session heartbeat.
 *
 * Contract: validate → authenticate → extract request metadata (boundary
 * concern) → execute use case. Session business rules (active-account
 * check, touch-vs-create, login counting) live in
 * RecordCurrentSessionUseCase; DB access lives in the ISessionRepository
 * implementation (infrastructure/repos/session.repository.ts).
 */

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getClientIp(headerStore: Awaited<ReturnType<typeof headers>>) {
  const forwarded = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headerStore.get('x-real-ip') || null;
}

export async function recordCurrentSessionAction(sessionId: string): Promise<{
  success: boolean;
  active?: boolean;
  error?: string;
}> {
  // 1. Validate input format
  if (!SESSION_ID_RE.test(sessionId)) {
    return { success: false, error: 'Invalid session id' };
  }

  // 2. Authenticate caller
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  // 3. Extract request metadata (stays at the boundary — not business logic)
  const headerStore = await headers();

  // 4. Execute use case
  return new RecordCurrentSessionUseCase(makeSessionRepository()).execute({
    userId,
    sessionId,
    clientIp: getClientIp(headerStore),
    userAgent: headerStore.get('user-agent'),
  });
}
