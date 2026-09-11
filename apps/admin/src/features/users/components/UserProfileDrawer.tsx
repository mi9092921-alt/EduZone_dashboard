'use client';

import {
  Close,
  Email,
  Phone,
  LocationOn,
  CalendarToday,
  Login,
  Visibility,
  Warning,
  Shield,
  DevicesOther,
  ExitToApp,
  VpnKey,
  Refresh,
  Info,
  Laptop,
  Smartphone,
  Language,
  Security,
  Fingerprint,
  Work,
  History,
  School,
  ContentCopy,
  OpenInNew,
  ExpandMore,
  ExpandLess,
  KeyboardArrowLeft,
  KeyboardArrowRight,
} from '@mui/icons-material';
import { Tooltip } from '@mui/material'; // Using MUI Tooltip as requested/implied for pro-tips
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';

import { formatDate, formatDistanceToNow } from './_utils';

import { useActivityLogs } from '@/adapters/queries/audit.queries';
import { useUserEnrollments } from '@/adapters/queries/courses.queries';
import {
  useUserDevices,
  useUserSessions,
  useUserRoles,
} from '@/adapters/queries/users.queries';
import { Button } from '@/components/ui/Button';
import { StatsCard, StatsCardContent, StatsCardIcon } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { getUserDisplayName, getUserInitials } from '@/domain/types/user.types';
import type { User, Device, Session } from '@/domain/types/user.types';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const TAB_KEYS = ['overview', 'activity', 'enrollments', 'security', 'access'] as const;
type TabKey = (typeof TAB_KEYS)[number];

type TranslationFn = ReturnType<typeof useTranslations>;

