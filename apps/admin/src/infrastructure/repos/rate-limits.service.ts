import type {
  RateLimitRule,
  RateLimitWithEmail,
  TopOffender,
} from '@/domain/types/rate-limit.types';

/**
 * Rate limits service — Supabase queries for rate limiting domain.
 * No UI, no React — pure async functions.
 */

// ── Get active blocks (blocked_until > now) ──────────────────────
export async function getActiveBlocks(): Promise<RateLimitWithEmail[]> {
  const { getActiveBlocksAction } = await import('@/application/actions/admin.actions');
  return getActiveBlocksAction();
}

// ── Get rate limit rules ─────────────────────────────────────────
export async function getRateLimitRules(): Promise<RateLimitRule[]> {
  const { getRateLimitRulesAction } = await import('@/application/actions/admin.actions');
  return getRateLimitRulesAction();
}

// ── Toggle rule active state ─────────────────────────────────────
export async function toggleRateLimitRule(action: string, isActive: boolean): Promise<void> {
  const { toggleRateLimitRuleAction } = await import('@/application/actions/admin.actions');
  return toggleRateLimitRuleAction(action, isActive);
}

// ── Clear a specific block ───────────────────────────────────────
export async function clearBlock(id: string): Promise<void> {
  const { clearRateLimitBlockAction } = await import('@/application/actions/admin.actions');
  return clearRateLimitBlockAction(id);
}

// ── Top offenders (last 24h) ─────────────────────────────────────
export async function getTopOffenders(): Promise<TopOffender[]> {
  const { getTopOffendersAction } = await import('@/application/actions/admin.actions');
  return getTopOffendersAction();
}
