import type { ErrorEvent, EventHint } from '@sentry/nextjs';

const SENSITIVE_KEY = /password|passwd|secret|token|authorization|cookie|apikey|api_key|email|phone/i;

function scrubRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : value]),
  );
}

/** Remove identity, credentials and request payloads before an event leaves the app. */
export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  delete event.user;
  if (event.request) {
    const requestUrl = event.request.url;
    if (requestUrl) event.request.url = requestUrl.split('?')[0] as string;
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
    const headers = scrubRecord(event.request.headers as Record<string, string> | undefined);
    if (headers) event.request.headers = headers;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
      const data = scrubRecord(breadcrumb.data as Record<string, string> | undefined);
      if (data) breadcrumb.data = data;
      else delete breadcrumb.data;
      return breadcrumb;
    });
  }
  return event;
}
