import { env } from '@/lib/env.client';

/**
 * PHASE 2.3 (G2 fix): explicit session-cookie options for every Supabase
 * client that reads/writes the auth cookies.
 *
 * @supabase/ssr's DEFAULT_COOKIE_OPTIONS set `sameSite: "lax"` but leave
 * `Secure` unset — the session cookies (which carry the JWT access/refresh
 * tokens) would be written without the Secure attribute in production and
 * could leak over a plaintext downgrade request.
 *
 * Kept at library defaults deliberately:
 * - `sameSite: "lax"` — CSRF posture for cookie-authenticated POSTs.
 * - `httpOnly: false` — library-by-design: the browser client must write
 *   the refreshed token via document.cookie. The residual XSS-read risk is
 *   mitigated by the strict nonce-based CSP and the absence of HTML sinks
 *   (no dangerouslySetInnerHTML / markdown rendering in the app).
 */
export function sessionCookieOptions() {
  return {
    secure: env.NEXT_PUBLIC_APP_ENV !== 'development',
  };
}
