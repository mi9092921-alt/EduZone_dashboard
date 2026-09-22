'use client';

/**
 * P11-NOTIFY-004 · InboxPage
 *
 * The per-user notifications page behind the bell's "View all" link.
 * Unlike /notifications (the admin broadcast management surface, gated by
 * notifications.send/delete), this page is for EVERY authenticated user:
 * it only reads the caller's own inbox rows and marks them read — the same
 * requireUser-scoped server actions the NotificationBell dropdown uses.
 */

import {
  DoneAll as DoneAllIcon,
  Inbox as InboxIcon,
  Notifications as NotificationsIcon,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/adapters/mutations/notifications.mutations';
import {
  useMyNotifications,
  type UserNotification,
} from '@/adapters/queries/notifications.queries';
import { cn } from '@/lib/utils';

/** Local date + time in the active locale — relative time belongs to the bell dropdown. */
function formatTimestamp(isoString: string, locale: string): string {
  return new Date(isoString).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function InboxRow({
  notif,
  locale,
  onRead,
}: {
  notif: UserNotification;
  locale: string;
  onRead: (id: string) => void;
}) {
  return (
    <Box
      component="button"
      onClick={() => onRead(notif.id)}
      className={cn(
        'w-full text-start px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        !notif.is_read && 'bg-primary/5 dark:bg-primary/8',
      )}
      aria-label={notif.title}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: notif.is_read ? 500 : 700, color: 'text.primary', minWidth: 0 }}
        >
          {notif.title}
        </Typography>
        {!notif.is_read && (
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
        )}
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {notif.body}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
        {formatTimestamp(notif.created_at, locale)}
      </Typography>
    </Box>
  );
}

export function InboxPage() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  // 50 rows is the same clamp the server action enforces — this page wants
  // a wider window than the bell dropdown's 20.
  const { data, isLoading } = useMyNotifications(50, false);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleRead = useCallback(
    (id: string) => {
      markRead.mutate(id);
    },
    [markRead],
  );

  const handleMarkAll = useCallback(() => {
    markAllRead.mutate();
  }, [markAllRead]);

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      {/* Page header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              p: 1,
              borderRadius: 2,
              display: 'flex',
            }}
          >
            <NotificationsIcon />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
            {t('inbox_title')}
          </Typography>
          {unreadCount > 0 && (
            <Chip
              label={unreadCount > 99 ? '99+' : unreadCount}
              color="primary"
              size="small"
              sx={{ fontWeight: 800 }}
            />
          )}
        </Stack>

        <Tooltip title={t('mark_all_read')}>
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={
                markAllRead.isPending ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <DoneAllIcon fontSize="small" />
                )
              }
              onClick={handleMarkAll}
              disabled={markAllRead.isPending || unreadCount === 0}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
            >
              {t('mark_all_read')}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {/* List */}
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress size={28} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            py={10}
            gap={1.5}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <InboxIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
            </Box>
            <Typography variant="body1" color="text.secondary" fontWeight={600}>
              {t('no_new_notifications')}
            </Typography>
          </Box>
        ) : (
          <>
            {notifications.map((notif, index) => (
              <Box key={notif.id}>
                {index > 0 && <Divider />}
                <InboxRow notif={notif} locale={locale} onRead={handleRead} />
              </Box>
            ))}
          </>
        )}
      </Box>

      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ display: 'block', textAlign: 'center', mt: 2 }}
      >
        {tCommon('total')}: {notifications.length}
      </Typography>
    </Container>
  );
}
