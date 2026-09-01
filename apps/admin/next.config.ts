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
  // P1-SEC-004: dropped the wildcard `Access-Control-Allow-Origin: *`. This
  // route returns an HTML page meant to be loaded as a navigation/iframe
  // target, not read via cross-origin fetch/XHR, so the wildcard granted no
  // legitimate functionality and only widened the response's readable
  // surface. See PRODUCTION_READINESS_PLAN.md P1-SEC-004 for the remaining
  // (unresolved) question of whether this route also needs an auth check.
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
