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

  // Refresh session — this will set cookies
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error('[MIDDLEWARE ERROR] Supabase fetch failed:', error);
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
