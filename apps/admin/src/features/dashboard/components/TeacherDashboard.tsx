'use client';

import { People, School, TrendingUp, Warning } from '@mui/icons-material';
import { Typography, Box } from '@mui/material';
import { useTranslations } from 'next-intl';

import { useTeacherDashboardStats } from '@/adapters/queries/analytics.queries';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatsCard,
  StatsCardContent,
  StatsCardIcon,
} from '@/components/ui/Card';

export function TeacherDashboard() {
  const t = useTranslations('common');
  const { data: stats, isLoading } = useTeacherDashboardStats();

  const statCards = [
    {
      label: t('total_students'),
      value: stats?.totalUsers ?? '—',
      icon: People,
      bg: '#EEF2FF',
      color: '#4F46E5',
    },
    {
      label: t('published_courses'),
      value: stats?.activeCourses ?? '—',
      icon: School,
      bg: '#EEF2FF',
      color: '#10B981',
    },
    {
      label: t('analytics'),
      value: stats?.dailySessions ?? '—',
      icon: TrendingUp,
      bg: '#EEF2FF',
      color: '#6366F1',
    },
    {
      label: t('warnings'),
      value: stats?.pendingWarnings ?? '—',
      icon: Warning,
      bg: '#FEF2F2',
      color: '#EF4444',
    },
  ];

  return (
    <>
      <div className="space-y-1 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('dashboard')}</h1>
        <p className="text-sm text-muted-foreground">{t('welcome', { name: 'Teacher' })}</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <StatsCard
              key={stat.label}
              className="transition-all duration-300 hover:bg-muted/20 active:scale-[0.98]"
            >
              <StatsCardContent className="flex flex-row items-center gap-4 p-5">
                <StatsCardIcon
                  style={{ backgroundColor: stat.color + '1A', color: stat.color }}
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
                      fontSize: '0.625rem',
                    }}
                    className="truncate w-full"
                  >
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="h3"
                    color="text.primary"
                    sx={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.1 }}
                    className="truncate w-full"
                  >
                    {isLoading ? (
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
                      stat.value
                    )}
                  </Typography>
                </div>
              </StatsCardContent>
            </StatsCard>
          );
        })}
      </div>

      {/* Main Stats Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('course_engagement')}</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-2 border-dashed border-border rounded-xl m-4">
            <p className="text-body-muted italic">{t('engagement_empty_state')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('direct_actions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-indigo-50/30 border border-indigo-100 text-sm">
              <p className="font-bold text-indigo-700">{t('course_creation')}</p>
              <p className="text-[11px] text-indigo-600/70 font-medium">
                {t('course_creation_desc')}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50/30 border border-emerald-100 text-sm">
              <p className="font-bold text-emerald-700">{t('student_outreach')}</p>
              <p className="text-[11px] text-emerald-600/70 font-medium">
                {t('student_outreach_desc')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
