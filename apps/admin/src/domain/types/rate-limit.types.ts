/**
 * Rate limit domain types — synced with Eduzone Schema v13.9.0
 * rate_limit_rules, rate_limits tables.
 */

// ── Rate limit rule ──────────────────────────────────────────────
export interface RateLimitRule {
  action: string;
  max_hits: number;
  window_seconds: number;
  block_seconds: number;
  is_active: boolean;
}

// ── Rate limit entry ─────────────────────────────────────────────
export interface RateLimit {
  id: string;
  user_id: string | null;
  ip_address: string | null;
  device_id: string | null;
  tenant_id: string;
  action: string;
  window_start: string;
  hit_count: number;
  blocked_until: string | null;
}

// ── Rate limit with joined user email ────────────────────────────
export interface RateLimitWithEmail extends RateLimit {
  user_email?: string | null;
}

// ── Top offender aggregate ───────────────────────────────────────
export interface TopOffender {
  user_id: string | null;
  ip_address: string | null;
  user_email: string | null;
  total_hits: number;
  actions: string[];
}
