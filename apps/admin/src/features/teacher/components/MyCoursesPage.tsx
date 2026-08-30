'use client';

import { Add, PlayCircleOutline, People, School, Upload } from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  Chip,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';


import { useTeacherCourses } from '@/adapters/queries/teacher.queries';
import type { CourseFilters, CourseStatus } from '@/domain/types/course.types';
import { CreateCourseDialog } from '@/features/courses/components/CreateCourseDialog';
import { ImportCourseDialog } from '@/features/courses/components/ImportCourseDialog';
import { useRouter } from '@/i18n/routing';


const getStatusColors = (status: string, opacity: string = '1A') => {
  switch (status) {
    case 'published': return { bg: 'success.main', text: 'success.main', alpha: 'success.main' + opacity };
    case 'archived': return { bg: 'error.main', text: 'error.main', alpha: 'error.main' + opacity };
    default: return { bg: 'text.secondary', text: 'text.secondary', alpha: 'text.secondary' + '1A' };
  }
};

export function MyCoursesPage() {
  const router = useRouter();
  const t = useTranslations('common');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CourseStatus | undefined>(undefined);
  const [page] = useState(1);
  const pageSize = 50;

  const filters: CourseFilters = statusFilter ? { status: statusFilter } : {};
  const { data, isLoading } = useTeacherCourses(filters, page, pageSize);
  const courses = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  const handleTabChange = useCallback((_: unknown, val: number) => {
    const map: (CourseStatus | undefined)[] = [undefined, 'published', 'draft', 'archived'];
    setStatusFilter(map[val]);
  }, []);

  const tabValue = statusFilter === 'published' ? 1 : statusFilter === 'draft' ? 2 : statusFilter === 'archived' ? 3 : 0;

  return (
    <Box>
      {/* Page header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: 'text.primary',
              letterSpacing: '-0.025em',
              fontSize: { xs: '1.5rem', md: '1.75rem' },
            }}
          >
            {t('my_courses')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('manage_curriculum')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<Upload />}
            onClick={() => setImportOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: 'action.hover',
                borderColor: 'divider',
              },
            }}
          >
            {t('btn_import_course')}
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              backgroundColor: 'primary.main',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: 'primary.dark',
                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              },
            }}
          >
            {t('btn_create_course')}
          </Button>
        </Box>
      </Box>

      {/* Filter tabs */}
      <Box sx={{ borderBottom: '1px solid #E2E8F0', mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 40,
              py: 1,
            },
            '& .Mui-selected': { color: 'primary.main' },
            '& .MuiTabs-indicator': { backgroundColor: 'primary.main' },
          }}
        >
          <Tab label={t('all_courses_count', { count: totalCount })} />
          <Tab label={t('published')} />
          <Tab label={t('draft')} />
          <Tab label={t('archived')} />
        </Tabs>
      </Box>

      {/* Loading state */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress color="primary" />
        </Box>
      )}

      {/* Course grid */}
      {!isLoading && courses.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
            },
            gap: 3,
          }}
        >
          {courses.map((course) => {
            return (
              <Card
                key={course.id}
                onClick={() => router.push(`/courses/${course.id}`)}
              sx={{
                cursor: 'pointer',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                boxShadow: 'none',
                transition: 'all 300ms ease',
                overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    boxShadow: '0 12px 32px rgba(0,0,0,0.1)',
                    transform: 'translateY(-4px)',
                    '& .course-thumb': {
                      transform: 'scale(1.05)',
                    },
                  },
                }}
              >
                {/* Thumbnail */}
                <Box sx={{ position: 'relative', overflow: 'hidden', aspectRatio: '16/9' }}>
                  {course.thumbnail_url ? (
                    <CardMedia
                      component="img"
                      image={course.thumbnail_url}
                      alt={course.title}
                      className="course-thumb"
                      sx={{
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'transform 500ms ease',
                      }}
                    />
                  ) : (
                    <Box
                      className="course-thumb"
                      sx={{
                        height: '100%',
                        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 500ms ease',
                      }}
                    >
                      <School sx={{ fontSize: 48, color: 'rgba(255,255,255,0.3)' }} />
                    </Box>
                  )}
                  <Box sx={{ position: 'absolute', top: 12, left: 12 }}>
                    <Chip
                      label={t(course.status as Parameters<typeof t>[0])}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: getStatusColors(course.status).alpha,
                        color: getStatusColors(course.status).text,
                        height: 24,
                      }}
                    />
                  </Box>
                </Box>

                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2.5 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 700,
                      color: 'text.primary',
                      lineHeight: 1.3,
                      mb: 0.5,
                    }}
                  >
                    {course.title}
                  </Typography>
                  {course.description && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 2,
                        fontSize: '0.8125rem',
                      }}
                    >
                      {course.description}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      mt: 'auto',
                      pt: 2,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 2,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <PlayCircleOutline sx={{ fontSize: 18 }} />
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                        {t('lessons_count', { count: course.enrollment_count ?? 0 })}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <People sx={{ fontSize: 18 }} />
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                        {t('students_count', { count: course.enrollment_count ?? 0 })}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}

        </Box>
      )}

      {/* Empty state */}
      {!isLoading && courses.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <School sx={{ fontSize: 64, color: '#E2E8F0', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#64748B', mb: 1 }}>
            {t('no_courses_title')}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94A3B8', mb: 3 }}>
            {t('no_courses_desc')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              backgroundColor: 'primary.main',
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            {t('btn_create_course')}
          </Button>
        </Box>
      )}

      <CreateCourseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportCourseDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </Box>
  );
}
