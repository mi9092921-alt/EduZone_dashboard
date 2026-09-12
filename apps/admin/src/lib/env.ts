import { z } from 'zod';

/**
 * Public client-safe environment variables.
 * Safe to be bundled and exposed in the browser.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

/**
 * Server-only environment variables and secrets.
 * MUST NEVER be bundled or accessed client-side.
 *
 * SECURITY FIX (2026-09-12): `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`
 * were previously marked `.optional()` despite their error messages saying
 * "required". That allowed production to boot healthy and then fail
 * silently at runtime — the cron endpoint would return 401 forever (Vercel
 * cron kept hitting /api/cron/routine, never alerting), and the first
 * admin action that needed `createAdminClient()` would throw a generic 500
 * with no clear root cause.
 *
 * Resolution: split into two schemas.
 *   - `serverEnvSchemaDev` keeps the lenient `.optional()` semantics for
 *     development / test / staging (where a missing service role key is a
 *     real configuration state — e.g. running only the auth-gated UI
 *     without invoking any admin action).
 *   - `serverEnvSchemaProd` marks both as required when
 *     `NEXT_PUBLIC_APP_ENV === 'production'`.
 * `getServerEnv()` picks the schema based on `NEXT_PUBLIC_APP_ENV`, so
 * production deployments fail-fast at the first call from
 * `instrumentation.ts register()` rather than degrading silently.
 */
const serverEnvSchemaDev = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
});

const serverEnvSchemaProd = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required in production (NEXT_PUBLIC_APP_ENV=production)'),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1, 'CRON_SECRET is required in production (NEXT_PUBLIC_APP_ENV=production)'),
  SENTRY_DSN: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchemaDev>;
export type Env = PublicEnv;

function validatePublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    NEXT_PUBLIC_APP_ENV: process.env['NEXT_PUBLIC_APP_ENV'],
    NEXT_PUBLIC_SENTRY_DSN: process.env['NEXT_PUBLIC_SENTRY_DSN'],
  });

  if (!parsed.success) {
    console.error('❌ Invalid public environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables. Check your .env.local file.');
  }

  return parsed.data;
}

export function getServerEnv(opts?: { enforceBrowserCheck?: boolean }): ServerEnv {
  const isBrowser = typeof window !== 'undefined' && (process.env.NODE_ENV !== 'test' || opts?.enforceBrowserCheck);
  if (isBrowser) {
    throw new Error('❌ Attempted to access server environment variables in the browser context.');
  }

  // SECURITY FIX (2026-09-12): pick the strict schema when running in
  // production. `NEXT_PUBLIC_APP_ENV` is validated by `publicEnvSchema`
  // (which is parsed at module load — see `env` export below), so by the
  // time `getServerEnv()` runs the value is either 'development',
  // 'staging', or 'production'.
  const appEnv = process.env['NEXT_PUBLIC_APP_ENV'] ?? 'development';
  const schema = appEnv === 'production' ? serverEnvSchemaProd : serverEnvSchemaDev;

  const parsed = schema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    YOUTUBE_API_KEY: process.env['YOUTUBE_API_KEY'],
    CRON_SECRET: process.env['CRON_SECRET'],
    SENTRY_DSN: process.env['SENTRY_DSN'],
  });

  if (!parsed.success) {
    console.error('❌ Invalid server environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid server environment variables. Check your server configuration.');
  }

  return parsed.data;
}

/**
 * Validated public environment variables.
 * Safe for both client and server consumption.
 */
export const env = validatePublicEnv();
