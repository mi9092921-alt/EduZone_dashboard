'use client';

import { Security, Speed, CleaningServices, Stream } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AuditLogsTab } from './AuditLogsTab';
import { LiveActivityStream } from './LiveActivityStream';
import { RateLimitsTab } from './RateLimitsTab';

import { useFlushActivityLogs } from '@/adapters/mutations/audit.mutations';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type Tab = 'audit' | 'rateLimits';

export function AuditPage() {
  const t = useTranslations('audit');
  const [tab, setTab] = useState<Tab>('audit');
  const [streamOpen, setStreamOpen] = useState(false);

  const flush = useFlushActivityLogs();
  const [flushResult, setFlushResult] = useState<{
    key: string;
    params?: { count: number };
  } | null>(null);

  const handleFlush = async () => {
    setFlushResult(null);
    try {
      const count = await flush.mutateAsync(200);
      setFlushResult({ key: 'status_flushed', params: { count } });
      setTimeout(() => setFlushResult(null), 5000);
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'LOCK_CONTENTION') {
        setFlushResult({ key: 'status_lock_contention' });
      } else {
        setFlushResult({ key: 'status_flush_failed' });
      }
      setTimeout(() => setFlushResult(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{t('page_title')}</h1>
          {/* Audit logs might be too dynamic for a simple total badge in the main header */}
        </div>
        <div className="flex items-center gap-2">
          {flushResult && (
            <span
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg',
                flushResult.key === 'status_flushed'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-amber-500/10 text-amber-600',
              )}
            >
              {t(flushResult.key, flushResult.params)}
            </span>
          )}
          <Tooltip title={t('tooltip_flush')}>
            <span>
              <Button variant="outline" size="sm" onClick={handleFlush} isLoading={flush.isPending}>
                <CleaningServices className="text-sm" />
                {t('btn_flush_queue')}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={t('tooltip_live_stream')}>
            <button
              onClick={() => setStreamOpen(!streamOpen)}
              className={cn(
                'p-2 rounded-xl border transition-all',
                streamOpen
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <Stream className="text-base" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit">
        <button
          onClick={() => setTab('audit')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'audit'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Security className="text-base" />
          {t('tab_audit_logs')}
        </button>
        <button
          onClick={() => setTab('rateLimits')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'rateLimits'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Speed className="text-base" />
          {t('tab_rate_limits')}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'audit' && <AuditLogsTab />}
      {tab === 'rateLimits' && <RateLimitsTab />}

      {/* Live Activity Stream (sidebar) */}
      <LiveActivityStream open={streamOpen} onClose={() => setStreamOpen(false)} />
    </div>
  );
}
