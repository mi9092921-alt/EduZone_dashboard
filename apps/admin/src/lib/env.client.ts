import { z } from 'zod';

/**
 * Client-safe public environment.
 *
 * P1 FIX (server/client boundary): this module contains ONLY `NEXT_PUBLIC_*`
 * variables, which are safe to bundle and expose in the browser. It MUST
 * never import server secrets, `server-only`, or Node-only APIs — the
 * browser Supabase client (`infrastructure/supabase/client.ts`), the Edge
 * middleware, and cookie options all import from here.
 *
 * Server secrets live in `./env` (server-only). Server code may import from
 * either module; client code MUST import only from here.
 */

export const defaultAppEnv =
  process.env['NODE_ENV'] === 'production' ? 'production' : 'development';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default(defaultAppEnv),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
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

/**
 * Validated public environment variables.
 * Safe for both client and server consumption.
 */
export const env = validatePublicEnv();
