import * as Sentry from '@sentry/nextjs';

// SENTRY FIX (2026-09-12): Next.js 15.x deprecated `sentry.client.config.ts`
// in favor of `instrumentation-client.ts` (the client-side counterpart of
// `instrumentation.ts`). With Turbopack builds the old filename is silently
// ignored, which would leave Sentry uninitialized in production with no
// error to signal it. This file is loaded once per browser session before
// the first page hydrates.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    debug: false,
  });
}

// SENTRY FIX (2026-09-12): @sentry/nextjs v10.73+ requires this export to
// instrument client-side route transitions (App Router navigation spans).
// Without it the build emits `ACTION REQUIRED: To instrument navigations,
// the Sentry SDK requires you to export an 'onRouterTransitionStart' hook
// from your 'instrumentation-client.(js|ts)' file.` and Sentry shows
// gaps in trace continuity for every page navigation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
