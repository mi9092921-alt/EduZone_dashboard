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
} from '@mui/icons-material';
import { Tooltip } from '@mui/material'; // Using MUI Tooltip as requested/implied for pro-tips
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import React, { useState, useMemo, memo, useCallback } from 'react';

import { formatDate, formatDistanceToNow } from './_utils';

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
import { cn } from '@/lib/utils';

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
  const [activeTab, setActiveTab] = useState(0);

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
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={displayName}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
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
              onClick={() => setActiveTab(tab.id)}
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
        {activeTab === 1 && <ActivityTab user={user} t={t} />}
        {activeTab === 2 && <EnrollmentsTab user={user} t={t} />}
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

function ActivityTab({ user, t }: { user: User, t: TranslationFn }) {
  return (
    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
      <History className="text-muted-foreground/30 text-5xl" />
      <div className="space-y-2 max-w-[320px]">
        <h3 className="text-xl font-bold">{t('event_tracking_title')}</h3>
        <p className="text-sm text-muted-foreground font-medium">{t('event_tracking_desc', { name: user.first_name || 'user' })}</p>
      </div>
      <Button variant="outline" className="rounded-xl" disabled>{t('view_cache')}</Button>
    </div>
  );
}

function EnrollmentsTab({ user, t }: { user: User, t: TranslationFn }) {
  return (
    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
      <School className="text-muted-foreground/30 text-5xl" />
      <div className="space-y-2 max-w-[320px]">
        <h3 className="text-xl font-bold">{t('lms_enrollments_title')}</h3>
        <p className="text-sm text-muted-foreground font-medium">{t('lms_enrollments_desc', { name: user.first_name || 'user' })}</p>
      </div>
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
