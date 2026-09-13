import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit-test-only configuration.
 * Keep browser/Storybook plugins out of this process so a unit test cannot
 * start Playwright workers or accidentally execute browser stories.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    name: 'unit',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.stories.*', '**/cypress/**'],
    pool: 'threads',
    // Vitest 4 dropped `poolOptions.threads.singleThread`; `fileParallelism: false`
    // is the current equivalent — it runs test files sequentially within the pool.
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      // Coverage ratchet (review item 05): before this block, `--coverage`
      // was informational only — no number could ever fail CI. Baselines
      // measured 2026-09-13 (statements 63.41 / lines 66.56 / functions
      // 59.4 / branches 53.43). Floors sit ~1-1.5 points below baseline:
      // low enough to absorb run-to-run noise, high enough that deleting
      // or skipping tests fails the gate instead of silently shrinking
      // the number. Raise these as coverage improves — never lower them.
      // Evaluated only when coverage runs (`--coverage`, as CI does via
      // `pnpm turbo test -- --coverage`); plain `vitest run` is unaffected.
      thresholds: {
        lines: 65,
        statements: 62,
        functions: 58,
        branches: 52,
        // The weakest files are exactly the most security-sensitive ones
        // (review item 05: privileged admin actions, the service-role
        // bulk-action route, and the jobs RPC service). Their weight is
        // too small to move the global aggregate, so a targeted drop
        // (e.g. tests deleted) would hide inside the ratchet margin —
        // these per-file floors freeze each of them at ~2 points below
        // its measured baseline.
        'src/adapters/actions/admin.actions.ts': {
          lines: 22,
          statements: 22,
          functions: 15,
          branches: 46,
        },
        'src/app/api/bulk-action/route.ts': {
          lines: 25,
          statements: 23,
          functions: 15,
          branches: 15,
        },
        'src/infrastructure/repos/jobs-rpc.service.ts': {
          lines: 7,
          statements: 5,
          functions: 7,
          branches: 2,
        },
      },
    },
  },
});
