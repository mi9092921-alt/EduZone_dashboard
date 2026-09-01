'use client';

import { Stream, Pause, PlayArrow, Circle, Close } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import { useQueuedActivities } from '@/adapters/queries/audit.queries';
import type { ActivityLogQueueEntry, RiskLevel } from '@/domain/types/audit.types';
import { cn } from '@/lib/utils';

const MAX_EVENTS = 200;

const riskColors: Record<RiskLevel, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  critical: 'text-destructive',
};

const riskDotColors: Record<RiskLevel, string> = {
  low: 'bg-muted-foreground',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-destructive',
};

interface LiveActivityStreamProps {
  open: boolean;
  onClose: () => void;
}

export function LiveActivityStream({ open, onClose }: LiveActivityStreamProps) {
  const t = useTranslations('audit');
  const [paused, setPaused] = useState(false);

  const { data: events } = useQueuedActivities(MAX_EVENTS + 50);

  const displayEvents = paused ? [] : (events ?? []).slice(0, MAX_EVENTS);
  const isPaused = !paused && (events ?? []).length > MAX_EVENTS;
  const queuedCount = (events ?? []).length;

  const formatTime = useCallback((dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }, []);

  if (!open) return null;

  return (
    <div className="fixed top-0 end-0 h-full w-[380px] bg-card border-s border-border shadow-2xl z-[var(--z-modal)] flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Stream className="text-primary text-lg" />
            {!paused && !isPaused && (
              <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{t('title_live_activity')}</h3>
          <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-mono text-muted-foreground">
            {queuedCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip title={paused ? t('tooltip_resume') : t('tooltip_pause')}>
            <button
              onClick={() => setPaused(!paused)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              {paused ? <PlayArrow className="text-base" /> : <Pause className="text-base" />}
            </button>
          </Tooltip>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <Close className="text-base" />
          </button>
        </div>
      </div>

      {/* Paused indicator */}
      {(paused || isPaused) && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 text-xs font-medium flex items-center gap-2">
          <Pause className="text-sm" />
          {t('status_paused', { count: queuedCount })}
        </div>
      )}

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto content-scroll">
        {displayEvents.length === 0 && !paused && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Stream className="text-3xl opacity-30" />
            <p>{t('no_unflushed_events')}</p>
          </div>
        )}

        {displayEvents.map((event: ActivityLogQueueEntry) => (
          <EventItem key={event.id} event={event} formatTime={formatTime} />
        ))}
      </div>
    </div>
  );
}

function EventItem({
  event,
  formatTime,
}: {
  event: ActivityLogQueueEntry;
  formatTime: (d: string) => string;
}) {
  const t = useTranslations('audit');
  return (
    <div className="group px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2.5">
        <Circle className={cn('text-[6px] mt-1.5 shrink-0', riskDotColors[event.risk_level])} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground truncate">
              {t(`activity_types.${event.activity_type}`)}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              {formatTime(event.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] font-medium uppercase', riskColors[event.risk_level])}>
              {t(`risk_levels.${event.risk_level}`)}
            </span>
            {event.user_id && (
              <span className="text-[10px] text-muted-foreground font-mono truncate">
                {event.user_id.slice(0, 8)}…
              </span>
            )}
            {event.ip_address && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {event.ip_address}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
