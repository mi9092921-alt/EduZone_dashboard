import type { ErrorEvent, EventHint } from '@sentry/nextjs';

const SENSITIVE_KEY = /password|passwd|secret|token|authorization|cookie|apikey|api_key|email|phone/i;

export function shouldDropSentryEvent(event: ErrorEvent): boolean {
  const exceptionMessages = (event.exception?.values ?? [])
    .map((value) => `${value.type ?? ''} ${value.value ?? ''}`)
    .join(' ');

  // Navigation/fetch cancellations are expected and authorization failures
  // are handled by the UI (redirect, gate, or toast). Neither is an
  // unhandled application fault worth retaining as a Sentry issue.
  return /\b(?:AbortError|aborted|request aborted|Authentication required|User profile not found or inactive|Permission denied|Super admin access required)\b/i.test(
    exceptionMessages,
  );
}

// Client-only network-level fetch rejections, per browser engine: Chrome
// "Failed to fetch", Safari "Load failed", Firefox "NetworkError when
// attempting to fetch resource". The app already surfaces these to users via
// toasts and query error states, and the overwhelming majority are request
// cancellations riding along with route transitions or tab unloads — same
// rationale as the filter above. Real server-side faults keep flowing: Node
// (undici) reports them as "fetch failed", which this regex never matches.
const CLIENT_FETCH_FAILURE_RE =
  /\b(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource)\b/;

export function shouldDropClientSentryEvent(event: ErrorEvent): boolean {
  if (shouldDropSentryEvent(event)) return true;

  const exceptionMessages = (event.exception?.values ?? [])
    .map((value) => `${value.type ?? ''} ${value.value ?? ''}`)
    .join(' ');
  return CLIENT_FETCH_FAILURE_RE.test(exceptionMessages);
}

function scrubRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : value]),
  );
}

/** Remove identity, credentials and request payloads before an event leaves the app. */
export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Fetches and Server Actions are routinely cancelled during App Router
  // transitions. They are not application failures and otherwise create a
  // steadily growing Sentry issue whenever a user leaves a loading page.
  if (shouldDropSentryEvent(event)) return null;

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
