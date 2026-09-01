'use client';

import { Memory, Dns, ErrorOutline, WarningAmber } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

import { useSystemHealth } from '@/adapters/queries/analytics.queries';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export function QueueHealthPanel() {
  const t = useTranslations('common');
  const { data: health, isLoading } = useSystemHealth();

  return (
    <Card className="border-border/40 overflow-hidden relative">
      <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 via-emerald-400 to-indigo-500" />
      <CardHeader className="pb-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <Dns className="text-blue-500 w-5 h-5" />
          <CardTitle className="text-sm font-bold uppercase tracking-wider">
            {t('infrastructure_health') || 'Infrastructure Health'}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-6 w-full animate-pulse bg-muted rounded" />
            <div className="h-6 w-full animate-pulse bg-muted rounded" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* Pending Jobs */}
            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Memory className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                  {t('pending_jobs') || 'Pending Jobs'}
                </span>
              </div>
              <span className="font-bold text-blue-700 dark:text-blue-400">
                {health?.pending_jobs || 0}
              </span>
            </div>

            {/* Processing Jobs */}
            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  {t('processing_jobs') || 'Processing'}
                </span>
              </div>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {health?.processing_jobs || 0}
              </span>
            </div>

            {/* Failed Jobs */}
            <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-lg flex items-center justify-between col-span-2">
              <div className="flex items-center gap-2">
                <ErrorOutline className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-semibold text-rose-900 dark:text-rose-300">
                  {t('failed_dead_jobs') || 'Dead-Letter Jobs'}
                </span>
              </div>
              <span className="font-bold text-rose-700 dark:text-rose-400">
                {health?.failed_jobs || 0}
              </span>
            </div>

            {/* Partition Leak Tripwire */}
            {health?.partition_leaks
              ? health.partition_leaks > 0 && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between col-span-2 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-2">
                      <WarningAmber className="w-4 h-4 text-red-500 animate-pulse" />
                      <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-widest">
                        {t('data_leak_detected') || 'DATA LEAK DETECTED'}
                      </span>
                    </div>
                    <span className="font-bold text-red-600">{health.partition_leaks}</span>
                  </div>
                )
              : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
