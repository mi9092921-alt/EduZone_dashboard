import * as Sentry from '@sentry/nextjs';

import { getServerEnv } from '@/lib/env';


/**
 * Next.js instrumentation hook — runs once per server runtime at boot,
 * before any request is handled. Used here for fail-fast validation of
 * server-side environment variables.
 *
 * SECURITY FIX (2026-09-12): previously the server env schema marked
 * `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` as `.optional()`, so a
 * production deployment could boot healthy and then fail silently at
 * runtime — the cron endpoint would 401 forever (Vercel cron would
 * keep hitting /api/cron/routine every 5 min, never alerting), and the
 * first admin action that needed `createAdminClient()` would throw a
 * generic 500. `getServerEnv()` now picks a strict schema in production
 * and a lenient one in dev/test; calling it from `register()` makes
 * the boot-time check actually fire, so a misconfigured production
 * deploy fails immediately instead of degrading silently.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fail-fast: validate server env on boot. In production this throws
    // if SUPABASE_SERVICE_ROLE_KEY or CRON_SECRET is missing; in dev/test
    // it is lenient. Must run BEFORE the Sentry import below so a
    // misconfigured deploy doesn't even initialize Sentry with an
    // incomplete environment.
    getServerEnv();
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // The Edge runtime does not have access to most Node env vars, and
    // the edge Sentry config is light enough that we don't need the same
    // fail-fast contract here. The nodejs runtime check above is the
    // authoritative boot-time gate.
    await import('../sentry.edge.config');
  }
}

/**
 * The M10 taxonomy masks raw DB/infra causes from clients (the message stays
 * generic — "An unexpected error occurred. Please try again."), and the
 * unmasked text rides along on the error instance as a non-enumerable
 * `internalDetail` (see domain/errors/taxonomy.ts). Enrich the captured
 * request error with it so the masked 500s — previously opaque 18-event
 * Sentry issues — stay diagnosable without ever leaking the detail to a
 * client response.
 */
export function onRequestError(
  error: unknown,
  request: Parameters<typeof Sentry.captureRequestError>[1],
  context: Parameters<typeof Sentry.captureRequestError>[2],
): void {
  const detail =
    typeof error === 'object' && error !== null && 'internalDetail' in error
      ? (error as { internalDetail?: unknown }).internalDetail
      : undefined;

  if (typeof detail === 'string' && detail.length > 0) {
    Sentry.withScope((scope) => {
      scope.setExtra('internal_detail', detail);
      Sentry.captureRequestError(error, request, context);
    });
    return;
  }

  Sentry.captureRequestError(error, request, context);
}
