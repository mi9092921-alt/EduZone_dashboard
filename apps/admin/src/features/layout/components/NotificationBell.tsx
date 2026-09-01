'use client';

/**
 * P11-NOTIFY-002 · NotificationBell
 *
 * A Topbar button that shows:
 *  - Badge with live unread count (max 99+)
 *  - Dropdown panel: latest 20 notifications grouped by date
 *  - Realtime updates via useRealtimeNotifications()
 *  - Mark as read on click (optimistic)
 *  - "Mark all as read" button
 *  - "View all" link → /notifications
 *  - Empty state with inbox icon
 */

import {
  Notifications as BellIcon,
  NotificationsNone as BellOutlineIcon,
  Inbox as InboxIcon,
  DoneAll as DoneAllIcon,
  AccountCircle as AccountActionIcon,
  Warning as WarningIcon,
  School as CourseUpdateIcon,
  Campaign as SystemAlertIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import {
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useRef, useEffect, useCallback } from 'react';

import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/adapters/mutations/notifications.mutations';
import {
  useMyNotifications,
  useRealtimeNotifications,
  type UserNotification,
} from '@/adapters/queries/notifications.queries';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

// ─── Native relative time helper ─────────────────────────────────────────────

/**
 * Returns a human-readable relative time string using the browser's
 * built-in `Intl.RelativeTimeFormat` — no external deps required.
 */
function formatRelativeTime(isoString: string, locale: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffSec = Math.round((then - now) / 1000);
  const absS = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', {
    numeric: 'auto',
  });

  if (absS < 60) return rtf.format(Math.sign(diffSec) * absS, 'second');
  if (absS < 3600) return rtf.format(Math.sign(diffSec) * Math.round(absS / 60), 'minute');
  if (absS < 86400) return rtf.format(Math.sign(diffSec) * Math.round(absS / 3600), 'hour');
  if (absS < 2592000) return rtf.format(Math.sign(diffSec) * Math.round(absS / 86400), 'day');
  return rtf.format(Math.sign(diffSec) * Math.round(absS / 2592000), 'month');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNotifIcon(type: string) {
  switch (type) {
    case 'account_action':
      return <AccountActionIcon sx={{ fontSize: 16 }} />;
    case 'warning_issued':
      return <WarningIcon sx={{ fontSize: 16 }} />;
    case 'course_update':
      return <CourseUpdateIcon sx={{ fontSize: 16 }} />;
    case 'system_alert':
      return <SystemAlertIcon sx={{ fontSize: 16 }} />;
    default:
      return <BellOutlineIcon sx={{ fontSize: 16 }} />;
  }
}

function getNotifColor(type: string): string {
  switch (type) {
    case 'account_action':
      return 'hsl(217 91% 60%)'; // blue
    case 'warning_issued':
      return 'hsl(38 92% 50%)'; // amber
    case 'course_update':
      return 'hsl(142 71% 45%)'; // green
    case 'system_alert':
      return 'hsl(262 80% 60%)'; // purple
    default:
      return 'hsl(var(--muted-foreground))';
  }
}

