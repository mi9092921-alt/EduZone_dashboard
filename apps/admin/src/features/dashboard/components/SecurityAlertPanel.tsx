'use client';

import { Warning, Security, History, InfoOutlined, ReportProblem } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { container } from '@/container';
import { cn } from '@/lib/utils';

export interface SecurityEvent {
  id: string;
  activity_type: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  details: unknown;
  created_at: string;
}

export function SecurityAlertPanel() {
  const t = useTranslations('common');
  const { supabase } = container;

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['dashboard', 'security-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, activity_type, risk_level, details, created_at')
        .in('risk_level', ['high', 'critical'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as SecurityEvent[];
    },
    refetchInterval: 30000, // Real-time pulse every 30s
  });

  return (
    <Card className="border-red-500/20 bg-red-500/[0.02] dark:bg-red-500/[0.05]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <ReportProblem className="text-red-500 w-5 h-5" />
          <CardTitle className="text-sm font-bold uppercase tracking-wider">
            {t('security_alerts')}
          </CardTitle>
        </div>
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 w-full bg-muted animate-pulse rounded-lg" />
          ))
        ) : alerts?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/10 rounded-xl border border-dashed border-border/60">
            <Security className="text-muted-foreground/20 w-8 h-8 mb-2" />
            <p className="text-xs text-muted-foreground">{t('no_security_threats')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts?.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'p-3 rounded-lg border transition-all hover:translate-x-1 cursor-default',
                  alert.risk_level === 'critical'
                    ? 'bg-red-500/10 border-red-500/20 text-red-900 dark:text-red-100'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-100',
                )}
              >
                <div className="flex items-start gap-3">
                  {alert.risk_level === 'critical' ? (
                    <Warning className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <InfoOutlined className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex flex-col min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">
                      {alert.activity_type.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    <p className="text-[10px] opacity-80 mt-0.5">
                      {(alert.details as { reason?: string; message?: string } | null)?.reason ||
                        (alert.details as { reason?: string; message?: string } | null)?.message ||
                        t('suspicious_activity_detected')}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 opacity-60">
                      <History className="w-3 h-3" />
                      <span className="text-[9px] font-medium">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
