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
  },
});
