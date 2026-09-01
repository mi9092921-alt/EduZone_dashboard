import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  transpilePackages: ['@eduzone/ui', '@eduzone/types', '@eduzone/utils'],
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
  serverExternalPackages: ['require-in-the-middle'],

  // ── YouTube Proxy Headers ─────────────────────────────────────────────────
  // P1-SEC-004 FIX: dropped the wildcard Access-Control-Allow-Origin here.
  // Nothing in this repo calls /api/video/:videoId* via cross-origin
  // fetch/XHR (verified by search), and the real consumer is a WebView/
  // iframe-src load, which CORS headers don't gate at all -- only
  // script-initiated cross-origin reads are affected. X-Frame-Options stays,
  // since embedding by a foreign origin was never the intent either.
  async headers() {
    return [
      {
        source: '/api/video/:videoId*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

const sentryConfig = {
  silent: true,
  org: 'eduzone',
  project: 'admin',
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
};

export default withSentryConfig(withNextIntl(nextConfig), sentryConfig);
// trigger restart
