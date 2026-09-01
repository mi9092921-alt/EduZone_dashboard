'use client';

import { Search, PersonAdd, Block, Download } from '@mui/icons-material';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  Button,
  IconButton,
  LinearProgress,
  TextField,
  InputAdornment,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EnrollStudentDialog } from './EnrollStudentDialog';
import { RevokeEnrollmentDialog } from './RevokeEnrollmentDialog';

import { useCourseEnrollments } from '@/adapters/queries/courses.queries';
import { TablePagination } from '@/components/ui/TablePagination';
import type { Enrollment } from '@/domain/types/course.types';
import { getEnrollmentStudentName } from '@/domain/types/course.types';
import { getAllCourseEnrollments } from '@/infrastructure/repos/courses.service';

const STATUS_CONFIG: Record<string, 'success' | 'primary' | 'error' | 'warning'> = {
  active: 'success',
  completed: 'primary',
  revoked: 'error',
  expired: 'warning',
};

interface CourseEnrollmentsTabProps {
  courseId: string;
}

export function CourseEnrollmentsTab({ courseId }: CourseEnrollmentsTabProps) {
  const t = useTranslations('common');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Enrollment | null>(null);

  const { data, isLoading } = useCourseEnrollments(courseId, page, pageSize);
  const enrollments = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  // Simple client-side search filter for displayed results
  const filtered = search
    ? enrollments.filter(
        (e) =>
          getEnrollmentStudentName(e).toLowerCase().includes(search.toLowerCase()) ||
          e.user_email?.toLowerCase().includes(search.toLowerCase()),
      )
    : enrollments;

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const allEnrollments = await getAllCourseEnrollments(courseId);

      const headers = [
        t('student_header'),
        'Email',
        t('enrollment_date_header'),
        t('status_header'),
        t('progress_header') + ' (%)',
      ];
      const rows = allEnrollments.map((e) => [
        `"${getEnrollmentStudentName(e)}"`,
        `"${e.user_email || ''}"`,
        `"${new Date(e.enrolled_at).toLocaleDateString()}"`,
        `"${(e.status || 'active').toUpperCase()}"`,
        `"${e.progress_pct || 0}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `course_${courseId}_students.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: 'text.primary' }}>
            {t('enrollments_title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('student_count', { count: totalCount })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            size="small"
            placeholder={t('search_students_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              width: 220,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                fontSize: '0.8125rem',
                backgroundColor: 'background.default',
                '& fieldset': { borderColor: 'divider' },
              },
            }}
          />
          <Button
            variant="outlined"
            startIcon={<Download sx={{ fontSize: 18 }} />}
            onClick={handleExportCSV}
            disabled={isExporting || totalCount === 0}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              borderRadius: 2,
              borderColor: 'divider',
              color: 'text.primary',
              '&:hover': { backgroundColor: 'action.hover', borderColor: 'divider' },
            }}
          >
            {isExporting ? t('exporting') : t('export_csv')}
          </Button>
          <Button
            variant="contained"
            startIcon={<PersonAdd sx={{ fontSize: 18 }} />}
            onClick={() => setEnrollOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderRadius: 2,
              backgroundColor: 'primary.main',
              '&:hover': { backgroundColor: 'primary.dark' },
              boxShadow: 'none',
            }}
          >
            {t('enroll_student_btn')}
          </Button>
        </Box>
      </Box>

      {/* Table */}
      <TableContainer>
        <Table sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'background.default' }}>
              <TableCell
                sx={{
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  py: 2,
                }}
              >
                {t('student_header')}
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  py: 2,
                }}
              >
                {t('enrollment_date_header')}
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  py: 2,
                }}
              >
                {t('progress_header')}
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  py: 2,
                }}
              >
                {t('status_header')}
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  py: 2,
                }}
              >
                {t('actions_header')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('no_student_data')}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((enrollment) => {
                const name = getEnrollmentStudentName(enrollment);
                const initials = name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                const progress = enrollment.progress_pct ?? 0;
                const statusColor = STATUS_CONFIG[enrollment.status] ?? 'default';
                return (
                  <TableRow key={enrollment.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          src={enrollment.user_avatar_url || ''}
                          sx={{
                            width: 36,
                            height: 36,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: 'action.selected',
                            color: 'text.secondary',
                          }}
                        >
                          {initials}
                        </Avatar>
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}
                          >
                            {name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                          >
                            {enrollment.user_email ?? '—'}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}
                      >
                        {new Date(enrollment.enrolled_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: 120 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.625rem',
                            color: 'text.secondary',
                            display: 'block',
                            mb: 0.5,
                          }}
                        >
                          {progress}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: 'action.disabledBackground',
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 3,
                              backgroundColor: progress >= 100 ? 'success.main' : 'primary.main',
                            },
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={(enrollment.status || 'active').toUpperCase()}
                        size="small"
                        color={
                          statusColor as 'success' | 'primary' | 'error' | 'warning' | 'default'
                        }
                        variant="outlined"
                        sx={{
                          height: 22,
                          fontSize: '0.625rem',
                          letterSpacing: '0.04em',
                          fontWeight: 600,
                          borderRadius: 5,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {enrollment.status === 'active' && (
                        <IconButton
                          size="small"
                          onClick={() => setRevokeTarget(enrollment)}
                          sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                        >
                          <Block sx={{ fontSize: 18 }} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination component */}
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Dialogs */}
      <EnrollStudentDialog
        courseId={courseId}
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
      />
      <RevokeEnrollmentDialog
        enrollment={revokeTarget}
        courseId={courseId}
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
      />
    </Box>
  );
}
