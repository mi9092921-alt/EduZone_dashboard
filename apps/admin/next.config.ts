import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// @sentry/nextjs 10.x exports withSentryConfig from its package root.

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  transpilePackages: ['@eduzone/ui', '@eduzone/types', '@eduzone/utils'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? (() => {
            try {
              const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
              return [
                {
                  protocol: url.protocol.replace(':', '') as 'http' | 'https',
                  hostname: url.hostname,
                  ...(url.port ? { port: url.port } : {}),
                },
              ];
            } catch {
              return [];
            }
          })()
        : []),
    ],
  },
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
  serverExternalPackages: ['require-in-the-middle'],
  // PHASE 2.19 (G8): security headers previously lived only in vercel.json,
  // so any non-Vercel deployment (Docker, self-hosted node) served responses
  // with no hardening headers at all. Defined here so they travel with the
  // app itself; values mirror vercel.json exactly (Vercel strips duplicate
  // application of these, same values anyway).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
  // PHASE 2.30 (G9): pin the release to the deployed commit so errors group
  // by exact build; VERCEL_GIT_COMMIT_SHA is injected on Vercel, SENTRY_RELEASE
  // allows explicit pinning elsewhere. Falls back to the plugin's default
  // detection when neither is present (local builds).
  ...(process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA
    ? { release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA }
    : {}),
  // `disableLogger` is deprecated in favor of
  // `webpack.treeshake.removeDebugLogging` (@sentry/nextjs v10.73+).
  // The old key still works but emits a build-time deprecation warning.
  treeshake: {
    removeDebugLogging: true,
  },
};

export default withSentryConfig(withNextIntl(nextConfig), sentryConfig);
