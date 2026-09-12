import type { NextRequest } from 'next/server';

/**
 * CSP Nonce Helper
 *
 * SENTRY/CSP FIX (2026-09-12): the previous CSP in `vercel.json` allowed
 * `'unsafe-inline'` for `script-src` to keep Next.js's inline runtime
 * chunks working. That defeats one of CSP's main goals: blocking injected
 * <script> tags from an XSS. We now generate a per-request nonce in the
 * Edge middleware and inject it as `'nonce-<value>'` in the CSP header
 * AND onto every <script> tag Next.js emits via the `nonce` property on
 * the response/request (Next.js 15 reads it from `headers()` and threads
 * it through React's render of <Script> components and inline chunks).
 *
 * Algorithm: Web Crypto `crypto.subtle.digest('SHA-256', randomBytes)`
 * produces 32 bytes of strong randomness, base64-encoded to 44 chars.
 * This matches the OWASP-recommended nonce length (≥128 bits).
 */

const NONCE_HEADER = 'x-nonce';

export function generateCspNonce(): string {
  // crypto.getRandomValues is available in both Edge Runtime (middleware)
  // and Node.js (server components). 16 bytes = 128 bits of entropy.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 encode: 16 bytes -> 24 chars (no padding needed for nonces).
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Origins the browser is allowed to talk to for the configured Supabase
 * project (REST/auth/realtime all share one origin; realtime swaps the
 * scheme to ws/wss).
 *
 * The `*.supabase.co` wildcard in the directives below cannot match the
 * disposable LOCAL stack (http://127.0.0.1:54321) that CI/local-dev uses:
 * a schemeless CSP host-source matches only hostnames, never a bare IP.
 * Without the exact origin here, the Edge middleware's CSP header makes
 * the browser block every supabase-js request with "Failed to fetch"
 * (observed as the e2e auth.setup failing at the login banner). In
 * production the value is the project's https://<ref>.supabase.co origin,
 * which the wildcard already covers — so this adds nothing there.
 *
 * Read straight from process.env (build-time inlined, Edge-safe): this
 * module is imported by the middleware, where src/lib/env.ts's
 * throw-on-import validation must not run — hence the defensive parse.
 */
function supabaseConnectSources(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const origin = new URL(raw).origin;
    return [origin, origin.replace(/^http/, 'ws')];
  } catch {
    return [];
  }
}

export function buildCspHeader(nonce: string): string {
  // CSP Level 3 with strict-dynamic: scripts tagged with the nonce may
  // load additional scripts without each one needing its own nonce
  // (required for Next.js's dynamic import chunks).
  //
  // 'unsafe-inline' is intentionally omitted from script-src — it is
  // ignored by browsers anyway when a nonce is present, and removing it
  // explicitly is the whole point of the migration. For style-src we
  // keep 'unsafe-inline' because Next.js + MUI + Tailwind inject styles
  // at runtime via <style> tags that don't carry nonces (CSS nonce
  // support is still spotty across browsers as of late 2026).
  const [supabaseOrigin, supabaseWsOrigin] = supabaseConnectSources();
  // http(s) origin: needed for connect-src always; for img-src only when
  // the origin is plain http (local stack) — https:// hosts are already
  // covered by the `https:` scheme-source in img-src.
  const httpOrigin = supabaseOrigin ?? '';
  const imgExtra = httpOrigin.startsWith('http:') ? ` ${httpOrigin}` : '';
  const connectExtra = supabaseOrigin
    ? ` ${supabaseOrigin}${supabaseWsOrigin ? ` ${supabaseWsOrigin}` : ''}`
    : '';
  return [
    "default-src 'self'",
    // `nonce-<value>` + 'strict-dynamic' is the CSP3 recommended combo.
    // 'strict-dynamic' lets a nonce-bearing script bootstrap others.
    // The *.supabase.co allow-list is for the Supabase Auth SDK which
    // may inject its own script tags during OAuth flows.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' *.supabase.co`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' *.supabase.co wss://*.supabase.co *.sentry.io${connectExtra}`,
    "font-src 'self' data:",
    `img-src 'self' data: https:${imgExtra}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function getNonceFromRequest(request: NextRequest): string | null {
  return request.headers.get(NONCE_HEADER);
}

export const NONCE_REQUEST_HEADER = NONCE_HEADER;
