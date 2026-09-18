'use client';

import {
  People,
  TrendingUp,
  Schedule,
  Shield,
  Public,
  Download,
  AccessTime,
  BarChart,
} from '@mui/icons-material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { Typography, Box, Tooltip } from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { useMemo, useState } from 'react';

// Design-system chart tokens: Primary Blue is the global --primary token
// (hsl(221.2 83.2% 53.3%) ≈ #2563EB); Secondary Cyan anchors the gradient/
// intensity scales. Kept as hex so SVG fills stay stable in both themes.
const PRIMARY_BLUE = '#2563EB';
const SECONDARY_CYAN = '#06B6D4';

import {
  useUserStats,
  useCourseStats,
  useDailyActivity,
  useRegistrationTrend,
  useGeographicDistribution,
} from '@/adapters/queries/analytics-mv.queries';
import { Card, StatsCard, StatsCardContent, StatsCardIcon } from '@/components/ui/Card';
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner';
import type {
  CourseWithStats,
  MvDailyRevenue,
  DailyCount,
  GeoPoint,
} from '@/domain/types/analytics.types';
import { cn } from '@/lib/utils';

export function AnalyticsPage() {
  const userStatsQuery = useUserStats();
  const courseStatsQuery = useCourseStats();
  // 26-week heatmap window (see ActivityHeatmap) — the RPC reads activity_logs
  // directly, so asking for the full window is cheap and future-proof.
  const activityQuery = useDailyActivity(undefined, 182);
  const trendQuery = useRegistrationTrend(90);
  const geoQuery = useGeographicDistribution();
  const { data: userStats, isLoading: userStatsLoading } = userStatsQuery;
  const { data: courseStats } = courseStatsQuery;
  const { data: activity } = activityQuery;
  const { data: trend } = trendQuery;
  const { data: geoData } = geoQuery;
  const t = useTranslations('users');
  const ta = useTranslations('analytics');
  const tc = useTranslations('common');
  const locale = useLocale();

  const anyQueryError =
    userStatsQuery.isError ||
    courseStatsQuery.isError ||
    activityQuery.isError ||
    trendQuery.isError ||
    geoQuery.isError;
  const retryAllQueries = async () => {
    await Promise.allSettled([
      userStatsQuery.refetch(),
      courseStatsQuery.refetch(),
      activityQuery.refetch(),
      trendQuery.refetch(),
      geoQuery.refetch(),
    ]);
  };

  // Courses with zero enrollments render as meaningless empty bars —
  // rank only courses that actually have learners.
  const topCourses = useMemo(
    () => (courseStats ?? []).filter((c) => c.enrolled > 0),
    [courseStats],
  );

  const geoTotalUsers = useMemo(
    () => (geoData ?? []).reduce((s, g) => s + g.user_count, 0),
    [geoData],
  );

  // M9: generic object export — callers pass their typed DTOs directly,
  // no blind casts needed at the call sites.
  const handleExportCsv = (sectionName: string, data: readonly object[]) => {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]!);
    const csv = [
      keys.join(','),
      ...data.map((row) => keys.map((k) => JSON.stringify((row as Record<string, unknown>)[k] ?? '')).join(',')),
    ].join('\n');
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

      <QueryErrorBanner isError={anyQueryError} refetch={retryAllQueries} />

      {/* ═══ Section 1: User Metrics ═════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title={ta('section_users')}
          refreshedAt={userStats?.refreshed_at ?? userStats?.last_updated}
          onExport={() =>
            userStats && handleExportCsv('user-metrics', [userStats])
          }
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

        {/* Registration trend — always visible with an empty state */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 text-center">
            {ta('registration_trend_title')}
          </h4>
          {trend && trend.length > 0 ? (
            <MiniLineChart data={trend} height={160} locale={locale} />
          ) : (
            <EmptyChartState
              icon={<TrendingUp className="text-3xl opacity-30 mb-2" />}
              message={ta('no_registration_data')}
            />
          )}
        </Card>

        {/* Status distribution */}
        {userStats && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 text-center">
              {ta('status_distribution_title')}
            </h4>
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
          onExport={() => topCourses.length > 0 && handleExportCsv('course-metrics', topCourses)}
          locale={locale}
          ta={ta}
        />

        <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 text-center">
            {ta('top_courses_title')}
          </h4>
          {topCourses.length > 0 ? (
            <HorizontalBarChart data={topCourses.slice(0, 10)} />
          ) : (
            <EmptyChartState
              icon={<BarChart className="text-3xl opacity-30 mb-2" />}
              message={ta('no_course_data')}
            />
          )}
        </Card>

        <Card className="rounded-2xl border border-border bg-card shadow-sm p-5 border-border/50">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-4 text-center">
            {ta('course_engagement_title')}
          </h4>
          {topCourses.length > 0 ? (
            <div className="space-y-3">
              {topCourses.slice(0, 10).map((c) => (
                <ProgressRow key={c.course_id} course={c} ta={ta} />
              ))}
            </div>
          ) : (
            <EmptyChartState
              icon={<BarChart className="text-3xl opacity-30 mb-2" />}
              message={ta('no_course_data')}
            />
          )}
        </Card>
      </section>

      {/* ═══ Section 3: Activity Heatmap ═════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title={ta('section_activity')}
          onExport={() =>
            activity && handleExportCsv('activity-heatmap', activity)
          }
          locale={locale}
          ta={ta}
        />

        {/* Note: no risk-level filter — vw_daily_revenue tracks enrollment
            volume only, it has no risk_level dimension to filter on. */}
        {activity && activity.length > 0 && (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-4 border-border/50">
            <ActivityHeatmap data={activity} ta={ta} locale={locale} />
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
          onExport={() => geoData && geoData.length > 0 && handleExportCsv('geographic', geoData)}
          locale={locale}
          ta={ta}
        />

        {(!geoData || geoData.length === 0) ? (
          <Card className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center text-sm text-muted-foreground border-border/50">
            <Public className="text-3xl opacity-30 mb-2" />
            <p>{ta('no_geo_data')}</p>
          </Card>
        ) : geoData.length === 1 ? (
          /* Single region: a bar list + a table row would both display the
             exact same fact — summarize it as KPIs instead. */
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <KpiCard
              label={ta('primary_region_label')}
              value={geoData[0]!.label || geoData[0]!.country_code}
              icon={Public}
              color={PRIMARY_BLUE}
            />
            <KpiCard
              label={tc('total_users')}
              value={geoData[0]!.user_count}
              icon={People}
              color={SECONDARY_CYAN}
            />
            <KpiCard
              label={ta('total_regions_label')}
              value={geoData.length}
              icon={Shield}
              color={PRIMARY_BLUE}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* #1 region is featured here, so the table starts at rank #2 */}
            <PrimaryRegionCard region={geoData[0]!} totalUsers={geoTotalUsers} ta={ta} />
            <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden border-border/50">
              <h4
                className="text-xs font-semibold uppercase px-4 pt-4 pb-2"
                style={{ color: PRIMARY_BLUE }}
              >
                {ta('other_regions_title')}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                        #
                      </th>
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                        {ta('region_column')}
                      </th>
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                        {tc('total_users')}
                      </th>
                      <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                        {ta('share_label')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {geoData.slice(1).map((g, i) => {
                      const pct =
                        geoTotalUsers > 0 ? ((g.user_count / geoTotalUsers) * 100).toFixed(1) : '0';
                      return (
                        <tr key={g.country_code} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 2}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-foreground tracking-tight">
                            {g.label || g.country_code}
                            <span className="ms-2 text-[10px] font-mono text-muted-foreground">
                              {g.country_code}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-bold text-foreground">
                            {g.user_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: SECONDARY_CYAN,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────
function SectionHeader({
  title,
  refreshedAt,
  onExport,
  locale,
  ta,
}: {
  title: string;
  refreshedAt?: string | undefined;
  onExport?: (() => void) | undefined;
  locale: string;
  ta: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <div className="flex items-center gap-3">
        {refreshedAt && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <AccessTime className="text-xs" />
            {(() => {
              const date = new Date(refreshedAt);
              if (!Number.isFinite(date.getTime())) return ta('updated_label', { time: '—' });
              return ta('updated_label', {
                time: date.toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              });
            })()}
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
      <StatsCardIcon
        style={{ backgroundColor: bgColor || `${color}15`, color: color }}
        className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
      >
        <Icon sx={{ fontSize: 20 }} />
      </StatsCardIcon>
      <div className="flex flex-col min-w-0 flex-1">
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{
            fontWeight: 700,
            mb: 0.5,
            lineHeight: 1.2,
            textTransform: 'uppercase',
            fontSize: 'clamp(0.6rem, 1vw, 0.65rem)',
          }}
          className="truncate w-full"
        >
          {label}
        </Typography>
        <Typography
          variant="h3"
          color="text.primary"
          sx={{ fontWeight: 800, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', lineHeight: 1.1 }}
          className="truncate w-full"
        >
          {loading ? (
            <Box
              component="span"
              sx={{
                height: 24,
                width: 48,
                bgcolor: 'neutral.100',
                display: 'inline-block',
                animation: 'pulse 1.5s infinite',
                borderRadius: 1,
              }}
            />
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
            {trend.isPositive ? (
              <TrendingUpIcon sx={{ fontSize: 12 }} />
            ) : (
              <TrendingDownIcon sx={{ fontSize: 12 }} />
            )}
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
          <div className="w-full h-full cursor-help">{content}</div>
        </Tooltip>
      ) : (
        content
      )}
    </StatsCard>
  );
}

// ── Status Distribution Bar ──────────────────────────────────────
function StatusDistribution({
  active,
  locked,
  suspended,
  banned,
  t,
}: {
  active: number;
  locked: number;
  suspended: number;
  banned: number;
  t: ReturnType<typeof useTranslations>;
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
        {segments.map(
          (s) =>
            s.value > 0 && (
              <div
                key={s.label}
                className={cn('h-full transition-all', s.color)}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.label}: ${s.value}`}
              />
            ),
        )}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={cn('h-2.5 w-2.5 rounded-full', s.color)} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-xs font-bold text-foreground">{s.value.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">
              ({((s.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini Line Chart (SVG) ────────────────────────────────────────
// Proportional viewBox (730xH) scaled to the container. The series is drawn
// with Fritsch–Carlson monotone cubic interpolation so sparse spikes stay
// smooth instead of zig-zagging into triangles, over a Primary Blue line with
// a Secondary Cyan gradient fill. Points only materialize on hover, with a
// rounded tooltip bubble.
const CHART_W = 730;

function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]!.x},${pts[0]!.y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]!.x - pts[i]!.x;
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1]!.y - pts[i]!.y) / dx[i]!;
  }

  const m: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2;
  }
  m[n - 1] = slope[n - 2]!;

  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / slope[i]!;
    const b = m[i + 1]! / slope[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i]!;
      m[i + 1] = t * b * slope[i]!;
    }
  }

  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]!;
    d += ` C ${pts[i]!.x + h / 3},${pts[i]!.y + m[i]! * h / 3} ${
      pts[i + 1]!.x - h / 3
    },${pts[i + 1]!.y - m[i + 1]! * h / 3} ${pts[i + 1]!.x},${pts[i + 1]!.y}`;
  }
  return d;
}

function MiniLineChart({
  data,
  height = 160,
  locale,
}: {
  data: DailyCount[];
  height?: number;
  locale: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const w = CHART_W;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const x = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / maxVal) * innerH;

  const pts = data.map((d, i) => ({ x: x(i), y: y(d.count) }));
  const linePath = monotonePath(pts);
  const areaPath = `${linePath} L ${padL + innerW},${padT + innerH} L ${padL},${padT + innerH} Z`;

  const fmtDay = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const fmtFull = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });

  // First / middle / last date ticks
  const tickIdx =
    data.length > 2 ? [0, Math.floor(data.length / 2), data.length - 1] : data.map((_, i) => i);

  const peakIdx = data.reduce((best, d, i) => (d.count > data[best]!.count ? i : best), 0);

  const clampPct = (p: number) => Math.min(88, Math.max(12, p));
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ maxHeight: height * 1.6 }}>
        <defs>
          <linearGradient id="regTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SECONDARY_CYAN} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SECONDARY_CYAN} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Gridlines: max / mid / base */}
        {[1, 0.5, 0].map((f) => (
          <g key={f}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y(maxVal * f)}
              y2={y(maxVal * f)}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
              strokeDasharray={f === 0 ? undefined : '4 4'}
            />
            <text
              x={padL - 6}
              y={y(maxVal * f) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {Math.round(maxVal * f)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#regTrendFill)" />
        <path
          d={linePath}
          fill="none"
          stroke={PRIMARY_BLUE}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Peak value — floats clearly above the dot with a card-colored halo */}
        {data[peakIdx]!.count > 0 && (
          <text
            x={x(peakIdx)}
            y={y(data[peakIdx]!.count) - 14}
            textAnchor="middle"
            className="fill-foreground"
            fontSize="11"
            fontWeight="700"
            stroke="hsl(var(--card))"
            strokeWidth="3"
            style={{ paintOrder: 'stroke' }}
          >
            {data[peakIdx]!.count}
          </text>
        )}

        {/* Hover marker — dots exist only while hovering (clean rest state) */}
        {hoverIdx !== null && data[hoverIdx] && (
          <circle
            cx={x(hoverIdx)}
            cy={y(data[hoverIdx].count)}
            r="4.5"
            fill={PRIMARY_BLUE}
            stroke="hsl(var(--card))"
            strokeWidth="2"
          />
        )}

        {/* Date ticks */}
        {tickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 6}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground"
            fontSize="10"
          >
            {fmtDay(data[i]!.date)}
          </text>
        ))}

        {/* Hover capture surface (transparent still receives pointer events) */}
        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        />
      </svg>

      {hoverIdx !== null && data[hoverIdx] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-md"
          style={{
            left: `${clampPct((x(hoverIdx) / w) * 100)}%`,
            top: `${(y(data[hoverIdx].count) / height) * 100}%`,
            marginTop: -10,
          }}
        >
          <p className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            {fmtFull(data[hoverIdx].date)}
          </p>
          <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIMARY_BLUE }} />
            {data[hoverIdx].count.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Empty chart state ────────────────────────────────────────────
function EmptyChartState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
      {icon}
      <p>{message}</p>
    </div>
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
          <span className="text-xs font-bold text-foreground min-w-[40px] text-end">
            {c.enrolled}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Progress Row ─────────────────────────────────────────────────
function ProgressRow({
  course,
  ta,
}: {
  course: CourseWithStats;
  ta: ReturnType<typeof useTranslations>;
}) {
  const completionRate =
    course.enrolled > 0 ? ((course.completed / course.enrolled) * 100).toFixed(0) : '0';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-foreground font-medium w-40 truncate" title={course.title}>
        {course.title || course.course_id.slice(0, 8)}
      </span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div className="h-full flex">
          <div className="bg-emerald-500 h-full" style={{ width: `${completionRate}%` }} />
          <div
            className="bg-primary/30 h-full"
            style={{
              width: `${Math.max(0, (course.avg_progress ?? 0) - Number(completionRate))}%`,
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-[100px] justify-end">
        <span className="text-[10px] text-emerald-600 font-bold">
          {ta('percent_done', { pct: completionRate })}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {ta('avg_label', { val: Math.round(course.avg_progress ?? 0) })}
        </span>
      </div>
    </div>
  );
}

// ── Activity Heatmap (GitHub-style calendar, SVG) ────────────────
// A continuous 26-week (182-day) window ending today, Monday-aligned, drawn
// in a viewBox so the grid scales to the full container width instead of
// huddling on the left with dead whitespace. Intensity ramps the brand
// scale: Primary Blue (#2563EB) for low → Secondary Cyan (#06B6D4) for high,
// neutral muted for empty days.
const HEATMAP_WEEKS = 26;
const HEATMAP_SCALE = ['#1D78E5', '#168DE0', '#0EA1DA', SECONDARY_CYAN];

function heatmapCellColor(intensity: number): string {
  if (intensity <= 0) return '';
  const idx = Math.min(HEATMAP_SCALE.length - 1, Math.floor(intensity * HEATMAP_SCALE.length));
  return HEATMAP_SCALE[idx]!;
}

function ActivityHeatmap({
  data,
  ta,
  locale,
}: {
  data: MvDailyRevenue[];
  ta: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const dayMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data) {
      const time = new Date(d.enrollment_date);
      if (!Number.isFinite(time.getTime())) continue;
      const day = time.toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + d.new_enrollments);
    }
    return map;
  }, [data]);

  // Continuous coverage: every day of the window renders (gray when zero),
  // so the timeline never collapses to only the weeks that have data.
  const weeks = useMemo(() => {
    const today = new Date();
    const end = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (HEATMAP_WEEKS * 7 - 1));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // back to Monday

    const grid: { date: string; count: number }[][] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const week: { date: string; count: number }[] = [];
      for (let i = 0; i < 7 && cursor <= end; i++) {
        const key = cursor.toISOString().slice(0, 10);
        week.push({ date: key, count: dayMap.get(key) ?? 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      grid.push(week);
    }
    return grid;
  }, [dayMap]);

  const maxCount = Math.max(...Array.from(dayMap.values()), 1);

  const fmtDay = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });

  // Geometry: viewBox 730 wide, scaled fluidly. ~27 columns → cells ~22px.
  const w = 730;
  const gap = 3;
  const padL = 34;
  const padT = 16;
  const padR = 4;
  const cols = weeks.length;
  const cell = Math.floor((w - padL - padR - gap * (cols - 1)) / cols);
  const h = padT + 7 * (cell + gap) + 2;
  const cx = (col: number) => padL + col * (cell + gap);
  const cy = (row: number) => padT + row * (cell + gap);

  const weekdayLabels = [1, 3, 5].map((i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );

  return (
    <div dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* Month labels — anchored to the column where each month starts */}
        {weeks.map((week, wi) => {
          const prev = wi > 0 ? weeks[wi - 1]![0]!.date : null;
          if (!week[0] || (prev && week[0].date.slice(5, 7) === prev.slice(5, 7))) return null;
          return (
            <text
              key={`m-${week[0].date}`}
              x={cx(wi)}
              y={11}
              textAnchor="start"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {new Date(`${week[0].date}T00:00:00Z`).toLocaleDateString(locale, {
                month: 'short',
                timeZone: 'UTC',
              })}
            </text>
          );
        })}

        {/* Weekday labels (rows 1/3/5 = Tue/Thu/Sat; rows are Monday-first) */}
        {[1, 3, 5].map((row) => (
          <text
            key={row}
            x={padL - 8}
            y={cy(row) + cell / 2 + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize="9"
          >
            {weekdayLabels[[1, 3, 5].indexOf(row)]}
          </text>
        ))}

        {weeks.map((week, wi) => (
          <g key={week[0]?.date ?? wi}>
            {week.map((d, row) => {
              const color = heatmapCellColor(d.count / maxCount);
              return (
                <rect
                  key={d.date}
                  x={cx(wi)}
                  y={cy(row)}
                  width={cell}
                  height={cell}
                  rx={Math.min(4, Math.round(cell / 6))}
                  fill={color || 'hsl(var(--muted))'}
                  className="transition-opacity hover:opacity-80"
                >
                  <title>{`${fmtDay(d.date)} — ${d.count}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>

      {/* Legend — neatly beneath the grid */}
      <div className="flex items-center gap-1.5 mt-3">
        <span className="text-[10px] text-muted-foreground">{ta('less_label')}</span>
        <div className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: 'hsl(var(--muted))' }} />
        {HEATMAP_SCALE.map((color) => (
          <div key={color} className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: color }} />
        ))}
        <span className="text-[10px] text-muted-foreground">{ta('more_label')}</span>
      </div>
    </div>
  );
}

// ── Primary Region Feature Card ──────────────────────────────────
// Permanently features the #1 region (blue header, blue→cyan gradient bar)
// so the table beside it can start at rank #2 without duplicating the top row.
function PrimaryRegionCard({
  region,
  totalUsers,
  ta,
}: {
  region: GeoPoint;
  totalUsers: number;
  ta: ReturnType<typeof useTranslations>;
}) {
  const pct = totalUsers > 0 ? ((region.user_count / totalUsers) * 100).toFixed(1) : '0';

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-sm p-6 border-border/50 flex flex-col justify-center">
      <p
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: PRIMARY_BLUE }}
      >
        {ta('primary_region_label')}
      </p>
      <p className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground truncate">
        <span className="truncate">{region.label || region.country_code}</span>
        <span className="text-[10px] font-mono font-normal text-muted-foreground shrink-0">
          {region.country_code}
        </span>
      </p>
      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className="text-3xl font-extrabold tracking-tight text-foreground">
          {region.user_count.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">{ta('share_of_total', { pct })}</span>
      </div>
      <div className="mt-4 h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${PRIMARY_BLUE}, ${SECONDARY_CYAN})`,
          }}
        />
      </div>
    </Card>
  );
}
