import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from '@/infrastructure/supabase/middleware';

const handleI18nRouting = createMiddleware(routing);

/**
 * Next.js Middleware — runs on every request.
 * Composes next-intl localized routing with Supabase session management.
 */
export async function middleware(request: NextRequest) {
  // 0. Skip API routes — they don't need i18n or auth session handling
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // 1. Handle i18n routing first
  const response = handleI18nRouting(request);

  // 2. Refresh Supabase session and enforce auth redirects
  // Pass the i18n response to preserve locale cookies
  return await updateSession(request, response);
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
};
