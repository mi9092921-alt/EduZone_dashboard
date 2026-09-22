import { PlayCircle, EventNote, ExpandMore } from '@mui/icons-material';
import { useTranslations, useLocale } from 'next-intl';
import React from 'react';

import { useVideoViewsInfinite } from '@/adapters/queries/courses.queries';

interface ActivityViewsTabProps {
  userId: string;
}

export function ActivityViewsTab({ userId }: ActivityViewsTabProps) {
  const t = useTranslations('activities');
  const locale = useLocale();

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useVideoViewsInfinite(userId);

  const views = React.useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((page) => page.data) ?? []).filter((view) => {
      const key = view.id || `${view.course_id}-${view.lesson_id}-${view.viewed_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data?.pages]);

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

  const formatViewedAt = (value: string | null | undefined, options: Intl.DateTimeFormatOptions) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, options).format(date) : '—';
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm shadow-inner-glow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                  {t('header_content')}
                </th>
                <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                  {t('header_duration')}
                </th>
                <th className="text-start px-5 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                  {t('header_date')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {views.map((view, index) => (
                <tr
                  key={`${view.id}-${index}`}
                  className="hover:bg-muted/30 transition-colors group"
                >
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
                        {formatViewedAt(view.viewed_at, { dateStyle: 'medium' })}
                      </span>
                      <span className="text-muted-foreground mt-0.5 uppercase">
                        {formatViewedAt(view.viewed_at, { timeStyle: 'short' })}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide bg-muted/60 text-foreground hover:bg-muted border border-border/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <ExpandMore fontSize="inherit" />
            {isFetchingNextPage ? t('label_loading_more') : t('label_load_more')}
          </button>
        </div>
      )}
    </div>
  );
}
