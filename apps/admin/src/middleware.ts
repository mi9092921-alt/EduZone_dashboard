import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

import { updateSession } from '@/infrastructure/supabase/middleware';
import { buildCspHeader, generateCspNonce, NONCE_REQUEST_HEADER } from '@/lib/csp-nonce';

const handleI18nRouting = createMiddleware(routing);

/**
 * Next.js Middleware — runs on every request.
 * Composes next-intl localized routing with Supabase session management
 * and injects a per-request CSP nonce (CSP FIX 2026-09-12).
 */
export async function middleware(request: NextRequest) {
  // 0. Skip API routes — they don't need i18n or auth session handling
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // ── CSP nonce (per-request) ───────────────────────────────────
  // Generated in the Edge and forwarded to the app via a request header.
  // `headers()` in app/[locale]/layout.tsx reads it back and threads the
  // nonce through React's render of <Script> tags and inline chunks.
  // The same nonce is set on the response CSP header so the browser only
  // accepts scripts that carry this exact nonce attribute.
  const nonce = generateCspNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_REQUEST_HEADER, nonce);

  // Rewrite the incoming request so the app sees the nonce header.
  const midRequest = new NextRequest(request, { headers: requestHeaders });

  // 1. Handle i18n routing first (against the rewritten request so any
  // downstream handler also sees the nonce).
  const response = handleI18nRouting(midRequest);

  // 2. Refresh Supabase session and enforce auth redirects.
  // Pass the i18n response to preserve locale cookies.
  const authedResponse = await updateSession(midRequest, response);

  // 3. Apply the CSP header to the final response. We deliberately set
  // it AFTER auth so a redirect to /login also carries a valid CSP —
  // otherwise the login page would ship without any CSP at all.
  authedResponse.headers.set('Content-Security-Policy', buildCspHeader(nonce));
  // The nonce header itself is also exposed on the response so client
  // components that need to inject <script> tags directly (e.g. MUI's
  // Emotion cache) can read it without an extra round trip.
  authedResponse.headers.set(NONCE_REQUEST_HEADER, nonce);

  return authedResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
  // EDGE-RUNTIME NOTE (2026-09-12): @supabase/ssr → @supabase/supabase-js
  // reads `process.version` at module load (for environment detection /
  // telemetry only — no behavioral dependency on it). Next.js emits a
  // build-time warning: "A Node.js API is used (process.version) which
  // is not supported in the Edge Runtime."
  //
  // The warning is benign: supabase-js guards the access with
  // `typeof process !== 'undefined' && process.version`, which safely
  // resolves to `undefined` in the Edge Runtime and never throws.
  //
  // `unstable_allowDynamic` does NOT silence the warning (it only
  // suppresses dynamic-code-evaluation errors, not Node-API usage
  // warnings), but it IS the documented escape hatch for letting these
  // modules bundle without hard-failing the build. The warning will
  // remain in `next build` output until supabase-js removes the
  // `process.version` reference upstream (tracked in
  // https://github.com/supabase/supabase-js/issues/1552 — closed via
  // PR #1998, but the guarded, telemetry-only reference still ships in
  // supabase-js 2.107.0, so the warning persists on current versions).
  //
  // Ref: https://nextjs.org/docs/app/api-reference/file-conventions/middleware
  unstable_allowDynamic: '/node_modules/@supabase/{supabase-js,ssr}/**',
};
