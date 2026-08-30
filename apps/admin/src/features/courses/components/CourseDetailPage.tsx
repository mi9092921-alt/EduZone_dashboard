'use client';

import { ArrowBack } from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  Tab,
  Tabs,
  Chip,
  Skeleton,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';



import { CourseEnrollmentsTab } from './CourseEnrollmentsTab';
import { CourseInfoForm } from './CourseInfoForm';
import { CourseSettingsTab } from './CourseSettingsTab';
import { CurriculumBuilder } from './CurriculumBuilder';

import { useCourseById } from '@/adapters/queries/courses.queries';
import { useRouter } from '@/i18n/routing';

interface CourseDetailPageProps {
  courseId: string;
}


export function CourseDetailPage({ courseId }: CourseDetailPageProps) {
  const t = useTranslations('common');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const { data: course, isLoading } = useCourseById(courseId);

  if (isLoading) {
    return (
      <Box>
        <Skeleton width={300} height={32} sx={{ mb: 1 }} />
        <Skeleton width={200} height={20} sx={{ mb: 3 }} />
        <Skeleton width="100%" height={48} sx={{ mb: 3, borderRadius: 2 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" width="100%" height={200} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" width="100%" height={200} sx={{ borderRadius: 3 }} />
        </Box>
      </Box>
    );
  }

  if (!course) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ color: '#94A3B8', mb: 2 }}>
          {t('course_not_found')}
        </Typography>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => router.push('/courses')}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {t('back_to_courses')}
        </Button>
      </Box>
    );
  }

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    published: { color: '#059669', bg: '#ECFDF5' },
    draft: { color: '#D97706', bg: '#FFFBEB' },
    archived: { color: '#64748B', bg: '#F1F5F9' },
  };
  const statusStyle = STATUS_COLORS[course.status || 'draft'] ?? STATUS_COLORS.draft;

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs
        sx={{ mb: 1.5, '& .MuiBreadcrumbs-separator': { color: '#CBD5E1' } }}
      >
        <MuiLink
          underline="hover"
          color="#64748B"
          href="/courses"
          onClick={(e) => {
            e.preventDefault();
            router.push('/courses');
          }}
          sx={{ fontSize: '0.8125rem', fontWeight: 500 }}
        >
          {t('courses_breadcrumb')}
        </MuiLink>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>
          {course.title}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.025em',
              fontSize: { xs: '1.25rem', md: '1.5rem' },
            }}
          >
            {course.title}
          </Typography>
          <Chip
            label={(course.status || 'draft').toUpperCase()}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              backgroundColor: statusStyle?.bg ?? '#FFFBEB',
              color: statusStyle?.color ?? '#D97706',
              borderRadius: 5,
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => router.push('/courses')}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              borderColor: '#E2E8F0',
              color: '#475569',
              '&:hover': { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
            }}
          >
            {t('back')}
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Box
        sx={{
          borderBottom: '1px solid #E2E8F0',
          mb: 4,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: '#64748B',
              minHeight: 48,
              '&.Mui-selected': { color: '#6366F1' },
            },
            '& .MuiTabs-indicator': { backgroundColor: '#6366F1', height: 2 },
          }}
        >
          <Tab label={t('general_info_tab')} />
          <Tab label={t('curriculum_tab')} />
          <Tab label={t('enrollments_tab')} />
          <Tab label={t('settings_tab')} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ maxWidth: '100%' }}>
        {activeTab === 0 && <CourseInfoForm course={course} />}
        {activeTab === 1 && (
          <CurriculumBuilder courseId={course.id} sections={course.sections} />
        )}
        {activeTab === 2 && <CourseEnrollmentsTab courseId={course.id} />}
        {activeTab === 3 && <CourseSettingsTab course={course} />}
      </Box>
    </Box>
  );
}
