'use client';

import {
  People,
  CheckCircle,
  Lock,
  PauseCircle,
  Block,
} from '@mui/icons-material';
import { useUserStats } from '@/adapters/queries/users.queries';
import { Card, CardContent, StatsCard, StatsCardContent, StatsCardIcon } from '@/components/ui/Card';
import { Select, SelectItem } from '@/components/ui/Select';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Typography, Box, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  isLoading?: boolean;
}

function StatCard({ label, value, icon: Icon, iconColor, bgColor, isLoading }: StatCardProps) {
  return (
    <StatsCard className="transition-colors hover:bg-muted/20">
      <StatsCardContent className="flex flex-row items-center gap-4 p-5">
        <StatsCardIcon 
          style={{ backgroundColor: bgColor, color: iconColor }} 
          className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
        >
          <Icon fontSize="small" />
        </StatsCardIcon>
        <div className="flex flex-col min-w-0 flex-1">
          <Typography 
            variant="overline" 
            color="text.secondary" 
            sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.2, textTransform: 'uppercase', fontSize: 'clamp(0.6rem, 1vw, 0.65rem)' }} 
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
            {isLoading ? (
              <Box component="span" sx={{ height: 24, width: 48, bgcolor: 'neutral.100', animation: 'pulse 1.5s infinite', borderRadius: 1, display: 'block' }} />
            ) : (
              value.toLocaleString()
            )}
          </Typography>
        </div>
      </StatsCardContent>
    </StatsCard>
  );
}

export function UserStatsCards() {
  const theme = useTheme();
  const { data: stats, isLoading } = useUserStats();

  const t = useTranslations('users');
  const tCommon = useTranslations('common');

  const STATS = [
    {
      label: tCommon('total_users'),
      value: stats?.total_users ?? 0,
      icon: People,
      iconColor: theme.palette.primary.main,
      bgColor: alpha(theme.palette.primary.main, 0.1),
    },
    {
      label: t('status_active'),
      value: stats?.active_users ?? 0,
      icon: CheckCircle,
      iconColor: theme.palette.success.main,
      bgColor: alpha(theme.palette.success.main, 0.1),
    },
    {
      label: t('status_locked'),
      value: stats?.locked_users ?? 0,
      icon: Lock,
      iconColor: theme.palette.warning.main,
      bgColor: alpha(theme.palette.warning.main, 0.1),
    },
    {
      label: t('status_suspended'),
      value: stats?.suspended_users ?? 0,
      icon: PauseCircle,
      iconColor: theme.palette.secondary.main,
      bgColor: alpha(theme.palette.secondary.main, 0.1),
    },
    {
      label: t('status_banned'),
      value: stats?.banned_users ?? 0,
      icon: Block,
      iconColor: theme.palette.error.main,
      bgColor: alpha(theme.palette.error.main, 0.1),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
      {STATS.map((s, i) => (
        <StatCard
          key={i}
          label={s.label}
          value={s.value}
          icon={s.icon}
          iconColor={s.iconColor}
          bgColor={s.bgColor}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
