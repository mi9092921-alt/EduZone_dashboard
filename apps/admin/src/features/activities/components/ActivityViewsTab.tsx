import React from 'react';
import { PlayCircle, Article, OndemandVideo, EventNote } from '@mui/icons-material';
import { useVideoViews } from '@/adapters/queries/courses.queries';
import { useTranslations, useLocale } from 'next-intl';

interface ActivityViewsTabProps {
  userId: string;
}

export function ActivityViewsTab({ userId }: ActivityViewsTabProps) {
  const t = useTranslations('activities');
  const locale = useLocale();

  const { data, isLoading } = useVideoViews(userId, 1, 50);

  const views = React.useMemo(() => {
    const seen = new Set<string>();
    return (data?.data ?? []).filter((view) => {
      const key = view.id || `${view.course_id}-${view.lesson_id}-${view.viewed_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data?.data]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (views.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
        <EventNote className="text-4xl mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">{t('no_activities_found')}</p>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm shadow-inner-glow">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">{t('header_content')}</th>
              <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">{t('header_duration')}</th>
              <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">{t('header_date')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {views.map((view, index) => (
              <tr key={`${view.id}-${index}`} className="hover:bg-muted/30 transition-colors group">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-background border border-border/40 group-hover:bg-card transition-colors text-emerald-500">
                      <PlayCircle fontSize="small" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">
                        {view.lesson_title || '—'}
                      </p>
                      <p className="text-[10px] font-black text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        {view.course_title || '—'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-[11px] font-bold text-foreground">
                    {formatDuration(view.watch_time_sec)}
                  </span>
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <div className="flex flex-col text-[11px]">
                    <span className="text-foreground font-bold">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(view.viewed_at))}
                    </span>
                    <span className="text-muted-foreground mt-0.5 uppercase">
                      {new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(view.viewed_at))}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
