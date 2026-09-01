'use client';

import { School, Publish, EditNote, Archive } from '@mui/icons-material';
import { Typography, Box } from '@mui/material';
import { useTranslations } from 'next-intl';

import { useCoursesOverviewStats } from '@/adapters/queries/courses.queries';
import { StatsCard, StatsCardContent, StatsCardIcon } from '@/components/ui/Card';

export function CourseStatsCards() {
  const t = useTranslations('common');
  const { data: stats } = useCoursesOverviewStats();

  const STAT_CARDS = [
    {
      key: 'total',
      label: t('total_courses'),
      icon: School,
      bg: '#EEF2FF',
      color: '#4F46E5',
    },
    {
      key: 'published',
      label: t('published'),
      icon: Publish,
      bg: '#ECFDF5',
      color: '#10B981',
    },
    {
      key: 'draft',
      label: t('draft'),
      icon: EditNote,
      bg: '#FFFBEB',
      color: '#D97706',
    },
    {
      key: 'archived',
      label: t('archived'),
      icon: Archive,
      bg: '#F1F5F9',
      color: '#475569',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 mb-6">
      {STAT_CARDS.map((card) => {
        const Icon = card.icon;
        const val = stats?.[card.key as keyof typeof stats];

        return (
          <StatsCard key={card.key} className="transition-colors hover:bg-muted/20">
            <StatsCardContent className="flex flex-row items-center gap-4 p-5">
              <StatsCardIcon
                style={{ backgroundColor: card.bg, color: card.color }}
                className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
              >
                <Icon fontSize="small" />
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
                  {card.label}
                </Typography>
                <Typography
                  variant="h3"
                  color="text.primary"
                  sx={{
                    fontWeight: 800,
                    fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
                    lineHeight: 1.1,
                  }}
                  className="truncate w-full"
                >
                  {val !== undefined ? (
                    val.toLocaleString()
                  ) : (
                    <Box
                      component="span"
                      sx={{
                        height: 24,
                        width: 48,
                        bgcolor: 'neutral.100',
                        animation: 'pulse 1.5s infinite',
                        borderRadius: 1,
                        display: 'block',
                      }}
                    />
                  )}
                </Typography>
              </div>
            </StatsCardContent>
          </StatsCard>
        );
      })}
    </div>
  );
}
