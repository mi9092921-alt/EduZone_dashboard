'use server';

import { headers } from 'next/headers';

import { checkRateLimitForIp } from '@/infrastructure/repos/rate-limits.service';

/**
 * Pre-auth brute-force backstop for the login form.
 *
 * Runs the seeded `login` rate-limit rule (rate_limit_rules: 5 hits /
 * 300 s window, 900 s block) keyed on the client's source IP. The RPC is
 * least-privileged (no anon/authenticated EXECUTE — see 10_permissions.sql
 * "Rate-Limit RPC Least Privilege"), so the call goes through the
 * infrastructure rate-limits service with the admin client rather than
 * from the browser.
 *
 * Contract: every failure mode is fail-open ({ allowed: true }) — GoTrue's
 * own auth rate limits remain the hard boundary; this is defense-in-depth
 * and must never become a login outage. If no client IP can be derived we
 * also fail open instead of counting attempts under a shared NULL key
 * (which would let anyone lock out all anonymous logins globally).
 *
 * NOTE: each successful RPC call RECORDS a hit, so this action must be
 * invoked exactly once per submitted login attempt, before signInWithPassword.
 */
export async function checkLoginRateLimitAction(): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
}> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || headerStore.get('x-real-ip') || null;

    // The RPC parameter is inet-typed: only pass values that parse as an
    // IPv4/IPv6 address, otherwise PostgREST rejects the call outright.
    const isPlausibleIp =
      ip !== null && (/^(\d{1,3})(\.\d{1,3}){3}$/.test(ip) || ip.includes(':'));
    if (!ip || !isPlausibleIp) {
      return { allowed: true };
    }

    const result = await checkRateLimitForIp(ip, 'login');

    if (!result.allowed) {
      const blockedUntil = result.retryAfter ? Date.parse(result.retryAfter) : NaN;
      const retryAfterSeconds =
        Number.isFinite(blockedUntil) && blockedUntil > Date.now()
          ? Math.ceil((blockedUntil - Date.now()) / 1000)
          : 900;
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
