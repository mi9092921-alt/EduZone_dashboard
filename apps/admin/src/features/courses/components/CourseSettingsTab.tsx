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
  const publishedLessons = course.sections.flatMap((s) => (s.lessons ?? []).filter((l) => l.is_published));
  const canPublish = publishedSections.length > 0 && publishedLessons.length > 0;

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: '#0F172A', mb: 0.5 }}>
        {t('course_settings_title')}
      </Typography>
      <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
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
          p: 3,
          border: '1px solid #E2E8F0',
          borderRadius: 3,
          backgroundColor: '#F8FAFC',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569' }}>
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
                  ? '#ECFDF5'
                  : course.status === 'draft'
                    ? '#FFFBEB'
                    : '#F1F5F9',
              color:
                course.status === 'published'
                  ? '#059669'
                  : course.status === 'draft'
                    ? '#D97706'
                    : '#64748B',
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
                backgroundColor: '#059669',
                '&:hover': { backgroundColor: '#047857' },
                boxShadow: 'none',
                '&.Mui-disabled': { backgroundColor: '#E2E8F0' },
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
                borderColor: '#E2E8F0',
                color: '#64748B',
                '&:hover': { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
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
                borderColor: '#E2E8F0',
                color: '#64748B',
                '&:hover': { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
              }}
            >
              {t('revert_to_draft_btn')}
            </Button>
          )}
        </Box>

        {!canPublish && course.status !== 'published' && (
          <Typography variant="caption" sx={{ color: '#D97706', display: 'block', mt: 1.5 }}>
            {t('publish_requirements')}
          </Typography>
        )}
      </Box>

      {/* Course Info */}
      <Box
        sx={{
          p: 3,
          border: '1px solid #E2E8F0',
          borderRadius: 3,
          backgroundColor: '#fff',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', mb: 2 }}>
          {t('course_details_label')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600 }}>{t('id_label')}</Typography>
            <Typography variant="caption" sx={{ color: '#475569', fontFamily: 'JetBrains Mono' }}>{course.id}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600 }}>{t('url_slug')}</Typography>
            <Typography variant="caption" sx={{ color: '#475569' }}>{course.slug ?? '—'}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600 }}>{t('region_label')}</Typography>
            <Typography variant="caption" sx={{ color: '#475569' }}>{course.region_id}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600 }}>{t('created_label')}</Typography>
            <Typography variant="caption" sx={{ color: '#475569' }}>
              {new Date(course.created_at).toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600 }}>{t('updated_label')}</Typography>
            <Typography variant="caption" sx={{ color: '#475569' }}>
              {new Date(course.updated_at).toLocaleString()}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
