import { createServerClient as createClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/lib/env';

/**
 * Supabase middleware client — refreshes session on every request.
 * Called from Next.js middleware.
 */
export async function updateSession(request: NextRequest, response?: NextResponse) {
  let supabaseResponse = response ?? NextResponse.next({ request });

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = response ?? NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options!),
          );
        },
      },
    },
  );

  // Refresh session — this will set cookies. supabase.auth.getUser() makes
  // a network round trip to the Auth server to validate the token, and can
  // fail transiently (a slow/cold local Auth service under load, a brief
  // network hiccup) without the user actually being signed out. Treating
  // any such failure identically to "not authenticated" bounces a
  // genuinely signed-in user to /login on every blip -- this was silently
  // swallowing `error` entirely (only `data` was read) and never retrying,
  // so a single transient failure on a fresh navigation was
  // indistinguishable from a real logged-out state. A short bounded retry
  // fixes that without changing the security boundary: every real data
  // access is still independently authorized server-side regardless of
  // what this middleware decides (RLS + validate_user_session() /
  // assert_valid_session(), see 07_functions.sql AUTH-FIX-01) -- this only
  // affects whether the middleware redirects before the page even loads.
  let user = null;
  const MAX_GET_USER_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_GET_USER_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error) {
        user = data.user;
        break;
      }
      // "Auth session missing!" means this request carried no session
      // cookie at all -- correct, deterministic behavior for a genuinely
      // logged-out visitor (e.g. the /login page itself), not a transient
      // failure. Retrying can't conjure a cookie that was never sent, so
      // stop immediately instead of wasting 300ms and flooding the logs
      // on every unauthenticated request.
      if (error.name === 'AuthSessionMissingError' || /session missing/i.test(error.message)) {
        break;
      }
      console.error(
        `[MIDDLEWARE] auth.getUser() returned an error (attempt ${attempt}/${MAX_GET_USER_ATTEMPTS}):`,
        error.message,
      );
    } catch (error) {
      console.error(
        `[MIDDLEWARE ERROR] Supabase fetch failed (attempt ${attempt}/${MAX_GET_USER_ATTEMPTS}):`,
        error,
      );
    }
    if (attempt < MAX_GET_USER_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  // ── Auth Guard ──────────────────────────────────────────────────
  // Check if current path is an auth route (localized or not)
  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    /^\/(en|ar)\/(login|forgot-password)(\/.*)?$/.test(pathname);

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    // Redirect to root which handleI18nRouting will then localized to /en/login or /ar/login
    // Alternatively, preserve the current locale if possible
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login page
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    // Redirect to root, handleI18nRouting will handle localized redirect to /en/ or /ar/
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
