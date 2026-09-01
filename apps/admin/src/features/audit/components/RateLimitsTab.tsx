'use client';

import { Block, TrendingUp, Timer, Delete, Shield } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo } from 'react';

import { useToggleRateLimitRule, useClearBlock } from '@/adapters/mutations/rate-limits.mutations';
import {
  useActiveBlocks,
  useRateLimitRules,
  useTopOffenders,
} from '@/adapters/queries/rate-limits.queries';
import { Switch } from '@/components/ui/Switch';
import type {
  RateLimitRule,
  RateLimitWithEmail,
  TopOffender,
} from '@/domain/types/rate-limit.types';
import { cn } from '@/lib/utils';

export function RateLimitsTab() {
  return (
    <div className="space-y-6">
      {/* Active Blocks */}
      <ActiveBlocksSection />

      {/* Top Offenders */}
      <TopOffendersSection />

      {/* Rate Limit Rules */}
      <RateLimitRulesSection />
    </div>
  );
}

// ── Active Blocks ──────────────────────────────────────────
function ActiveBlocksSection() {
  const t = useTranslations('audit');
  const { data: blocks, isLoading } = useActiveBlocks();
  const clearBlock = useClearBlock();

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Block className="text-destructive text-base" />
          <h3 className="text-sm font-semibold text-foreground">{t('title_active_blocks')}</h3>
          {blocks && (
            <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-semibold">
              {blocks.length}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">{t('auto_refresh_label')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_user_ip')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_actions')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_hits')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_blocked_until')}
              </th>
              <th className="text-end px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_row_actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(blocks ?? []).map((block: RateLimitWithEmail) => (
              <tr
                key={block.id}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-2.5 text-xs">
                  {block.user_email && (
                    <span className="text-foreground font-medium">{block.user_email}</span>
                  )}
                  {block.ip_address && (
                    <span className="font-mono text-muted-foreground ms-2">{block.ip_address}</span>
                  )}
                  {!block.user_email && !block.ip_address && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-md text-foreground">
                    {block.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs font-semibold text-foreground">
                  {block.hit_count}
                </td>
                <td className="px-4 py-2.5">
                  {block.blocked_until && <CountdownTimer until={block.blocked_until} />}
                </td>
                <td className="px-4 py-2.5 text-end">
                  <Tooltip title={t('tooltip_clear_block')}>
                    <button
                      onClick={() => clearBlock.mutate(block.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <Delete className="text-sm" />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
            {!isLoading && (blocks ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  <Shield className="text-3xl opacity-30 mb-2" />
                  <p>{t('no_active_blocks')}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Top Offenders ──────────────────────────────────────────
function TopOffendersSection() {
  const t = useTranslations('audit');
  const { data: offenders, isLoading } = useTopOffenders();

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <TrendingUp className="text-orange-500 text-base" />
        <h3 className="text-sm font-semibold text-foreground">{t('title_top_offenders')}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_rank')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_user_ip')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_total_hits')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_row_actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(offenders ?? []).map((o: TopOffender, idx: number) => (
              <tr
                key={o.user_id ?? o.ip_address ?? idx}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {o.user_email && (
                    <span className="text-foreground font-medium">{o.user_email}</span>
                  )}
                  {o.ip_address && (
                    <span className="font-mono text-muted-foreground ms-2">{o.ip_address}</span>
                  )}
                  {!o.user_email && !o.ip_address && (
                    <span className="text-muted-foreground">{t('label_unknown')}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs font-bold text-foreground">{o.total_hits}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {o.actions.map((a) => (
                      <span
                        key={a}
                        className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (offenders ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                  {t('no_offenders_24h')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Rate Limit Rules ───────────────────────────────────────
function RateLimitRulesSection() {
  const t = useTranslations('audit');
  const { data: rules, isLoading } = useRateLimitRules();
  const toggleRule = useToggleRuleHook();

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Timer className="text-primary text-base" />
        <h3 className="text-sm font-semibold text-foreground">{t('title_rate_limit_rules')}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_actions')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_max_hits')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_window')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_block_duration')}
              </th>
              <th className="text-start px-4 py-2.5 font-semibold text-muted-foreground text-xs">
                {t('header_active')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(rules ?? []).map((rule: RateLimitRule) => (
              <tr
                key={rule.action}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="text-xs font-semibold text-foreground">{rule.action}</span>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-foreground">{rule.max_hits}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  <Duration seconds={rule.window_seconds} />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {rule.block_seconds > 0 ? <Duration seconds={rule.block_seconds} /> : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) =>
                      toggleRule.mutate({ action: rule.action, isActive: checked })
                    }
                  />
                </td>
              </tr>
            ))}
            {!isLoading && (rules ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  {t('no_rules_configured')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Custom Hook Wrapper (for cleaner code) ──────────────
function useToggleRuleHook() {
  return useToggleRateLimitRule();
}

// ── Duration Component (localized) ─────────────────────────
function Duration({ seconds }: { seconds: number }) {
  const t = useTranslations('audit');
  if (seconds < 60) return <span>{t('seconds_short', { s: seconds })}</span>;
  if (seconds < 3600) return <span>{t('minutes_short', { m: Math.floor(seconds / 60) })}</span>;
  if (seconds < 86400) return <span>{t('hours_short', { h: Math.floor(seconds / 3600) })}</span>;
  return <span>{t('days_short', { d: Math.floor(seconds / 86400) })}</span>;
}

// ── Countdown Timer ────────────────────────────────────────
function CountdownTimer({ until }: { until: string }) {
  const t = useTranslations('audit');
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(until).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining(t('label_expired'));
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);

      const parts = [];
      if (h > 0) parts.push(t('hours_short', { h }));
      parts.push(t('minutes_short', { m }));
      parts.push(t('seconds_short', { s }));
      setRemaining(parts.join(' '));
    };

    update();
    const interval = setInterval(update, 1_000);
    return () => clearInterval(interval);
  }, [until, t]);

  const isExpiringSoon = useMemo(() => new Date(until).getTime() - Date.now() < 300_000, [until]);

  return (
    <span
      className={cn(
        'text-xs font-mono font-semibold',
        remaining === t('label_expired')
          ? 'text-muted-foreground'
          : isExpiringSoon
            ? 'text-amber-500'
            : 'text-destructive',
      )}
    >
      {remaining}
    </span>
  );
}
