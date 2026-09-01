/**
 * YouTube Embed Proxy — Next.js Route Handler
 *
 * GET /api/video/[videoId]
 * يرجّع صفحة HTML wrapper فيها YouTube embed iframe.
 * الـ iframe بيحمّل YouTube من origin بتاعه (مفيش CORS).
 * Overlays شفافة بتمنع التفاعل مع عناصر YouTube UI.
 */

import { type NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  // Validate videoId (alphanumeric + - _)
  if (!/^[\w-]{5,20}$/.test(videoId)) {
    return new NextResponse("Invalid video ID", { status: 400 });
  }

  const embedUrl =
    `https://www.youtube-nocookie.com/embed/${videoId}` +
    `?autoplay=1&mute=0&rel=0&modestbranding=1` +
    `&iv_load_policy=3&disablekb=1&fs=0` +
    `&playsinline=1&color=white` +
    `&enablejsapi=1` +
    `&hl=en&cc_lang_pref=ar&cc_load_policy=1`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Player</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: #000;
    }

    iframe {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      border: none;
    }

    /* ═══ OVERLAYS (شفافة — بتمنع الضغط فقط) ═══ */

    /*
     * LTR/English layout:
     * +──────────────────────────────────────────────+
     * │ ████ TITLE HIDDEN ████ │ [🔊 CC ⚙️] FREE   │
     * │ (left → right-165px)   │     165px gap       │
     * +──────────────────────────────────────────────+
     * │                                              │
     * │           VIDEO — clickable                  │
     * │                                              │
     * +──────────────────────────────────────────────+
     * │ ████████ BOTTOM BAR HIDDEN ████████████████ │
     * │           full width — 72px                  │
     * +──────────────────────────────────────────────+
     */

    /* أعلى يسار: يغطي عنوان الفيديو + اسم القناة */
    .ov-title {
      position: absolute;
      top: 0; left: 0;
      width: calc(100% - 165px);
      height: 53px;
      z-index: 10;
      background: transparent;
      pointer-events: all;
      cursor: default;
    }

    /* شريط أسفل كامل: YouTube logo + fullscreen-action-menu + More options */
    .ov-bottom {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 72px;
      z-index: 10;
      background: transparent;
      pointer-events: all;
      cursor: default;
    }

    body { -webkit-user-select: none; user-select: none; }
  </style>
</head>
<body oncontextmenu="return false;">
  <iframe id="ytplayer"
    src="${embedUrl}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  ></iframe>

  <div class="ov-title"></div>
  <div class="ov-bottom"></div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** No CORS preflight is needed: nothing in this codebase calls this route via
 *  cross-origin fetch/XHR (verified via repo-wide search), and the primary
 *  consumer is a WebView/native image loader, which never enforces CORS in
 *  the first place. OPTIONS is intentionally left unhandled -- Next.js
 *  returns 405 for it, which is correct for a route with no real preflight need.
 */