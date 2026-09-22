'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Campaign as CampaignIcon,
  Send as SendIcon,
  PeopleAlt as PeopleIcon,
  History as HistoryIcon,
  AccessTime as AccessTimeIcon,
  School as SchoolIcon,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Stack,
  Chip,
  CircularProgress,
  Skeleton,
  Fade,
  Pagination,
  Alert,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useLocale, useTranslations } from 'next-intl';
import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';

import { useSendCourseAnnouncement } from '@/adapters/mutations/notifications.mutations';
import { useCourseAnnouncements } from '@/adapters/queries/notifications.queries';
import { useStudentProgress } from '@/adapters/queries/teacher.queries';
import { useToastStore } from '@/adapters/stores/toast.store';

interface CourseAnnouncementsTabProps {
  courseId: string;
  enrolledCount?: number;
}

const announcementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'error_title_min')
    .max(100, 'Title cannot exceed 100 characters'),
  body: z
    .string()
    .trim()
    .min(10, 'error_body_min')
    .max(500, 'Message cannot exceed 500 characters'),
});

type AnnouncementFormValues = z.infer<typeof announcementSchema>;

export function CourseAnnouncementsTab({
  courseId,
  enrolledCount = 0,
}: CourseAnnouncementsTabProps) {
  const theme = useTheme();
  const locale = useLocale();
  const t = useTranslations('notifications');
  const showToast = useToastStore((s) => s.showToast);

  const [page, setPage] = useState(1);
  const pageSize = 5;

  const { data: studentProgressData } = useStudentProgress(courseId, 1, 1);
  const effectiveStudentCount = enrolledCount > 0 ? enrolledCount : (studentProgressData?.count ?? 0);

  const {
    data: announcementsResult,
    isLoading: isHistoryLoading,
    refetch,
  } = useCourseAnnouncements(courseId, page, pageSize);

  const sendMutation = useSendCourseAnnouncement(courseId);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: '',
      body: '',
    },
  });

  const titleValue = watch('title') || '';
  const bodyValue = watch('body') || '';

  const onSubmit = async (values: AnnouncementFormValues) => {
    try {
      const result = await sendMutation.mutateAsync({
        title: values.title,
        body: values.body,
      });

      showToast(
        t('announcement_sent_success', { count: result.recipientCount }),
        'success',
      );
      reset();
      setPage(1);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send announcement';
      showToast(msg, 'error');
    }
  };

  const pastAnnouncements = announcementsResult?.data ?? [];
  const totalCount = announcementsResult?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', width: '100%' }}>
      {/* ── Top Header Card ────────────────────────────────────── */}
      <Card
        elevation={0}
        sx={{
          mb: 4,
          borderRadius: 4,
          p: { xs: 2.5, sm: 3.5 },
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          backgroundImage: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, transparent 100%)`,
          backdropFilter: 'blur(10px)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2.5}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                color: 'white',
                boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}`,
              }}
            >
              <CampaignIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.3 }}>
                {t('course_announcements_title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('course_announcements_desc')}
              </Typography>
            </Box>
          </Box>

          <Chip
            icon={<PeopleIcon sx={{ fontSize: 18 }} />}
            label={t('send_to_students', { count: effectiveStudentCount })}
            color={effectiveStudentCount > 0 ? 'primary' : 'default'}
            variant={effectiveStudentCount > 0 ? 'filled' : 'outlined'}
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              py: 2,
              px: 1,
              borderRadius: 2.5,
            }}
          />
        </Stack>
      </Card>

      {/* ── Warning if no active students ──────────────────────── */}
      {effectiveStudentCount === 0 && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
          {t('no_active_students')}
        </Alert>
      )}

      {/* ── Form Card: Send New Announcement ───────────────────── */}
      <Card
        elevation={0}
        sx={{
          mb: 5,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box
              sx={{
                width: 8,
                height: 24,
                borderRadius: 4,
                bgcolor: 'primary.main',
              }}
            />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t('new_announcement_title')}
            </Typography>
          </Box>

          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={3}>
              {/* Title Field */}
              <Box>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label={t('header_title')}
                      placeholder={t('announcement_title_placeholder')}
                      error={!!errors.title}
                      helperText={
                        errors.title
                          ? t(errors.title.message as 'error_title_min')
                          : `${titleValue.length}/100`
                      }
                      FormHelperTextProps={{
                        sx: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          mx: 0.5,
                        },
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2.5,
                        },
                      }}
                    />
                  )}
                />
              </Box>

              {/* Message Field */}
              <Box>
                <Controller
                  name="body"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      multiline
                      rows={4}
                      label={t('header_body')}
                      placeholder={t('announcement_body_placeholder')}
                      error={!!errors.body}
                      helperText={
                        errors.body
                          ? t(errors.body.message as 'error_body_min')
                          : `${bodyValue.length}/500`
                      }
                      FormHelperTextProps={{
                        sx: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          mx: 0.5,
                        },
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2.5,
                        },
                      }}
                    />
                  )}
                />
              </Box>

              {/* Submit Button */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting || sendMutation.isPending || effectiveStudentCount === 0}
                  startIcon={
                    sendMutation.isPending ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <SendIcon sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />
                    )
                  }
                  sx={{
                    px: 3.5,
                    py: 1.25,
                    borderRadius: 3,
                    fontWeight: 700,
                    textTransform: 'none',
                    fontSize: '0.95rem',
                    boxShadow: `0 6px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
                    '&:hover': {
                      boxShadow: `0 8px 22px ${alpha(theme.palette.primary.main, 0.4)}`,
                    },
                  }}
                >
                  {sendMutation.isPending
                    ? t('status_sending')
                    : effectiveStudentCount > 0
                      ? t('send_to_students', { count: effectiveStudentCount })
                      : t('send_announcement_btn')}
                </Button>
              </Box>
            </Stack>
          </form>
        </CardContent>
      </Card>

      {/* ── Section: Past Announcements ───────────────────────── */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
          <HistoryIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t('past_announcements')}
          </Typography>
          {totalCount > 0 && (
            <Chip
              label={totalCount}
              size="small"
              sx={{ fontWeight: 700, borderRadius: 2 }}
            />
          )}
        </Stack>

        {isHistoryLoading ? (
          <Stack spacing={2}>
            {[1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={95}
                sx={{ borderRadius: 3 }}
              />
            ))}
          </Stack>
        ) : pastAnnouncements.length === 0 ? (
          <Card
            elevation={0}
            sx={(theme) => ({
              p: 5,
              textAlign: 'center',
              borderRadius: 4,
              border: '1px dashed',
              borderColor: theme.palette.divider,
              backgroundColor: theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.04)'
                : 'rgba(0,0,0,0.02)',
            })}
          >
            <CampaignIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
            <Typography variant="body1" color="text.secondary" fontWeight={500}>
              {t('no_announcements')}
            </Typography>
          </Card>
        ) : (
          <Stack spacing={2}>
            {pastAnnouncements.map((item) => (
              <Fade in key={item.id} timeout={300}>
                <Card
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 3.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.paper',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      borderColor: 'primary.main',
                      transform: 'translateY(-2px)',
                      boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.08)}`,
                    },
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
                    gap={1.5}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 700, color: 'text.primary' }}
                        >
                          {item.title}
                        </Typography>
                        <Chip
                          icon={<SchoolIcon sx={{ fontSize: 13 }} />}
                          label={t('course_announcement_chip')}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }}
                        />
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                        }}
                      >
                        {item.body}
                      </Typography>
                    </Box>

                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.8125rem',
                        alignSelf: { xs: 'flex-end', sm: 'flex-start' },
                        mt: { xs: 1, sm: 0 },
                      }}
                    >
                      <AccessTimeIcon sx={{ fontSize: 15 }} />
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {new Date(item.created_at).toLocaleDateString(
                          locale === 'ar' ? 'ar-EG' : 'en-US',
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}
                      </Typography>
                    </Stack>
                  </Stack>
                </Card>
              </Fade>
            ))}

            {/* Pagination if needed */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, val) => setPage(val)}
                  color="primary"
                  shape="rounded"
                />
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
