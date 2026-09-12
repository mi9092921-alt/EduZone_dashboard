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
};

const sentryConfig = {
  silent: true,
  org: 'eduzone',
  project: 'admin',
  widenClientFileUpload: true,
  hideSourceMaps: true,
  // `disableLogger` is deprecated in favor of
  // `webpack.treeshake.removeDebugLogging` (@sentry/nextjs v10.73+).
  // The old key still works but emits a build-time deprecation warning.
  treeshake: {
    removeDebugLogging: true,
  },
};

export default withSentryConfig(withNextIntl(nextConfig), sentryConfig);
