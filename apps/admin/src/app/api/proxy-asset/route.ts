/**
 * YouTube Asset Proxy — Next.js 15 Route Handler
 * Stack: Next.js 15 · TypeScript 5
 *
 * GET /api/proxy-asset?url=<encoded-url>
 * يعمل proxy لأي asset (JS/CSS/صور) من YouTube عشان يتفادى CORS issues.
 */

import { type NextRequest, NextResponse } from 'next/server';

/** Allowed hostnames — فقط YouTube domains */
const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'www.youtube-nocookie.com',
  's.ytimg.com',
  'i.ytimg.com',
  'yt3.ggpht.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'play.google.com',
]);

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing ?url= parameter', { status: 400 });
  }

  // ── Validate URL ──────────────────────────────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse(`Blocked host: ${parsed.hostname}`, {
      status: 403,
    });
  }

  // ── Fetch upstream ────────────────────────────────────────────────────────
  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://www.youtube.com/',
      },
      next: { revalidate: 300 }, // cache assets لـ 5 دقائق
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    // P1-SEC-004/006 FIX: don't return raw fetch/network error details (host,
    // path, stack) to the caller. Log server-side, respond generically.
    console.error('[PROXY_ASSET_ERROR]', err);
    return new NextResponse('Asset proxy error', { status: 502 });
  }
}

/** No CORS preflight is needed: nothing in this codebase calls this route via
 *  cross-origin fetch/XHR (verified via repo-wide search), and the upstream
 *  content is public YouTube/Google static assets with no user-specific data.
 *  OPTIONS is intentionally left unhandled -- Next.js returns 405 for it.
 */
