import * as Sentry from '@sentry/nextjs';

import { scrubSentryEvent } from './src/lib/sentry';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    debug: false,
    beforeSend: scrubSentryEvent,
  });
}
