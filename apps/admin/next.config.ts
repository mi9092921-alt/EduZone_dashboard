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
  async headers() {
    return [
      {
        source: '/api/video/:videoId*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
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
