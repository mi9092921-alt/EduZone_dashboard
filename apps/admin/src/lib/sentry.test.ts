import { describe, expect, it } from 'vitest';

import { scrubSentryEvent, shouldDropSentryEvent } from './sentry';

/**
 * PHASE 2.23/2.31: Sentry must never exfiltrate credentials, cookies, or
 * request payloads. These tests pin the scrubber's contract — a regression
 * here is a PII/secret leak to a third party.
 */
describe('scrubSentryEvent (2.23 PII/secret scrubbing)', () => {
  it('removes user identity, cookies, query strings and request bodies', () => {
    const event = scrubSentryEvent(
      {
        user: { id: 'u1', email: 'a@b.c' },
        request: {
          url: 'https://admin.example.com/users?search=someone',
          query_string: 'search=someone',
          cookies: 'sb-access-token=abc',
          data: { password: 'x' },
          headers: {
            authorization: 'Bearer abc',
            cookie: 'sb-access-token=abc',
            'content-type': 'application/json',
          },
        },
      } as never,
      {},
    );

    expect(event).not.toBeNull();
    expect(event?.user).toBeUndefined();
    expect(event?.request?.url).toBe('https://admin.example.com/users');
    expect(event?.request?.query_string).toBeUndefined();
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.data).toBeUndefined();
    expect(event?.request?.headers?.authorization).toBe('[REDACTED]');
    expect(event?.request?.headers?.cookie).toBe('[REDACTED]');
    expect(event?.request?.headers?.['content-type']).toBe('application/json');
  });

  it('redacts sensitive breadcrumb data', () => {
    const event = scrubSentryEvent(
      {
        breadcrumbs: [{ data: { token: 'abc', page: 'users' } }],
      } as never,
      {},
    );

    expect(event?.breadcrumbs?.[0]?.data).toEqual({ token: '[REDACTED]', page: 'users' });
  });

  it('drops routine auth/cancellation noise instead of retaining it', () => {
    expect(
      shouldDropSentryEvent({
        exception: { values: [{ type: 'Error', value: 'Permission denied' }] },
      } as never),
    ).toBe(true);
    expect(
      shouldDropSentryEvent({
        exception: { values: [{ type: 'Error', value: 'Unexpected database fault' }] },
      } as never),
    ).toBe(false);
  });
});