function groupByDate(
  items: UserNotification[],
  locale: string,
): Array<{ label: string; items: UserNotification[] }> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const fmt = (d: Date) => d.toDateString();

  const groups: Record<string, UserNotification[]> = {};
  for (const item of items) {
    const d = new Date(item.created_at);
    let key: string;
    if (fmt(d) === fmt(today)) key = locale === 'ar' ? 'اليوم' : 'Today';
    else if (fmt(d) === fmt(yesterday)) key = locale === 'ar' ? 'أمس' : 'Yesterday';
    else
      key = d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
        day: 'numeric',
        month: 'short',
      });
    (groups[key] ??= []).push(item);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotifRow({
  notif,
  locale,
  onRead,
}: {
  notif: UserNotification;
  locale: string;
  onRead: (id: string, linkTo: string | null) => void;
}) {
  const relativeTime = formatRelativeTime(notif.created_at, locale);
  const color = getNotifColor(notif.type);

  return (
    <Box
      component="button"
      onClick={() => onRead(notif.id, notif.link_to)}
      className={cn(
        'w-full text-start px-4 py-3 flex items-start gap-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        !notif.is_read && 'bg-primary/5 dark:bg-primary/8',
      )}
      aria-label={notif.title}
    >
      {/* Type icon */}
      <Box
        sx={{
          mt: 0.25,
          width: 30,
          height: 30,
          borderRadius: '50%',
          bgcolor: color + '1A',
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {getNotifIcon(notif.type)}
      </Box>

      {/* Content */}
      <Box flex={1} minWidth={0}>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: notif.is_read ? 500 : 700,
              color: 'text.primary',
              lineHeight: 1.3,
              fontSize: '0.8125rem',
            }}
          >
            {notif.title}
          </Typography>
          {!notif.is_read && (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                flexShrink: 0,
              }}
            />
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', display: 'block', mt: 0.25, lineHeight: 1.4 }}
        >
          {truncate(notif.body, 80)}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', display: 'block', mt: 0.5, fontSize: '0.6875rem' }}
        >
          {relativeTime}
        </Typography>
      </Box>

      {/* External link indicator */}
      {notif.link_to && (
        <OpenInNewIcon sx={{ fontSize: 12, color: 'text.disabled', mt: 0.5, flexShrink: 0 }} />
      )}
    </Box>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Data
  const { data, isLoading } = useMyNotifications(20, false);
  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const badgeLabel = unreadCount > 99 ? '99+' : unreadCount;

  // Mutations
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Realtime subscription (mounted once here, syncs the cache globally)
  useRealtimeNotifications();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleNotifClick = useCallback(
    (id: string, linkTo: string | null) => {
      markRead.mutate(id);
      if (linkTo) router.push(linkTo as Parameters<typeof router.push>[0]);
      setOpen(false);
    },
    [markRead, router],
  );

  const handleMarkAll = useCallback(() => {
    markAllRead.mutate();
  }, [markAllRead]);

  const handleViewAll = useCallback(() => {
    setOpen(false);
    router.push('/notifications');
  }, [router]);

  const grouped = groupByDate(notifications, locale);

  return (
    <Box position="relative">
      {/* ── Bell Button ── */}
      <Tooltip title={t('notifications')} arrow>
        <IconButton
          ref={buttonRef}
          id="notification-bell-button"
          aria-label={t('notifications')}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          size="small"
          sx={{
            width: 36,
            height: 36,
            color: open ? 'primary.main' : 'text.secondary',
            transition: 'color 0.2s',
            '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
          }}
        >
          <Badge
            badgeContent={unreadCount > 0 ? badgeLabel : undefined}
            color="error"
            overlap="circular"
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.6rem',
                fontWeight: 800,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
              },
            }}
          >
            {open ? <BellIcon sx={{ fontSize: 20 }} /> : <BellOutlineIcon sx={{ fontSize: 20 }} />}
          </Badge>
        </IconButton>
      </Tooltip>

      {/* ── Dropdown Panel ── */}
      {open && (
        <Paper
          ref={panelRef}
          elevation={0}
          sx={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            insetInlineEnd: 0,
            width: 360,
            maxHeight: 480,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            boxShadow: '0 20px 60px -10px rgba(0,0,0,0.25)',
            zIndex: 9999,
            animation: 'fadeSlideDown 0.15s ease',
            '@keyframes fadeSlideDown': {
              from: { opacity: 0, transform: 'translateY(-6px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
          role="dialog"
          aria-label={t('notifications')}
        >
          {/* ── Header ── */}
          <Box
            sx={{
              px: 2,
              py: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
            }}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                {t('notifications')}
              </Typography>
              {unreadCount > 0 && (
                <Chip
                  label={badgeLabel}
                  size="small"
                  color="primary"
                  sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800, px: 0.5 }}
                />
              )}
            </Box>

            {unreadCount > 0 && (
              <Tooltip title={t('mark_all_read')} arrow>
                <IconButton
                  id="mark-all-read-button"
                  size="small"
                  onClick={handleMarkAll}
                  disabled={markAllRead.isPending}
                  sx={{ color: 'primary.main', '&:hover': { bgcolor: 'primary.main' + '1A' } }}
                  aria-label={t('mark_all_read')}
                >
                  {markAllRead.isPending ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <DoneAllIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* ── Body ── */}
          <Box sx={{ overflowY: 'auto', flex: 1 }}>
            {isLoading ? (
              // Skeleton loader
              Array.from({ length: 4 }).map((_, i) => (
                <Box key={i} px={2} py={1.5} display="flex" gap={1.5}>
                  <Skeleton variant="circular" width={30} height={30} />
                  <Box flex={1}>
                    <Skeleton variant="text" width="60%" height={14} />
                    <Skeleton variant="text" width="85%" height={12} sx={{ mt: 0.5 }} />
                    <Skeleton variant="text" width="30%" height={10} sx={{ mt: 0.5 }} />
                  </Box>
                </Box>
              ))
            ) : notifications.length === 0 ? (
              // Empty state
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                py={6}
                px={3}
                gap={1.5}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: 'action.hover',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <InboxIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign="center"
                  fontWeight={600}
                >
                  {t('no_new_notifications')}
                </Typography>
              </Box>
            ) : (
              grouped.map(({ label, items }) => (
                <Box key={label}>
                  {/* Date group label */}
                  <Box
                    px={2}
                    pt={1.5}
                    pb={0.5}
                    sx={{ position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: 'text.disabled',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontSize: '0.6rem',
                      }}
                    >
                      {label}
                    </Typography>
                  </Box>

                  {items.map((notif) => (
                    <NotifRow
                      key={notif.id}
                      notif={notif}
                      locale={locale}
                      onRead={handleNotifClick}
                    />
                  ))}
                </Box>
              ))
            )}
          </Box>

          {/* ── Footer ── */}
          <Divider />
          <Box sx={{ px: 2, py: 1.25, flexShrink: 0, textAlign: 'center' }}>
            <Button
              id="view-all-notifications-button"
              fullWidth
              size="small"
              variant="text"
              onClick={handleViewAll}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.8125rem',
                color: 'primary.main',
                borderRadius: 2,
                '&:hover': { bgcolor: 'primary.main' + '1A' },
              }}
            >
              {t('view_all_notifications')}
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
