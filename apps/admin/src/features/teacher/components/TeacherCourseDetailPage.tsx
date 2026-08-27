'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Breadcrumbs,
  Link,
  Skeleton,
  Fade,
  Divider,
} from '@mui/material';
import {
  ArrowBack,
  MenuBook,
  People,
  BarChart,
  Settings,
} from '@mui/icons-material';
import { useCourseById } from '@/adapters/queries/courses.queries';
import { StudentProgressPage } from './StudentProgressPage';
import { CourseAnalyticsPage } from './CourseAnalyticsPage';
import { CurriculumBuilder } from '@/features/courses/components/CurriculumBuilder';
import { CourseInfoForm } from '@/features/courses/components/CourseInfoForm';
import { useTranslations } from 'next-intl';

export function TeacherCourseDetailPage() {
  const t = useTranslations('common');
  const router = useRouter();
  const { id: courseId } = useParams() as { id: string };
  const [activeTab, setActiveTab] = useState(0);

  const { data: course, isLoading, isError } = useCourseById(courseId);

  if (isLoading) {
    return (
      <Box sx={{ p: 4 }}>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={300} sx={{ borderRadius: 4 }} />
      </Box>
    );
  }

  if (isError || !course) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" color="error" gutterBottom>
          {t('course_not_found')}
        </Typography>
        <Button 
          startIcon={<ArrowBack sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />} 
          onClick={() => router.push('/courses')}
        >
          {t('back_to_courses')}
        </Button>
      </Box>
    );
  }

  const handleTabChange = (_: any, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header & Breadcrumbs */}
      <Box sx={{ mb: 4 }}>
        <Breadcrumbs sx={{ mb: 2, color: 'text.secondary' }}>
          <Link
            underline="hover"
            color="inherit"
            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
            onClick={() => router.push('/courses')}
          >
            <MenuBook sx={{ fontSize: 16 }} />
            {t('course_breadcrumb')}
          </Link>
          <Typography color="text.primary" sx={{ fontWeight: 600 }}>
            {course.title}
          </Typography>
        </Breadcrumbs>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                color: 'primary.main',
                letterSpacing: '-0.02em',
              }}
            >
              {course.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontWeight: 500 }}>
              {t('manage_course_desc')}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ArrowBack sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />}
            onClick={() => router.push('/courses')}
            sx={{
              borderRadius: 3,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: 'divider',
              color: 'text.secondary',
              gap: 1,
              '& .MuiButton-startIcon': { margin: 0 },
              '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            {t('back')}
          </Button>
        </Box>
      </Box>

      {/* Modern Tabs */}
      <Box sx={{ mb: 4, position: 'relative' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
              backgroundColor: 'primary.main',
            },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              minWidth: 120,
              marginInlineEnd: 2,
              color: 'text.secondary',
              gap: 1.25,
              '&.Mui-selected': {
                color: 'primary.main',
              },
            },
          }}
        >
          <Tab icon={<People sx={{ fontSize: 20 }} />} iconPosition="start" label={t('students_tab')} />
          <Tab icon={<MenuBook sx={{ fontSize: 20 }} />} iconPosition="start" label={t('curriculum_tab')} />
          <Tab icon={<BarChart sx={{ fontSize: 20 }} />} iconPosition="start" label={t('analytics_tab')} />
          <Tab icon={<Settings sx={{ fontSize: 20 }} />} iconPosition="start" label={t('details_tab')} />
        </Tabs>
        <Divider sx={{ position: 'absolute', bottom: 0, width: '100%', zIndex: -1 }} />
      </Box>

      {/* Tab Panels */}
      <Box sx={{ minHeight: 400 }}>
        {activeTab === 0 && (
          <Fade in timeout={400}>
            <Box>
              <StudentProgressPage />
            </Box>
          </Fade>
        )}
        {activeTab === 1 && (
          <Fade in timeout={400}>
            <Box sx={{ p: 4, borderRadius: 4, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <CurriculumBuilder courseId={course!.id} sections={course!.sections} />
            </Box>
          </Fade>
        )}
        {activeTab === 2 && (
          <Fade in timeout={400}>
            <Box>
              <CourseAnalyticsPage />
            </Box>
          </Fade>
        )}
        {activeTab === 3 && (
          <Fade in timeout={400}>
            <Box sx={{ maxWidth: 800 }}>
              <CourseInfoForm course={course!} hideTeacherSelect={true} />
            </Box>
          </Fade>
        )}
      </Box>
    </Box>
  );
}
