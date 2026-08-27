import { defineConfig } from 'cypress';

/**
 * Cypress E2E Configuration — EduZone Admin Dashboard
 *
 * Target: Staging environment (Supabase Cloud).
 * Tests run against the real staging backend — no local server required.
 *
 * Required env vars (set in cypress.env.json or CI secrets):
 *   CYPRESS_BASE_URL          — staging URL  (e.g. https://admin-staging.eduzone.app)
 *   CYPRESS_SUPABASE_URL      — staging Supabase URL
 *   CYPRESS_SUPABASE_ANON_KEY — staging anon key (public, safe in CI)
 *   CYPRESS_ADMIN_EMAIL       — test admin account email
 *   CYPRESS_ADMIN_PASSWORD    — test admin account password
 *   CYPRESS_TEACHER_EMAIL     — test teacher account email
 *   CYPRESS_TEACHER_PASSWORD  — test teacher account password
 */
export default defineConfig({
  e2e: {
    // ── Base URL ──────────────────────────────────────────────────
    // Override via CYPRESS_BASE_URL env var for staging/prod:
    //   CYPRESS_BASE_URL=https://admin-staging.eduzone.app pnpm cypress:run
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:3000',

    viewportWidth:  1280,
    viewportHeight: 900,

    // ── Video / Screenshots ───────────────────────────────────────
    video:                    true,
    videoCompression:         32,
    screenshotOnRunFailure:   true,
    trashAssetsBeforeRuns:    true,

    // ── Timeouts (staging may be slower than local) ───────────────
    defaultCommandTimeout:    10_000,
    requestTimeout:           15_000,
    responseTimeout:          15_000,
    pageLoadTimeout:          30_000,
    taskTimeout:              30_000,

    // ── Retry on CI ───────────────────────────────────────────────
    retries: {
      runMode:  2,   // CI: retry up to 2× before marking as failed
      openMode: 0,   // Dev: no retries for fast feedback
    },

    // ── Spec patterns ────────────────────────────────────────────
    specPattern:  'cypress/e2e/**/*.cy.{ts,tsx}',
    supportFile:  'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures',

    setupNodeEvents(on, config) {
      // ── Task: log to terminal (useful for debugging staging calls)
      on('task', {
        log(message: string) {
          console.log('\n[Cypress Task]', message);
          return null;
        },
      });

      // ── Read environment variables from process.env (CI)
      // Merge CI env vars so secrets are never committed to cypress.env.json
      const envVars = [
        'CYPRESS_ADMIN_EMAIL',
        'CYPRESS_ADMIN_PASSWORD',
        'CYPRESS_TEACHER_EMAIL',
        'CYPRESS_TEACHER_PASSWORD',
        'CYPRESS_SUPABASE_URL',
        'CYPRESS_SUPABASE_ANON_KEY',
      ];

      for (const key of envVars) {
        if (process.env[key]) {
          const shortKey = key.replace(/^CYPRESS_/, '').toLowerCase();
          config.env[shortKey] = process.env[key];
        }
      }

      return config;
    },
  },
});