export function UserProfileDrawer({
  user,
  open,
  onClose,
  onTerminateSessions,
  onResetDevices,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
  onTerminateSessions: (user: User) => void;
  onResetDevices: (user: User) => void;
}) {
  const t = useTranslations('user_profile');
  const tUsers = useTranslations('users');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlTab = searchParams.get('tab');
  const activeTab = (() => {
    if (!urlTab) return 0;
    const index = TAB_KEYS.indexOf(urlTab as TabKey);
    if (index !== -1) return index;
    const num = parseInt(urlTab, 10);
    if (!isNaN(num) && num >= 0 && num < TAB_KEYS.length) return num;
    return 0;
  })();

  const handleTabChange = useCallback((tabId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', TAB_KEYS[tabId] ?? 'overview');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.id, user?.avatar_url]);

  const STATUS_THEMES = {
    active: {
      gradient: 'from-emerald-500/30 via-emerald-500/5 to-transparent',
      secondary: 'bg-emerald-400/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      dot: 'bg-emerald-500',
      label: t('status_active')
    },
    locked: {
      gradient: 'from-orange-500/30 via-orange-500/5 to-transparent',
      secondary: 'bg-orange-400/10',
      text: 'text-orange-600 dark:text-orange-400',
      dot: 'bg-orange-500',
      label: t('status_locked')
    },
    suspended: {
      gradient: 'from-amber-500/30 via-amber-500/5 to-transparent',
      secondary: 'bg-amber-400/10',
      text: 'text-amber-600 dark:text-amber-400',
      dot: 'bg-amber-500',
      label: t('status_suspended')
    },
    banned: {
      gradient: 'from-red-500/30 via-red-500/5 to-transparent',
      secondary: 'bg-red-400/10',
      text: 'text-red-600 dark:text-red-400',
      dot: 'bg-red-500',
      label: t('status_banned')
    },
  } as const;

  const TABS = [
    { id: 0, label: t('title_overview'), icon: <Info className="text-[16px]" /> },
    { id: 1, label: t('title_activity'), icon: <History className="text-[16px]" /> },
    { id: 2, label: t('title_enrollments'), icon: <School className="text-[16px]" /> },
    { id: 3, label: t('title_security'), icon: <Security className="text-[16px]" /> },
    { id: 4, label: t('title_access'), icon: <VpnKey className="text-[16px]" /> },
  ];

  if (!user) return null;

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const theme = (STATUS_THEMES[user.account_status as keyof typeof STATUS_THEMES] ?? STATUS_THEMES.active);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      className="flex flex-col bg-background"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tCommon('close')}
        className="absolute top-4 end-4 z-50 p-2 rounded-xl bg-card/60 backdrop-blur-md border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-300"
      >
        <Close className="text-sm" />
      </button>

      <div className={cn("relative p-6 pt-10 border-b border-border/40 overflow-hidden bg-gradient-to-b", theme.gradient)}>
        <div className="flex items-center gap-5 relative z-10">
          <div className="relative group">
            <div className="w-16 h-16 rounded-3xl overflow-hidden ring-4 ring-background/50 shadow-2xl transition-transform duration-500 group-hover:scale-105 bg-gradient-to-tr from-indigo-500 via-primary to-purple-500 flex items-center justify-center text-white font-extrabold text-2xl tracking-wider">
              {user.avatar_url && !avatarError ? (
                <Image
                  src={user.avatar_url}
                  alt={displayName}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                  unoptimized
                  onError={() => setAvatarError(true)}
                />
              ) : (
                initials
              )}
            </div>
            <span className={cn("absolute -bottom-1 -end-1 w-4 h-4 rounded-full ring-2 ring-background shadow-md", theme.dot)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col">
              <h3 className="text-2xl font-black tracking-tight text-foreground capitalize truncate leading-none">
                {displayName}
              </h3>
              <p className="flex items-center gap-2 text-muted-foreground/60 text-base font-medium whitespace-nowrap leading-none mt-1.5 group/contact">
                <Email className="text-[14px] opacity-40 shrink-0" />
                <span className="truncate">{user.email || t('no_email')}</span>
                {user.email && <CopyButton value={user.email} />}
              </p>
            </div>

            <div className="flex items-center gap-2.5 mt-2.5 flex-nowrap overflow-x-auto scrollbar-none">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-widest border transition-all duration-300 bg-primary/10 border-primary/20 text-primary">
                {tUsers(`role_${user.primary_role}` as 'role_super_admin' | 'role_admin' | 'role_teacher' | 'role_student')}
              </span>
              <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-widest border transition-all duration-300 border-transparent", theme.dot + "/10", theme.text)}>
                <div className={cn("w-1.5 h-1.5 rounded-full", theme.dot)} />
                <span className="sr-only">{tUsers('actions_account_status')}: </span>
                {theme.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-background/50 backdrop-blur-md sticky top-0 z-30 border-b border-border/40">
        <div className="flex gap-2 p-1.5 rounded-2xl bg-muted/40 border border-border/40 overflow-x-auto scrollbar-none flex-nowrap">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap outline-none",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 0 && <OverviewTab user={user} t={t} locale={locale} />}
        {activeTab === 1 && <ActivityTab user={user} t={t} locale={locale} />}
        {activeTab === 2 && <EnrollmentsTab user={user} t={t} locale={locale} />}
        {activeTab === 3 && (
          <SecurityTab
            user={user}
            onTerminateSessions={onTerminateSessions}
            onResetDevices={onResetDevices}
            t={t}
            locale={locale}
          />
        )}
        {activeTab === 4 && <PermissionsTab user={user} t={t} locale={locale} />}
      </div>
    </Drawer>
  );
}

const CopyButton = memo(({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const tCommon = useTranslations('common');

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <Tooltip
      title={copied ? tCommon('copied') : tCommon('copy')}
      placement="top"
      arrow
      disableInteractive
    >
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? tCommon('copied') : tCommon('copy')}
        className={cn(
          "w-6 h-6 flex items-center justify-center rounded-md transition-all duration-300 active:scale-95 opacity-0 group-hover/contact:opacity-100 focus-visible:opacity-100 bg-muted/40 hover:bg-muted ms-1",
          copied
            ? "text-emerald-500 dark:text-emerald-400"
            : "text-muted-foreground hover:text-primary"
        )}
      >
        <ContentCopy sx={{ fontSize: '14px' }} className="transition-opacity" />
      </button>
    </Tooltip>
  );
});
CopyButton.displayName = 'CopyButton';

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-bold text-foreground leading-none">{title}</h4>
        {subtitle && <p className="text-[10px] text-muted-foreground font-medium mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value: React.ReactNode, subValue?: string | undefined }) {
  return (
    <StatsCard>
      <StatsCardContent>
        <StatsCardIcon>
          {icon}
        </StatsCardIcon>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
          <p className="text-base font-extrabold text-foreground tracking-tight truncate mt-0.5">{value ?? '—'}</p>
          {subValue && <p className="text-[10px] text-muted-foreground font-medium mt-0.5 opacity-70 truncate w-full">{subValue}</p>}
        </div>
      </StatsCardContent>
    </StatsCard>
  );
}

function OverviewTab({ user, t, locale }: { user: User, t: TranslationFn, locale: string }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={<Phone />} label={t('label_phone')} value={user.phone} />
        <StatCard icon={<LocationOn />} label={t('label_region')} value={user.region_id} />
        <StatCard icon={<CalendarToday />} label={t('label_join_date')} value={formatDate(user.created_at, locale)} subValue={formatDistanceToNow(user.created_at, locale)} />
        <StatCard icon={<Login />} label={t('label_last_sign_in')} value={user.last_login ? formatDistanceToNow(user.last_login, locale) : t('never')} subValue={user.last_login ? formatDate(user.last_login, locale) : undefined} />
        <StatCard icon={<Visibility />} label={t('label_last_seen')} value={user.last_seen_at ? formatDistanceToNow(user.last_seen_at, locale) : t('never')} />
        <StatCard icon={<Refresh />} label={t('label_total_sign_ins')} value={user.login_count} />
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-primary/5 border border-primary/10">
        <SectionTitle icon={<Fingerprint />} title={t('technical_identity')} subtitle={t('tech_id_subtitle')} />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">{t('token_version')}</p>
            <p className="text-lg font-mono font-bold text-foreground">{user.token_version}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">{t('shard_key')}</p>
            <p className="text-lg font-mono font-bold text-foreground">{user.shard_key}</p>
          </div>
        </div>
      </div>

      {(user.account_status !== 'active') && (
        <div className={cn(
          "p-5 rounded-2xl border flex gap-4 transition-colors",
          user.account_status === 'locked' 
            ? "bg-orange-50/50 dark:bg-orange-500/5 border-orange-200 dark:border-orange-500/20" 
            : "bg-red-50/50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20"
        )}>
          <Warning className={cn("text-lg", user.account_status === 'locked' ? "text-orange-500" : "text-red-500")} />
          <div className="space-y-1">
            <h4 className="text-sm font-bold">{t('status_notice_title')}</h4>
            <p className="text-xs text-muted-foreground font-medium">
              {user.account_status === 'locked'
                ? t('account_locked_reason', { reason: user.lock_reason || t('manual_lock_placeholder') })
                : t('account_restricted_until', { date: user.suspension_until ? formatDate(user.suspension_until, locale) : t('indefinite') })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_RISK_STYLE = {
  bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
  text: 'text-emerald-600 dark:text-emerald-400',
  dot: 'bg-emerald-500',
};

const RISK_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  low: DEFAULT_RISK_STYLE,
  medium: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  high: { bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  critical: { bg: 'bg-destructive/10 dark:bg-destructive/20', text: 'text-destructive', dot: 'bg-destructive' },
};

function getActivityIcon(activityType: string) {
  if (activityType.includes('login') || activityType.includes('auth')) {
    return <Login className="text-sm text-emerald-500" />;
  }
  if (activityType.includes('logout')) {
    return <ExitToApp className="text-sm text-muted-foreground" />;
  }
  if (activityType.includes('course') || activityType.includes('lesson')) {
    return <School className="text-sm text-indigo-500" />;
  }
  if (activityType.includes('lock') || activityType.includes('ban') || activityType.includes('suspend') || activityType.includes('warning') || activityType.includes('denied')) {
    return <Warning className="text-sm text-rose-500" />;
  }
  if (activityType.includes('device')) {
    return <DevicesOther className="text-sm text-sky-500" />;
  }
  return <History className="text-sm text-primary" />;
}

function ActivityTab({ user, t, locale }: { user: User, t: TranslationFn, locale: string }) {
  const tAudit = useTranslations('audit');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useActivityLogs(
    { user_id: user.id },
    page,
    pageSize
  );

  const logs = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = data?.totalPages ?? Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header bar with total events and link to Audit page */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-muted/30 border border-border/40">
        <div>
          <h4 className="text-sm font-bold text-foreground">{t('event_tracking_title')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('activities_count', { count: totalCount })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-2.5 rounded-xl text-xs"
            title={t('refresh')}
          >
            <Refresh className={cn("text-sm me-1", isFetching && "animate-spin")} />
            {t('refresh')}
          </Button>
          <Link
            href={`/audit?search=${encodeURIComponent(user.id)}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold border border-primary/20 transition-colors"
          >
            <span>{t('view_cache')}</span>
            <OpenInNew className="text-xs" />
          </Link>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-muted/40 border border-border/30 animate-pulse flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="h-[300px] flex flex-col items-center justify-center text-center space-y-4 p-6 rounded-2xl border border-dashed border-border/60">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
            <History className="text-muted-foreground/40 text-3xl" />
          </div>
          <div className="space-y-1 max-w-[280px]">
            <h4 className="text-sm font-bold text-foreground">{t('no_activities')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('event_tracking_desc', { name: user.first_name || 'user' })}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative ps-6 space-y-4 before:absolute before:start-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            const risk = RISK_STYLES[log.risk_level] ?? DEFAULT_RISK_STYLE;
            const typeLabel = tAudit.has(`activity_types.${log.activity_type}`)
              ? tAudit(`activity_types.${log.activity_type}`)
              : log.activity_type;

            return (
              <div key={log.id} className="relative group">
                {/* Node icon */}
                <div className="absolute -start-6 top-3 -translate-x-1/2 w-6 h-6 rounded-full bg-card border-2 border-border flex items-center justify-center shadow-xs">
                  <div className={cn("w-2 h-2 rounded-full", risk.dot)} />
                </div>

                <div className="p-4 rounded-2xl bg-card/60 hover:bg-card border border-border/50 hover:border-border transition-all duration-200 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="p-1 rounded-md bg-muted/60">
                        {getActivityIcon(log.activity_type)}
                      </div>
                      <span className="text-xs font-bold text-foreground">{typeLabel}</span>
                      <span className={cn("text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md", risk.bg, risk.text)}>
                        {tAudit.has(`risk_levels.${log.risk_level}`) ? tAudit(`risk_levels.${log.risk_level}`) : log.risk_level}
                      </span>
                    </div>

                    <div className="text-end shrink-0">
                      <p className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(log.created_at, locale)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/30 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      {log.ip_address && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                          <Language className="text-[12px] opacity-70" />
                          {log.ip_address}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        #{log.seq}
                      </span>
                    </div>

                    {log.details && Object.keys(log.details).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline cursor-pointer"
                      >
                        <span>JSON</span>
                        {isExpanded ? <ExpandLess className="text-sm" /> : <ExpandMore className="text-sm" />}
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON details */}
                  {isExpanded && log.details && (
                    <div className="mt-2.5 pt-2 border-t border-border/40">
                      <pre className="text-[10px] font-mono bg-background/80 rounded-xl p-3 border border-border/40 overflow-x-auto max-h-40 text-foreground">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-8 px-3 rounded-xl"
          >
            <KeyboardArrowLeft className="text-sm" />
          </Button>
          <span className="text-muted-foreground font-mono text-xs">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-8 px-3 rounded-xl"
          >
            <KeyboardArrowRight className="text-sm" />
          </Button>
        </div>
      )}
    </div>
  );
}

type EnrollmentStatusLabelKey = 'status_active' | 'completed_label' | 'status_expired' | 'status_revoked';

const DEFAULT_ENROLLMENT_THEME: { bg: string; text: string; border: string; labelKey: EnrollmentStatusLabelKey } = {
  bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
  text: 'text-emerald-600 dark:text-emerald-400',
  border: 'border-emerald-500/20',
  labelKey: 'status_active',
};

const ENROLLMENT_STATUS_THEMES: Record<string, { bg: string; text: string; border: string; labelKey: EnrollmentStatusLabelKey }> = {
  active: DEFAULT_ENROLLMENT_THEME,
  completed: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20',
    labelKey: 'completed_label',
  },
  expired: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20',
    labelKey: 'status_expired',
  },
  revoked: {
    bg: 'bg-rose-500/10 dark:bg-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/20',
    labelKey: 'status_revoked',
  },
};

function EnrollmentsTab({ user, t, locale }: { user: User, t: TranslationFn, locale: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, isFetching, refetch } = useUserEnrollments(user.id, page, pageSize);
  const enrollments = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = data?.totalPages ?? Math.ceil(totalCount / pageSize);

  // Computed stats
  const activeCount = useMemo(() => enrollments.filter(e => e.status === 'active').length, [enrollments]);
  const completedCount = useMemo(() => enrollments.filter(e => e.status === 'completed').length, [enrollments]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-card/60 border border-border/50 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">{t('total_enrolled')}</p>
          <p className="text-xl font-extrabold text-foreground mt-0.5">{totalCount}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{t('active_label')}</p>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{activeCount}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-center">
          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">{t('completed_label')}</p>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{completedCount}</p>
        </div>
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-foreground">{t('lms_enrollments_title')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('enrollments_count', { count: totalCount })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 px-2.5 rounded-xl text-xs"
          title={t('refresh')}
        >
          <Refresh className={cn("text-sm me-1", isFetching && "animate-spin")} />
          {t('refresh')}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-3xl bg-muted/40 border border-border/30 animate-pulse space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full w-full" />
            </div>
          ))}
        </div>
      ) : enrollments.length === 0 ? (
        <div className="h-[300px] flex flex-col items-center justify-center text-center space-y-4 p-6 rounded-2xl border border-dashed border-border/60">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
            <School className="text-muted-foreground/40 text-3xl" />
          </div>
          <div className="space-y-1 max-w-[280px]">
            <h4 className="text-sm font-bold text-foreground">{t('no_enrollments')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('lms_enrollments_desc', { name: user.first_name || 'user' })}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {enrollments.map((enr) => {
            const statusTheme = ENROLLMENT_STATUS_THEMES[enr.status] ?? DEFAULT_ENROLLMENT_THEME;
            const progress = Math.min(100, Math.max(0, Number(enr.progress_pct ?? 0)));
            const levelLabel = enr.course_level ? (t.has(`level_${enr.course_level}`) ? t(`level_${enr.course_level}`) : enr.course_level) : null;

            return (
              <div
                key={enr.id}
                className="p-5 rounded-3xl bg-card/60 hover:bg-card border border-border/50 hover:border-border transition-all duration-300 shadow-xs space-y-4"
              >
                {/* Course Header */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-tr from-primary/20 via-indigo-500/10 to-purple-500/20 border border-border/40 shrink-0 flex items-center justify-center">
                    {enr.course_thumbnail_url ? (
                      <Image
                        src={enr.course_thumbnail_url}
                        alt={enr.course_title || 'Course'}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <School className="text-2xl text-primary/60" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-foreground truncate">
                        {enr.course_title || 'Course'}
                      </h4>
                      <span className={cn("text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-lg border", statusTheme.bg, statusTheme.text, statusTheme.border)}>
                        {t(statusTheme.labelKey)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {levelLabel && (
                        <span className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-0.5 rounded-md bg-muted/60">
                          {levelLabel}
                        </span>
                      )}
                      {enr.course_category && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {enr.course_category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-medium text-muted-foreground">{t('progress')}</span>
                    <span className="font-mono text-xs font-bold text-foreground">{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-indigo-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {(enr.total_lessons != null && enr.total_lessons > 0) && (
                    <p className="text-[10px] text-muted-foreground text-end">
                      {t('lessons_count', { completed: enr.completed_lessons ?? 0, total: enr.total_lessons })}
                    </p>
                  )}
                </div>

                {/* Footer dates & View link */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/40 text-xs">
                  <span className="text-[10px] text-muted-foreground">
                    {enr.completed_at
                      ? t('completed_on', { date: formatDate(enr.completed_at, locale) })
                      : t('enrolled_on', { date: formatDate(enr.enrolled_at, locale) })}
                  </span>

                  <Link
                    href={`/courses/${enr.course_id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>{t('view_course')}</span>
                    <OpenInNew className="text-xs" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-8 px-3 rounded-xl"
          >
            <KeyboardArrowLeft className="text-sm" />
          </Button>
          <span className="text-muted-foreground font-mono text-xs">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-8 px-3 rounded-xl"
          >
            <KeyboardArrowRight className="text-sm" />
          </Button>
        </div>
      )}
    </div>
  );
}

function SecurityTab({ user, onTerminateSessions, onResetDevices, t, locale }: { user: User, onTerminateSessions: (u: User) => void, onResetDevices: (u: User) => void, t: TranslationFn, locale: string }) {
  const { data: devices, isLoading: devLoading } = useUserDevices(user.id);
  const { data: sessions, isLoading: sesLoading } = useUserSessions(user.id);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle icon={<DevicesOther />} title={t('recognized_devices')} subtitle={t('devices_subtitle')} />
          <Button variant="ghost" size="sm" className="text-destructive font-bold text-[10px] uppercase" onClick={() => onResetDevices(user)}>{t('revoke_all')}</Button>
        </div>
        <div className="grid gap-4">
          {devLoading ? <div className="h-24 bg-muted/40 rounded-2xl animate-pulse" /> : !devices?.length ? <p className="text-sm text-muted-foreground italic">{t('no_devices')}</p> : devices.map(d => <DeviceCard key={d.id} device={d} t={t} locale={locale} />)}
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle icon={<ExitToApp />} title={t('active_sessions')} subtitle={t('sessions_subtitle')} />
          <Button variant="ghost" size="sm" className="text-destructive font-bold text-[10px] uppercase" onClick={() => onTerminateSessions(user)}>{t('force_sign_out')}</Button>
        </div>
        <div className="grid gap-4">
          {sesLoading ? <div className="h-20 bg-muted/40 rounded-2xl animate-pulse" /> : !sessions?.length ? <p className="text-sm text-muted-foreground italic">{t('no_sessions')}</p> : sessions.map(s => <SessionCard key={s.id} session={s} t={t} locale={locale} />)}
        </div>
      </section>
    </div>
  );
}

function DeviceCard({ device, t, locale }: { device: Device, t: TranslationFn, locale: string }) {
  const Icon = device.platform === 'android' || device.platform === 'ios' ? Smartphone : Laptop;
  return (
    <div className="p-5 rounded-3xl bg-card/40 border border-border/50 flex items-center gap-5">
      <Icon className="text-3xl text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <h4 className="text-base font-bold truncate">{device.device_name || 'Device'}</h4>
        <p className="text-[10px] text-muted-foreground uppercase">{device.platform} • {t('seen_at', { time: formatDistanceToNow(device.last_seen, locale) })}</p>
      </div>
      <div className="text-end shrink-0">
        <p className="text-[10px] font-bold text-muted-foreground uppercase">{t('trust_score')}</p>
        <span className="text-xs font-mono font-bold">{device.trust_score}%</span>
      </div>
    </div>
  );
}

function SessionCard({ session, t, locale }: { session: Session, t: TranslationFn, locale: string }) {
  return (
    <div className="px-6 py-5 rounded-3xl bg-card/40 border border-border/50 flex items-center gap-5">
      <Language className="text-2xl text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm font-bold">{session.ip_address}</span>
        <p className="text-[10px] text-muted-foreground uppercase">{t('started_at', { time: formatDistanceToNow(session.started_at, locale) })}</p>
      </div>
      <div className="text-end">
        <p className="text-[10px] font-bold text-muted-foreground uppercase">{t('risk_profile')}</p>
        <span className="text-xs font-bold">{session.risk_score}</span>
      </div>
    </div>
  );
}

function PermissionsTab({ user, t, locale }: { user: User, t: TranslationFn, locale: string }) {
  const { data: roles, isLoading } = useUserRoles(user.id);
  const tUsers = useTranslations('users');

  const displayRoles = useMemo(() => {
    if (roles && roles.length > 0) return roles;
    if (isLoading) return [];
    
    // Fallback to primary role if user_roles table is empty
    return [{
      user_id: user.id,
      role_id: 'primary',
      role_name: user.primary_role,
      role_label: tUsers(`role_${user.primary_role}` as 'role_super_admin' | 'role_admin' | 'role_teacher' | 'role_student'),
      granted_at: user.created_at,
    }];
  }, [roles, isLoading, user, tUsers]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <SectionTitle icon={<Work />} title={t('role_authority')} subtitle={t('role_auth_subtitle')} />
      <div className="grid gap-4">
        {displayRoles.map(r => (
          <div key={`${r.user_id}-${r.role_id}`} className="p-5 rounded-2xl border border-border/50 bg-card flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Shield className="text-indigo-500" />
              <div>
                <h4 className="text-sm font-bold">{r.role_label || r.role_name}</h4>
                <p className="text-[10px] text-muted-foreground">{t('granted_at', { date: formatDate(r.granted_at, locale) })}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
