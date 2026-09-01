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
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required').optional(),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
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

  const parsed = serverEnvSchema.safeParse({
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

