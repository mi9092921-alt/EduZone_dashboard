'use client';

import {
  People,
  TrendingUp,
  Schedule,
  Shield,
  Public,
  Download,
  AccessTime,
} from '@mui/icons-material';
import { TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon } from '@mui/icons-material';
import { Typography, Box, Tooltip } from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useMemo } from 'react';

import { GeoDistributionMap } from './GeoDistributionMap';

import {
  useUserStats,
  useCourseStats,
  useDailyActivity,
  useRegistrationTrend,
  useGeographicDistribution,
  useGlobalCoordinates,
} from '@/adapters/queries/analytics-mv.queries';
import {
  Card,
  StatsCard,
  StatsCardContent,
  StatsCardIcon
} from '@/components/ui/Card';
import type { CourseWithStats, MvDailyRevenue, DailyCount } from '@/domain/types/analytics.types';
import { cn } from '@/lib/utils';


export function AnalyticsPage() {
  const { data: userStats, isLoading: userStatsLoading } = useUserStats();
  const { data: courseStats } = useCourseStats();
  const { data: activity } = useDailyActivity();
  const { data: trend } = useRegistrationTrend(90);
  const { data: geoData } = useGeographicDistribution();
  const { data: globalPoints } = useGlobalCoordinates();
  const t = useTranslations('users');
  const ta = useTranslations('analytics');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [riskFilter, setRiskFilter] = useState<string | null>(null);

  const handleExportCsv = (sectionName: string, data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]!);
    const csv = [keys.join(','), ...data.map((row) => keys.map((k) => JSON.stringify(row[k] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sectionName}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* ... (previous sections 1-3) */}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{ta('page_title')}</h1>
          {/* Analytics is a dashboard of stats, so no single totalCount badge here */}
        </div>
      </div>

      {/* ═══ Section 1: User Metrics ═════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title={ta('section_users')}
          refreshedAt={(userStats as unknown as Record<string, string> | null)?.refreshed_at ?? userStats?.last_updated}
          onExport={() => userStats && handleExportCsv('user-metrics', [userStats as unknown as Record<string, unknown>])}
          locale={locale}
          ta={ta}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          <KpiCard
            label={tc('total_users')}
            value={userStats?.total_users}
            icon={People}
            color="#4F46E5"
            loading={userStatsLoading}
          />
          <KpiCard
            label={t('status_active')}
            value={userStats?.active_users}
            icon={People}
            color="#10B981"
            loading={userStatsLoading}
          />
          <KpiCard
            label={t('status_locked')}
            value={userStats?.locked_users}
            icon={Shield}
            color="#D97706"
            loading={userStatsLoading}
          />
          <KpiCard
            label={t('status_suspended')}
            value={userStats?.suspended_users}
            icon={Shield}
            color="#7C3AED"
            loading={userStatsLoading}
          />
          <KpiCard
            label={ta('dau')}
            value={userStats?.dau}
            icon={TrendingUp}
            color="#10B981"
            loading={userStatsLoading}
            tooltip={ta('dau_tooltip')}
          />
          <KpiCard
            label={ta('wau')}
            value={userStats?.wau}
            icon={TrendingUp}
            color="#63a8f1ff"
            loading={userStatsLoading}
            tooltip={ta('wau_tooltip')}
          />
          <KpiCard
            label={ta('mau')}
            value={userStats?.mau}
            icon={TrendingUp}
            color="#5f5cf6ff"
            loading={userStatsLoading}
            tooltip={ta('mau_tooltip')}
          />
        </div>

        {/* Registration trend */}
        {trend && trend.length > 0 && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 text-center">{ta('registration_trend_title')}</h4>
            <MiniLineChart data={trend} height={140} />
          </Card>
        )}

        {/* Status distribution */}
        {userStats && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 text-center">{ta('status_distribution_title')}</h4>
            <StatusDistribution
              active={userStats.active_users}
              locked={userStats.locked_users}
              suspended={userStats.suspended_users}
              banned={userStats.banned_users}
              t={t}
            />
          </Card>
        )}
      </section>

      {/* ═══ Section 2: Course Metrics ═══════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title={ta('section_courses')}
          refreshedAt={courseStats?.[0]?.refreshed_at}
          onExport={() => courseStats && handleExportCsv('course-metrics', courseStats as unknown as Record<string, unknown>[])}
          locale={locale}
          ta={ta}
        />

        {courseStats && courseStats.length > 0 && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 text-center">{ta('top_courses_title')}</h4>
            <HorizontalBarChart data={courseStats.slice(0, 10)} />
          </Card>
        )}

        {courseStats && courseStats.length > 0 && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-4 text-center">{ta('course_engagement_title')}</h4>
            <div className="space-y-3">
              {courseStats.slice(0, 10).map((c) => (
                <ProgressRow key={c.course_id} course={c} ta={ta} />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ═══ Section 3: Activity Heatmap ═════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title={ta('section_activity')}
          onExport={() => activity && handleExportCsv('activity-heatmap', activity as unknown as Record<string, unknown>[])}
          locale={locale}
          ta={ta}
        />

        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setRiskFilter(null)}
            className={cn(
              'text-[10px] font-bold px-2 py-1 rounded-md transition-all',
              !riskFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            All
          </button>
          {['low', 'medium', 'high', 'critical'].map((level) => (
            <button
              key={level}
              onClick={() => setRiskFilter(level)}
              className={cn(
                'text-[10px] font-bold px-2 py-1 rounded-md transition-all capitalize',
                riskFilter === level ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {level}
            </button>
          ))}
        </div>

        {activity && activity.length > 0 && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-4 border-border/50">
            <ActivityHeatmap data={activity} riskFilter={riskFilter} ta={ta} locale={locale} />
          </Card>
        )}

        {(!activity || activity.length === 0) && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center text-sm text-muted-foreground border-border/50">
            <Schedule className="text-3xl opacity-30 mb-2" />
            <p>{ta('no_activity_data')}</p>
          </Card>
        )}
      </section>

      {/* ═══ Section 4: Geographic Distribution ══════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title={ta('section_geo')}
          onExport={() => geoData && handleExportCsv('geographic', geoData as unknown as Record<string, unknown>[])}
          locale={locale}
          ta={ta}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Map Visualization */}
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-4 border-border/50 flex flex-col items-center justify-center min-h-[400px]">
            {globalPoints && globalPoints.length > 0 ? (
               <GeoDistributionMap points={globalPoints} height={380} />
            ) : (
              <div className="flex flex-col items-center justify-center opacity-30 py-20">
                <Public className="text-6xl mb-4" />
                <p className="text-sm font-bold uppercase tracking-widest">{ta('no_geo_data')}</p>
              </div>
            )}
          </Card>

          {/* Region Table Fallback */}
          <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden border-border/50">
            {geoData && geoData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">#</th>
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Region / Country</th>
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Users</th>
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {geoData.map((g, i) => {
                      const totalGeo = geoData.reduce((s, x) => s + x.user_count, 0);
                      const pct = totalGeo > 0 ? ((g.user_count / totalGeo) * 100).toFixed(1) : '0';
                      return (
                        <tr key={g.country_code} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-foreground uppercase tracking-tight">{g.country_code}</td>
                          <td className="px-4 py-2.5 text-xs font-bold text-foreground">{g.user_count.toLocaleString()}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
                <Public className="text-3xl opacity-30 mb-2" />
                <p>{ta('no_geo_data')}</p>
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────
function SectionHeader({ title, refreshedAt, onExport, locale, ta }: { title: string; refreshedAt?: string | undefined; onExport?: (() => void) | undefined; locale: string; ta: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <div className="flex items-center gap-3">
        {refreshedAt && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <AccessTime className="text-xs" />
            {ta('updated_label', {
              time: new Date(refreshedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            })}
          </span>
        )}
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="text-xs" />
            CSV
          </button>
        )}
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: number | string | undefined;
  icon: React.ElementType;
  color?: string;
  bgColor?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  loading?: boolean;
  tooltip?: string;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  color = '#4F46E5',
  bgColor,
  loading,
  tooltip,
}: KpiCardProps) {
  const content = (
    <StatsCardContent className="flex flex-row items-center gap-4 p-5">
      <StatsCardIcon style={{ backgroundColor: bgColor || `${color}15`, color: color }} className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center">
        <Icon sx={{ fontSize: 20 }} />
      </StatsCardIcon>
      <div className="flex flex-col min-w-0 flex-1">
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.2, textTransform: 'uppercase', fontSize: 'clamp(0.6rem, 1vw, 0.65rem)' }} className="truncate w-full">
          {label}
        </Typography>
        <Typography variant="h3" color="text.primary" sx={{ fontWeight: 800, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', lineHeight: 1.1 }} className="truncate w-full">
          {loading ? (
            <Box component="span" sx={{ height: 24, width: 48, bgcolor: 'neutral.100', display: 'inline-block', animation: 'pulse 1.5s infinite', borderRadius: 1 }} />
          ) : (
            (value ?? 0).toLocaleString()
          )}
        </Typography>
        {trend && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.25,
              color: trend.isPositive ? 'success.main' : 'error.main',
            }}
          >
            {trend.isPositive ? <TrendingUpIcon sx={{ fontSize: 12 }} /> : <TrendingDownIcon sx={{ fontSize: 12 }} />}
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '10px' }}>
              {trend.value}
            </Typography>
          </Box>
        )}
      </div>
    </StatsCardContent>
  );

  return (
    <StatsCard className="transition-all duration-300 hover:bg-muted/20 active:scale-[0.98]">
      {tooltip ? (
        <Tooltip title={tooltip} arrow placement="top">
          <div className="w-full h-full cursor-help">
            {content}
          </div>
        </Tooltip>
      ) : (
        content
      )}
    </StatsCard>
  );
}

