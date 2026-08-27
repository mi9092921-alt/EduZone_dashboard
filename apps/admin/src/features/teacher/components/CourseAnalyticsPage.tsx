'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Breadcrumbs,
  Link,
  IconButton,
  Chip,
  Button,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import {
  NavigateNext,
  ArrowBack,
  Group,
  Verified,
  Schedule,
  Bolt,
  TrendingUp,
  CalendarToday,
  Download,
  Star,
} from '@mui/icons-material';
import { useCourseById, useCourseStats } from '@/adapters/queries/courses.queries';
import { useTranslations } from 'next-intl';

export function CourseAnalyticsPage() {
  const theme = useTheme();
  const t = useTranslations('analytics');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const { data: course } = useCourseById(courseId);
  const { data: stats, isLoading } = useCourseStats(courseId);

  const kpiCards = [
    {
      label: t('total_enrolled'),
      value: stats?.enrolled ?? 0,
      icon: <Group sx={{ fontSize: 24 }} />,
      iconColor: theme.palette.primary.main,
      change: '+12%',
      changePositive: true,
      progress: 75,
    },
    {
      label: t('avg_completion'),
      value: `${stats?.avg_progress?.toFixed(1) ?? 0}%`,
      icon: <Verified sx={{ fontSize: 24 }} />,
      iconColor: theme.palette.success.main,
      change: '+2.4%',
      changePositive: true,
      progress: stats?.avg_progress ?? 0,
    },
    {
      label: t('total_watch_time'),
      value: `${stats?.total_views ?? 0} hrs`,
      icon: <Schedule sx={{ fontSize: 24 }} />,
      iconColor: theme.palette.secondary.main,
      change: '+8.1%',
      changePositive: true,
      progress: 88,
    },
    {
      label: t('active_students'),
      value: stats?.enrolled ?? 0,
      icon: <Bolt sx={{ fontSize: 24 }} />,
      iconColor: theme.palette.warning.main,
      change: '-3.2%',
      changePositive: false,
      progress: 45,
    },
  ];

  // Simulated lesson data (would come from real API)
  const lessons = [
    { title: '1. Introduction to Compound Components', watchTime: '1,420 hrs', dropOff: 4.2, dropColor: 'success', comments: 342, rating: 4.9 },
    { title: '2. High-Order Components & Logic Reuse', watchTime: '1,105 hrs', dropOff: 12.8, dropColor: 'warning', comments: 289, rating: 4.8 },
    { title: '3. Performance Optimization with useMemo', watchTime: '982 hrs', dropOff: 24.5, dropColor: 'error', comments: 512, rating: 4.7 },
    { title: '4. Render Props: The Full Picture', watchTime: '845 hrs', dropOff: 6.1, dropColor: 'success', comments: 124, rating: 4.9 },
  ];

  // Progress distribution
  const bars = [
    { label: '0-20%', height: 15 },
    { label: '21-40%', height: 35 },
    { label: '41-60%', height: 85 },
    { label: '61-80%', height: 60 },
    { label: '81-100%', height: 45 },
  ];

  return (
    <Box>
      {/* Actions Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 4, gap: 2, alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<CalendarToday />}
          sx={{ 
            textTransform: 'none', 
            fontWeight: 600, 
            borderRadius: 3, 
            borderColor: 'divider', 
            color: alpha(theme.palette.text.primary, 0.6),
            px: 2,
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' }
          }}
        >
          {t('last_30_days')}
        </Button>
        <Button
          variant="contained"
          startIcon={<Download />}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 3,
            px: 3,
            boxShadow: 'none',
            '&:hover': { boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}` },
          }}
        >
          {t('export_csv')}
        </Button>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress color="primary" />
        </Box>
      ) : (
        <>
          {/* KPI Cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3, mb: 4 }}>
            {kpiCards.map((kpi) => (
              <Box 
                key={kpi.label} 
                sx={{ 
                  position: 'relative', 
                  bgcolor: 'background.paper', 
                  borderRadius: 4, 
                  border: '1px solid', 
                  borderColor: 'divider',
                  p: 2.5,
                  transition: 'background-color 0.2s',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <Box 
                  sx={{ 
                    width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2,
                    backgroundColor: alpha(kpi.iconColor, 0.1), color: kpi.iconColor, boxShadow: (t) => `0 0 0 1px ${alpha(t.palette.divider, 0.05)}`
                  }}
                >
                  {kpi.icon}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="overline" sx={{ color: alpha(theme.palette.text.primary, 0.6), fontWeight: 700, lineHeight: 1.2, mb: 1, textTransform: 'uppercase', fontSize: '0.625rem' }}>
                      {kpi.label}
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary' }}>
                      {kpi.value ?? '0'}
                    </Typography>
                    <Box sx={{ mt: 2, width: '100%', px: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={kpi.progress}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: 'action.disabledBackground',
                          '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: kpi.iconColor },
                        }}
                      />
                    </Box>
                  </Box>
                  <Chip
                    label={kpi.change}
                    size="small"
                    color={kpi.changePositive ? 'success' : 'error'}
                    sx={{
                      fontWeight: 800,
                      fontSize: '0.65rem',
                      height: 20,
                      position: 'absolute',
                      top: 12,
                      right: 12,
                    }}
                  />
              </Box>
            ))}
          </Box>

          {/* Charts section */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, mb: 4 }}>
            {/* Enrollment Trends */}
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, border: '1px solid', borderColor: 'divider', boxShadow: (t) => t.shadows[1] }}>
              <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>{t('enrollment_trends')}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>{t('new_students_30d')}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'primary.main' }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{t('current')}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'divider' }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{t('previous')}</Typography>
                    </Box>
                  </Box>
                </Box>
                {/* SVG Chart */}
                <Box sx={{ height: 260, backgroundColor: 'action.hover', borderRadius: 3, overflow: 'hidden', p: 3, position: 'relative' }}>
                  <svg width="100%" height="100%" viewBox="0 0 400 100" preserveAspectRatio="none">
                    <path d="M0,80 Q50,75 100,50 T200,40 T300,20 T400,10" fill="none" stroke={theme.palette.divider} strokeWidth="2.5" opacity="0.6" />
                    <path d="M0,90 Q50,85 100,60 T200,65 T300,40 T400,25" fill="none" stroke={theme.palette.primary.main} strokeWidth="3" />
                    <circle cx="100" cy="60" r="4" fill={theme.palette.primary.main} />
                    <circle cx="200" cy="65" r="4" fill={theme.palette.primary.main} />
                    <circle cx="300" cy="40" r="4" fill={theme.palette.primary.main} />
                  </svg>
                  <Box sx={{ position: 'absolute', bottom: 20, left: 24, right: 24, display: 'flex', justifyContent: 'space-between' }}>
                    {[1, 10, 20, 30].map((d) => (
                      <Typography key={d} variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', fontWeight: 700 }}>{t('day')} {d}</Typography>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Progress Distribution */}
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, border: '1px solid', borderColor: 'divider', boxShadow: (t) => t.shadows[1] }}>
              <Box sx={{ p: 4 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>{t('progress_dist')}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>{t('completion_pct')}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mt: 5, height: 240, px: 2 }}>
                  {bars.map((bar) => (
                    <Box key={bar.label} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{
                          width: '100%',
                          height: `${bar.height}%`,
                          borderRadius: '6px 6px 0 0',
                          backgroundColor: 'primary.main',
                          opacity: 0.1,
                          transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                          cursor: 'pointer',
                          '&:hover': { 
                            opacity: 1,
                            transform: 'scaleY(1.05)',
                            transformOrigin: 'bottom'
                          },
                        }}
                      />
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', fontWeight: 800 }}>{bar.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>


          {/* Lesson Analytics Table */}
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, border: '1px solid', borderColor: 'divider', boxShadow: (t) => t.shadows[1], overflow: 'hidden' }}>
            <Box sx={{ p: 4, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>{t('lesson_analytics')}</Typography>
                <Typography variant="caption" sx={{ color: alpha(theme.palette.text.primary, 0.6), fontWeight: 500 }}>{t('sorted_by_engagement')}</Typography>
              </Box>
            </Box>
            <TableContainer>
              <Table sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: alpha(theme.palette.text.primary, 0.6), py: 2 }}>{t('header_lesson_title')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: alpha(theme.palette.text.primary, 0.6), py: 2 }}>{t('header_watch_time')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: alpha(theme.palette.text.primary, 0.6), py: 2 }}>{t('header_drop_off')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: alpha(theme.palette.text.primary, 0.6), py: 2 }}>{t('header_engagements')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: alpha(theme.palette.text.primary, 0.6), py: 2 }}>{t('header_rating')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lessons.map((row) => (
                    <TableRow key={row.title} hover sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                          {row.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: alpha(theme.palette.text.primary, 0.6) }}>
                          {row.watchTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: `${row.dropColor}.main`, minWidth: 45 }}>
                            {row.dropOff}%
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={row.dropOff}
                            color={row.dropColor as any}
                            sx={{
                              width: 80,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: 'action.disabledBackground',
                              '& .MuiLinearProgress-bar': { borderRadius: 3 },
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: alpha(theme.palette.text.primary, 0.6) }}>
                          {t('comments_count', { count: row.comments })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Star sx={{ fontSize: 18, color: 'warning.main' }} />
                          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                            {row.rating}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ p: 3, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'action.hover' }}>
              <Typography variant="caption" sx={{ color: alpha(theme.palette.text.primary, 0.6), fontWeight: 700 }}>
                {tCommon('showing_lessons', { count: lessons.length, total: course?.sections?.length ?? lessons.length })}
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
