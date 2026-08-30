'use client';

import {
  People,
  School,
  TrendingUp,
  Warning,
  VisibilityOff,
  DeleteOutline,
  Analytics,
  Visibility,
  Domain,
  PlayLesson,
  Assignment,
  Devices
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';

import { QueueHealthPanel } from './QueueHealthPanel';
import { SecurityAlertPanel } from './SecurityAlertPanel';

import { useDashboardStats } from '@/adapters/queries/analytics.queries';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

// ── Semantic Wrappers for KPI Grid ──────────────────────────────
const StatsCard = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <Card className={cn("overflow-hidden", className)}>{children}</Card>
);
const StatsCardContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <CardContent className={cn("p-0", className)}>{children}</CardContent>
);
const StatsCardIcon = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-center rounded-xl", className)}>{children}</div>
);

export function AdminDashboard() {
  const t = useTranslations('common');
  const { data: stats, isLoading } = useDashboardStats();

  const primaryStats = [
    {
      label: t('total_users'),
      value: stats?.totalUsers ?? '—',
      icon: People,
      colorClass: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400',
    },
    {
      label: t('published_courses'),
      value: stats?.activeCourses ?? '—',
      icon: School,
      colorClass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    {
      label: t('analytics'),
      value: stats?.dailySessions ?? '—',
      icon: Analytics,
      colorClass: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400',
    },
    {
      label: t('dashboard_tenants'),
      value: stats?.totalTenants ?? '—',
      icon: Domain,
      colorClass: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400',
    },
  ];

  const secondaryStats = [
    {
      label: t('unpublished_courses'),
      value: stats ? (stats.archivedCourses + stats.draftCourses) : '—',
      icon: VisibilityOff,
      colorClass: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-400',
    },
    {
      label: t('dashboard_views'),
      value: stats?.totalViews ?? '—',
      icon: Visibility,
      colorClass: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-400',
    },
    {
      label: t('dashboard_lessons'),
      value: stats?.totalLessons ?? '—',
      icon: PlayLesson,
      colorClass: 'text-pink-600 bg-pink-50 dark:bg-pink-500/10 dark:text-pink-400',
    },
    {
      label: t('dashboard_progress'),
      value: stats?.totalProgress ?? '—',
      icon: TrendingUp,
      colorClass: 'text-teal-600 bg-teal-50 dark:bg-teal-500/10 dark:text-teal-400',
    },
    {
      label: t('dashboard_devices'),
      value: stats?.totalDevices ?? '—',
      icon: Devices,
      colorClass: 'text-slate-600 bg-slate-100 dark:bg-slate-500/10 dark:text-slate-400',
    },
    {
      label: t('dashboard_todos'),
      value: stats?.totalTodos ?? '—',
      icon: Assignment,
      colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400',
    },
    {
      label: t('deleted_courses'),
      value: stats?.deletedCourses ?? '—',
      icon: DeleteOutline,
      colorClass: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400',
    },
    {
      label: t('warnings'),
      value: stats?.pendingWarnings ?? '—',
      icon: Warning,
      colorClass: 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('dashboard')}</h1>
        <p className="text-sm text-muted-foreground font-medium opacity-80">{t('welcome', { name: 'EduZone' })}</p>
      </div>

      {/* Primary KPI Cards Grid (Hero) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {primaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <StatsCard key={stat.label} className="transition-all hover:translate-y-[-2px] hover:shadow-lg border-border/40">
              <StatsCardContent className="flex flex-row items-center gap-4 p-5">
                <StatsCardIcon className={cn("w-10 h-10 rounded-xl shrink-0 flex items-center justify-center shadow-inner", stat.colorClass)}>
                  <Icon sx={{ fontSize: 22 }} />
                </StatsCardIcon>
                <div className="flex flex-col min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 truncate w-full" title={stat.label}>
                    {stat.label}
                  </p>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-bold tracking-tight text-foreground truncate w-full tabular-nums">
                      {isLoading ? (
                        <div className="h-7 w-16 bg-muted animate-pulse rounded-md" />
                      ) : (
                        stat.value
                      )}
                    </span>
                  </div>
                </div>
              </StatsCardContent>
            </StatsCard>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="h-full min-h-[400px] border-border/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold">{t('activity_overview')}</CardTitle>
              <div className="p-1 px-3 bg-muted/40 rounded-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t('live')}
              </div>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center m-4">
              <div className="flex flex-col items-center justify-center text-center space-y-2 p-8 rounded-xl border border-dashed border-border/60 bg-muted/20 w-full h-full">
                <Analytics className="text-muted-foreground/40 w-8 h-8 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">{t('activity_empty_state')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <QueueHealthPanel />
          <SecurityAlertPanel />

          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-lg font-bold">{t('recent_insights')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-500/10 text-sm transition-all hover:bg-indigo-50 dark:hover:bg-indigo-500/10 cursor-default">
                <p className="font-bold text-indigo-900 dark:text-indigo-200">{t('insights_course_up')}</p>
                <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-1 font-medium">{t('compared_last_week')}</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-500/10 text-sm transition-all hover:bg-emerald-50 dark:hover:bg-emerald-500/10 cursor-default">
                <p className="font-bold text-emerald-900 dark:text-emerald-200">{t('insights_users_peak')}</p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-medium">{t('sessions_increased')}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('operational_metrics')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {secondaryStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/10 transition-colors hover:bg-muted/20">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${stat.colorClass}`}>
                        <Icon fontSize="small" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate w-full" title={stat.label}>
                          {stat.label}
                        </span>
                        <span className="text-sm font-bold text-foreground truncate w-full">
                          {isLoading ? <div className="h-4 w-8 bg-muted animate-pulse rounded-sm mt-0.5" /> : stat.value}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
