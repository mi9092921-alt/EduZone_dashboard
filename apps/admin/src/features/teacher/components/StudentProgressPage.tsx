'use client';

import { Download, Search, People, UpdateOutlined, Block } from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  InputAdornment,
  TextField,
  useTheme,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import { useCourseById } from '@/adapters/queries/courses.queries';
import { useStudentProgress } from '@/adapters/queries/teacher.queries';
import { TablePagination } from '@/components/ui/TablePagination';
import type { StudentProgress } from '@/domain/types/warning.types';
import { EnrollStudentDialog } from '@/features/courses/components/EnrollStudentDialog';
import { ExtendEnrollmentDialog } from '@/features/courses/components/ExtendEnrollmentDialog';
import { RevokeEnrollmentDialog } from '@/features/courses/components/RevokeEnrollmentDialog';

function getInitials(first: string | null, last: string | null) {
  return [(first ?? '')[0], (last ?? '')[0]].filter(Boolean).join('').toUpperCase() || '?';
}

function localizedDate(dateStr: string | null, locale: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function localizedTime(dateStr: string | null, locale: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StudentProgressPage() {
  const theme = useTheme();
  const params = useParams();
  const locale = params.locale as string;
  const t = useTranslations('common');

  const courseId = params.id as string;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<StudentProgress | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<StudentProgress | null>(null);

  useCourseById(courseId);
  const { data, isLoading, refetch } = useStudentProgress(courseId, page, pageSize);
  const students: StudentProgress[] = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  const handleExportCSV = useCallback(() => {
    if (!students.length) return;
    const header = `${t('user_id')},${t('table_header_student')},${t('progress_pct')},${t('table_header_status')},${t('table_header_last_watched')}\n`;
    const rows = students
      .map((s) => {
        const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || t('unknown');
        const status = s.completed ? t('status_completed') : t('status_in_progress');
        return `${s.user_id},"${name}",${s.progress_pct},${status},${s.last_watched ?? ''}`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-progress-${courseId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [students, courseId]);

  // Aggregate stats for the cards

  return (
    <Box>
      {/* Actions Bar */}
      <Box
        sx={{ display: 'flex', justifyContent: 'flex-end', mb: 4, gap: 2, alignItems: 'center' }}
      >
        <Button
          variant="contained"
          onClick={() => setIsEnrollOpen(true)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 3,
            px: 3,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
              backgroundColor: 'primary.dark',
            },
          }}
        >
          {t('btn_enroll_student')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<Download />}
          onClick={handleExportCSV}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 3,
            borderColor: 'divider',
            color: alpha(theme.palette.text.primary, 0.6),
            px: 3,
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        >
          {t('btn_export_csv')}
        </Button>
      </Box>

      <EnrollStudentDialog
        open={isEnrollOpen}
        onClose={() => {
          setIsEnrollOpen(false);
          refetch();
        }}
        courseId={courseId}
      />

      {/* Table Card */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: (t) => t.shadows[1],
          overflow: 'hidden',
        }}
      >
        {/* Search */}
        <Box
          sx={{
            p: 3,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <TextField
            placeholder={t('search_students_placeholder')}
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: 'text.disabled', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              maxWidth: 450,
              width: '100%',
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                backgroundColor: 'background.paper',
                '& fieldset': { borderColor: 'divider' },
                '&:hover fieldset': { borderColor: alpha(theme.palette.primary.main, 0.5) },
                '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: '2px' },
              },
            }}
          />
        </Box>

        <TableContainer>
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'action.hover' }}>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    color: alpha(theme.palette.text.primary, 0.6),
                    letterSpacing: '0.05em',
                    py: 2,
                  }}
                >
                  {t('table_header_student')}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    color: alpha(theme.palette.text.primary, 0.6),
                    letterSpacing: '0.05em',
                    py: 2,
                  }}
                >
                  {t('table_header_progress')}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    color: alpha(theme.palette.text.primary, 0.6),
                    letterSpacing: '0.05em',
                    py: 2,
                  }}
                >
                  {t('table_header_last_watched')}
                </TableCell>
                <TableCell
                  align="center"
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    color: alpha(theme.palette.text.primary, 0.6),
                    letterSpacing: '0.05em',
                    py: 2,
                  }}
                >
                  {t('table_header_status')}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    color: alpha(theme.palette.text.primary, 0.6),
                    letterSpacing: '0.05em',
                    py: 2,
                  }}
                >
                  {t('actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: pageSize }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <LinearProgress sx={{ borderRadius: 1 }} />
                    </TableCell>
                  </TableRow>
                ))
              ) : students.length === 0 ? (
                <TableRow sx={{ backgroundColor: 'transparent' }}>
                  <TableCell colSpan={5} align="center" sx={{ py: 12, border: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        opacity: 0.6,
                      }}
                    >
                      <People sx={{ fontSize: 48, color: 'text.disabled' }} />
                      <Typography
                        variant="body1"
                        sx={{ color: alpha(theme.palette.text.primary, 0.6), fontWeight: 600 }}
                      >
                        {t('no_student_data')}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                students
                  .filter((s) => {
                    if (!search) return true;
                    const name = [s.first_name, s.last_name].join(' ').toLowerCase();
                    return name.includes(search.toLowerCase());
                  })
                  .map((row) => {
                    const name =
                      [row.first_name, row.last_name].filter(Boolean).join(' ') || t('unknown');
                    const maskedEmail = row.email
                      ? row.email.substring(0, 1) +
                        '***@' +
                        row.email.split('@')[1]?.substring(0, 3) +
                        '...'
                      : '';

                    return (
                      <TableRow key={row.user_id} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Avatar
                              src={row.avatar_url || ''}
                              sx={{
                                width: 40,
                                height: 40,
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                backgroundColor: (theme) =>
                                  row.completed
                                    ? alpha(theme.palette.success.main, 0.1)
                                    : alpha(theme.palette.primary.main, 0.1),
                                color: row.completed ? 'success.main' : 'primary.main',
                                opacity: 0.9,
                              }}
                            >
                              {getInitials(row.first_name, row.last_name)}
                            </Avatar>
                            <Box>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}
                              >
                                {name}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: alpha(theme.palette.text.primary, 0.6),
                                  fontWeight: 500,
                                }}
                              >
                                {maskedEmail}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ minWidth: 140 }}>
                            <Typography
                              variant="overline"
                              sx={{
                                fontWeight: 800,
                                color: alpha(theme.palette.text.primary, 0.6),
                                display: 'block',
                                mb: 0.5,
                                lineHeight: 1,
                              }}
                            >
                              {t('completed_pct', { pct: Math.round(row.progress_pct) })}
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={row.progress_pct}
                              color={row.completed ? 'success' : 'primary'}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: 'action.disabledBackground',
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 3,
                                },
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, color: 'text.primary' }}
                            >
                              {localizedDate(row.last_watched, locale)}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: alpha(theme.palette.text.primary, 0.6) }}
                            >
                              {localizedTime(row.last_watched, locale)}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          {(() => {
                            const isCompleted = row.completed || row.status === 'completed';
                            const isRevoked = row.status === 'revoked';
                            const isExpired = row.status === 'expired';

                            const chipColor = isCompleted
                              ? 'success'
                              : isRevoked
                                ? 'error'
                                : isExpired
                                  ? 'warning'
                                  : 'primary';
                            const chipLabel = isCompleted
                              ? t('status_completed')
                              : isRevoked
                                ? t('status_revoked') || 'REVOKED'
                                : isExpired
                                  ? t('status_expired') || 'EXPIRED'
                                  : t('status_in_progress');

                            return (
                              <Chip
                                label={chipLabel}
                                size="small"
                                sx={{
                                  fontWeight: 800,
                                  fontSize: '0.65rem',
                                  textTransform: 'uppercase',
                                  height: 24,
                                  backgroundColor: (theme) => alpha(theme.palette[chipColor].main, 0.1),
                                  color: `${chipColor}.main`,
                                  border: '1px solid',
                                  borderColor: (theme) => alpha(theme.palette[chipColor].main, 0.2),
                                }}
                              />
                            );
                          })()}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, alignItems: 'center' }}>
                            <Tooltip title={t('extend')}>
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={row.completed || row.status === 'completed'}
                                  onClick={() => setExtendTarget(row)}
                                  sx={{
                                    color: 'text.secondary',
                                    '&:hover': {
                                      color: 'primary.main',
                                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                                    },
                                  }}
                                >
                                  <UpdateOutlined sx={{ fontSize: 18 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {row.status === 'active' && !row.completed && (
                              <Tooltip title={t('revoke')}>
                                <IconButton
                                  size="small"
                                  onClick={() => setRevokeTarget(row)}
                                  sx={{
                                    color: 'text.secondary',
                                    '&:hover': {
                                      color: 'error.main',
                                      bgcolor: alpha(theme.palette.error.main, 0.08),
                                    },
                                  }}
                                >
                                  <Block sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
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
      </Box>

      {/* Extend Enrollment Dialog */}
      <ExtendEnrollmentDialog
        open={!!extendTarget}
        onClose={() => {
          setExtendTarget(null);
          refetch();
        }}
        enrollmentId={extendTarget?.enrollment_id ?? null}
        courseId={courseId}
        studentName={
          extendTarget
            ? [extendTarget.first_name, extendTarget.last_name].filter(Boolean).join(' ') ||
              t('unknown')
            : ''
        }
        currentExpiresAt={extendTarget?.expires_at}
      />

      {/* Revoke Enrollment Dialog */}
      <RevokeEnrollmentDialog
        open={!!revokeTarget}
        onClose={() => {
          setRevokeTarget(null);
          refetch();
        }}
        enrollmentId={revokeTarget?.enrollment_id ?? null}
        courseId={courseId}
        studentName={
          revokeTarget
            ? [revokeTarget.first_name, revokeTarget.last_name].filter(Boolean).join(' ') ||
              t('unknown')
            : ''
        }
      />
    </Box>
  );
}
