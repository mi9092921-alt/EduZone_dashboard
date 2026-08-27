import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  test: {
    // ── Coverage config (top-level, applies to all projects) ────────
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // CI gate thresholds
      thresholds: {
        lines:      80,
        branches:   55,   // 59.55% currently; raise to 75% once staging E2E is added
        functions:  70,
        statements: 80,
      },
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.stories.tsx',
        '**/stories/**',
        '**/cypress/**',
        // Test infrastructure — not production code
        'tests/**',
        '**/__tests__/**',
        // Generated / config files
        'src/lib/env.ts',
        '**/*.config.*',
        '**/next-env.d.ts',
        '**/vitest.shims.d.ts',
        // Type-only and constant files — no logic to test
        'src/domain/types/**',
        'src/domain/constants/**',
        // Query key factory — pure config, no logic
        'src/adapters/queries/keys.ts',
        // React adapter hooks — tested via integration tests, not unit coverage
        'src/adapters/queries/*.queries.ts',
        'src/adapters/mutations/*.mutations.ts',
        // Next.js app-router entry points
        'src/app/**',
        // Feature barrel exports
        'src/features/**/index.ts',
        // DI container
        'src/container.ts',
      ],
    },

    // ── Test projects ───────────────────────────────────────────────
    projects: [
      {
        extends: true,
        test: {
          name:         'unit',
          environment:  'jsdom',
          globals:      true,
          setupFiles:   ['./vitest.setup.ts'],
          exclude:      ['**/node_modules/**', '**/dist/**', '**/*.stories.tsx', '**/cypress/**'],
          alias: {
            '@': path.resolve(dirname, './src'),
          },
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name:    'storybook',
          browser: {
            enabled:   true,
            headless:  true,
            provider:  playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});