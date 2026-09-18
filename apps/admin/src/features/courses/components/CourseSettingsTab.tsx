'use client';

import { Publish, Archive } from '@mui/icons-material';
import { Box, Typography, Button, Chip, Alert } from '@mui/material';
import { useTranslations } from 'next-intl';

import { useUpdateCourse } from '@/adapters/mutations/courses.mutations';
import type { CourseDetail } from '@/domain/types/course.types';

interface CourseSettingsTabProps {
  course: CourseDetail;
}

export function CourseSettingsTab({ course }: CourseSettingsTabProps) {
  const t = useTranslations('common');
  const updateMutation = useUpdateCourse();

  const handlePublish = () => {
    updateMutation.mutate({ id: course.id, data: { status: 'published' } });
  };

  const handleArchive = () => {
    updateMutation.mutate({ id: course.id, data: { status: 'archived' } });
  };

  const handleSetDraft = () => {
    updateMutation.mutate({ id: course.id, data: { status: 'draft' } });
  };

  const publishedSections = course.sections.filter((s) => s.is_published);
  const publishedLessons = course.sections.flatMap((s) =>
    (s.lessons ?? []).filter((l) => l.is_published),
  );
  const canPublish = publishedSections.length > 0 && publishedLessons.length > 0;

  return (
    <Box sx={{ maxWidth: 640, width: '100%', minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: 'text.primary', mb: 0.5 }}>
        {t('course_settings_title')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {t('course_settings_desc')}
      </Typography>

      {updateMutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          {t('status_updated_success')}
        </Alert>
      )}

      {/* Current Status */}
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          backgroundColor: 'action.hover',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {t('current_status_label')}
          </Typography>
          <Chip
            label={course.status.toUpperCase()}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.6875rem',
              letterSpacing: '0.04em',
              backgroundColor:
                course.status === 'published'
                  ? 'success.light'
                  : course.status === 'draft'
                    ? 'warning.light'
                    : 'action.selected',
              color:
                course.status === 'published'
                  ? 'success.dark'
                  : course.status === 'draft'
                    ? 'warning.dark'
                    : 'text.secondary',
              borderRadius: 5,
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {course.status !== 'published' && (
            <Button
              variant="contained"
              startIcon={<Publish />}
              onClick={handlePublish}
              disabled={!canPublish || updateMutation.isPending}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                backgroundColor: 'success.main',
                '&:hover': { backgroundColor: 'success.dark' },
                boxShadow: 'none',
                '&.Mui-disabled': { backgroundColor: 'action.disabledBackground' },
              }}
            >
              {t('publish_course_btn')}
            </Button>
          )}
          {course.status !== 'archived' && (
            <Button
              variant="outlined"
              startIcon={<Archive />}
              onClick={handleArchive}
              disabled={updateMutation.isPending}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                borderColor: 'divider',
                color: 'text.secondary',
                '&:hover': { borderColor: 'text.secondary', backgroundColor: 'action.hover' },
              }}
            >
              {t('archive_course_btn')}
            </Button>
          )}
          {course.status !== 'draft' && (
            <Button
              variant="outlined"
              onClick={handleSetDraft}
              disabled={updateMutation.isPending}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                borderColor: 'divider',
                color: 'text.secondary',
                '&:hover': { borderColor: 'text.secondary', backgroundColor: 'action.hover' },
              }}
            >
              {t('revert_to_draft_btn')}
            </Button>
          )}
        </Box>

        {!canPublish && course.status !== 'published' && (
          <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: 1.5 }}>
            {t('publish_requirements')}
          </Typography>
        )}
      </Box>

      {/* Course Info */}
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          backgroundColor: 'background.paper',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
          {t('course_details_label')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              gap: { xs: 0.25, sm: 2 },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>
              {t('id_label')}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.primary',
                fontFamily: 'JetBrains Mono',
                overflowWrap: 'anywhere',
                wordBreak: 'break-all',
                textAlign: { xs: 'start', sm: 'end' },
              }}
            >
              {course.id}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              gap: { xs: 0.25, sm: 2 },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>
              {t('url_slug')}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'text.primary', overflowWrap: 'anywhere', textAlign: { xs: 'start', sm: 'end' } }}
            >
              {course.slug ?? '—'}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              gap: { xs: 0.25, sm: 2 },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>
              {t('region_label')}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'text.primary', overflowWrap: 'anywhere', textAlign: { xs: 'start', sm: 'end' } }}
            >
              {course.region_id}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              gap: { xs: 0.25, sm: 2 },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>
              {t('created_label')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.primary', textAlign: { xs: 'start', sm: 'end' } }}>
              {new Date(course.created_at).toLocaleString()}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              gap: { xs: 0.25, sm: 2 },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>
              {t('updated_label')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.primary', textAlign: { xs: 'start', sm: 'end' } }}>
              {new Date(course.updated_at).toLocaleString()}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