// ── Status Distribution Bar ──────────────────────────────────────
function StatusDistribution({ active, locked, suspended, banned, t }: {
  active: number; locked: number; suspended: number; banned: number; t: ReturnType<typeof useTranslations>;
}) {
  const total = active + locked + suspended + banned || 1;
  const segments = [
    { label: t('status_active'), value: active, color: 'bg-emerald-500' },
    { label: t('status_locked'), value: locked, color: 'bg-orange-500' },
    { label: t('status_suspended'), value: suspended, color: 'bg-amber-500' },
    { label: t('status_banned'), value: banned, color: 'bg-red-500' },
  ];

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden bg-muted mb-3">
        {segments.map((s) => (
          s.value > 0 && (
            <div
              key={s.label}
              className={cn('h-full transition-all', s.color)}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          )
        ))}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={cn('h-2.5 w-2.5 rounded-full', s.color)} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-xs font-bold text-foreground">{s.value.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">({((s.value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini Line Chart (SVG) ────────────────────────────────────────
function MiniLineChart({ data, height = 120 }: { data: DailyCount[]; height?: number }) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const w = 100;
  const h = height;
  const padding = 2;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (w - 2 * padding);
    const y = h - padding - (d.count / maxVal) * (h - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padding},${h - padding} ${points} ${w - padding},${h - padding}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polygon points={areaPoints} fill="url(#areaGradient)" opacity={0.2} />
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Horizontal Bar Chart ─────────────────────────────────────────
function HorizontalBarChart({ data }: { data: CourseWithStats[] }) {
  const maxEnrolled = Math.max(...data.map((c) => c.enrolled), 1);

  return (
    <div className="space-y-2">
      {data.map((c) => (
        <div key={c.course_id} className="flex items-center gap-3">
          <span className="text-xs text-foreground font-medium w-40 truncate" title={c.title}>
            {c.title || c.course_id.slice(0, 8)}
          </span>
          <div className="flex-1 h-5 bg-muted rounded-lg overflow-hidden">
            <div
              className="h-full bg-primary/80 rounded-lg transition-all duration-500"
              style={{ width: `${(c.enrolled / maxEnrolled) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold text-foreground min-w-[40px] text-end">{c.enrolled}</span>
        </div>
      ))}
    </div>
  );
}

// ── Progress Row ─────────────────────────────────────────────────
function ProgressRow({ course, ta }: { course: CourseWithStats; ta: ReturnType<typeof useTranslations> }) {
  const completionRate = course.enrolled > 0 ? ((course.completed / course.enrolled) * 100).toFixed(0) : '0';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-foreground font-medium w-40 truncate" title={course.title}>
        {course.title || course.course_id.slice(0, 8)}
      </span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div className="h-full flex">
          <div className="bg-emerald-500 h-full" style={{ width: `${completionRate}%` }} />
          <div className="bg-primary/30 h-full" style={{ width: `${Math.max(0, (course.avg_progress ?? 0) - Number(completionRate))}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-[100px] justify-end">
        <span className="text-[10px] text-emerald-600 font-bold">{ta('percent_done', { pct: completionRate })}</span>
        <span className="text-[10px] text-muted-foreground">{ta('avg_label', { val: course.avg_progress })}</span>
      </div>
    </div>
  );
}

// ── Activity Heatmap ─────────────────────────────────────────────
function ActivityHeatmap({ data, riskFilter: _riskFilter, ta, locale }: { data: MvDailyRevenue[]; riskFilter: string | null; ta: ReturnType<typeof useTranslations>; locale: string }) {
  const filtered = useMemo(() => {
    // Note: v13 vw_daily_revenue does not have risk_level, it tracks financial activity.
    // We display all daily revenue events here.
    return data;
  }, [data]);

  // Group by enrollment_date
  const dayMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filtered) {
      const time = new Date(d.enrollment_date);
      if (!Number.isFinite(time.getTime())) continue;
      const day = time.toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + d.new_enrollments);
    }
    return map;
  }, [filtered]);

  const maxCount = Math.max(...Array.from(dayMap.values()), 1);
  const days = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (days.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center text-sm text-muted-foreground">
        {ta('no_activity_data')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 overflow-x-auto">
      <div className="flex flex-wrap gap-1 min-w-[600px]">
        {days.map(([day, count]) => {
          const intensity = count / maxCount;
          const time = new Date(day + 'T00:00:00Z');
          return (
            <div
              key={day}
              className="w-6 h-6 rounded-sm cursor-pointer transition-all hover:scale-125"
              style={{
                backgroundColor: `hsl(var(--primary-hue, 240) 70% ${90 - intensity * 60}%)`,
                opacity: 0.3 + intensity * 0.7,
              }}
              title={`${time.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })} — ${count} new enrollments`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] text-muted-foreground">{ta('less_label')}</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: `hsl(var(--primary-hue, 240) 70% ${90 - i * 60}%)`,
              opacity: 0.3 + i * 0.7,
            }}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">{ta('more_label')}</span>
      </div>
    </div>
  );
}
