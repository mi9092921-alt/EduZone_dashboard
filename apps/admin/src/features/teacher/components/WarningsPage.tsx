'use client';

import {
  ReportProblem,
  CheckCircle,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info,
  Download,
  FilterList,
  TrendingDown,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  Card as MuiCard,
  CardContent as MuiCardContent,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Badge,
  Collapse,
  IconButton,
  useTheme,
} from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useCallback } from 'react';

import { useIssueWarning } from '@/adapters/mutations/warnings.mutations';
import { useTeacherWarnings, useWarnableStudents } from '@/adapters/queries/teacher.queries';
import { useAuthUser, useAuthPermissions } from '@/adapters/stores/auth.store';
import { useToastStore } from '@/adapters/stores/toast.store';
import {
  StatsCard,
  StatsCardContent,
  StatsCardIcon
} from '@/components/ui/Card';
import { TablePagination } from '@/components/ui/TablePagination';
import type { WarningSeverity, WarningFilters } from '@/domain/types/warning.types';
import { getWarnings } from '@/infrastructure/repos/warnings.service';


function getSeverityTokens(severity: WarningSeverity, theme: Theme) {
  switch (severity) {
    case 1: return { bg: alpha(theme.palette.success.main, 0.12), text: theme.palette.success.dark, dot: theme.palette.success.main };
    case 2: return { bg: alpha(theme.palette.warning.main, 0.12), text: theme.palette.warning.dark, dot: theme.palette.warning.main };
    case 3: return { bg: alpha(theme.palette.error.main, 0.12), text: theme.palette.error.dark, dot: theme.palette.error.main };
    default: return { bg: alpha(theme.palette.info.main, 0.12), text: theme.palette.info.dark, dot: theme.palette.info.main };
  }
}

function formatDate(dateStr: string, locale: string = 'en-US') {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function WarningsPage() {
  const user = useAuthUser();
  const isTeacher = user?.primary_role === 'teacher';
  // Issue-warning UI is permission-gated (PRD warnings.write matrix: admin +
  // super_admin + teacher = YES) — previously the form was hidden from admins
  // entirely, so they had no way to create warnings from this page.
  const permissions = useAuthPermissions();
  const canIssue = isTeacher || permissions.includes('warnings.write');
  const t = useTranslations('warnings');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const theme = useTheme();

  // ── List state ──────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<WarningFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { data, isLoading, isFetching } = useTeacherWarnings(filters, page, pageSize);
  const warnings = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalResolved = warnings.filter((w) => w.is_acknowledged).length;
  const totalReviewNeeded = warnings.filter((w) => !w.is_acknowledged).length;
  const hasActiveFilters = filters.severity !== undefined || filters.acknowledged !== undefined;

  // ── Form state ──────────────────────────────────────────────────
  const [studentId, setStudentId] = useState('');
  const [severity, setSeverity] = useState<WarningSeverity>(2);
  const [reason, setReason] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const { showToast } = useToastStore();

  // ── Data ─────────────────────────────────────────────────────────
  const { data: students } = useWarnableStudents();
  const issueMutation = useIssueWarning();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!studentId || reason.length < 20) return;

      try {
        await issueMutation.mutateAsync({
          user_id: studentId,
          reason,
          severity,
          action: actionTaken || 'none',
        });
        setStudentId('');
        setReason('');
        setActionTaken('');
        setSeverity(2);
        setActionTaken('');
        setSeverity(2);
        showToast(t('status_success'), 'success');
      } catch (_err) {
        showToast(t('status_error'), 'error');
      }
    },
    [studentId, reason, severity, actionTaken, issueMutation],
  );

  const handleSeverityFilterChange = useCallback((value: string) => {
    setFilters((f) => {
      const next = { ...f };
      if (value === 'all') {
        delete next.severity;
      } else {
        next.severity = Number(value) as WarningSeverity;
      }
      return next;
    });
    setPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setFilters((f) => {
      const next = { ...f };
      if (value === 'all') {
        delete next.acknowledged;
      } else {
        next.acknowledged = value === 'processed';
      }
      return next;
    });
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const handleExportCSV = useCallback(async () => {
    if (totalCount === 0) {
      showToast(t('export_empty'), 'info');
      return;
    }
    try {
      setIsExporting(true);
      // Mirror useTeacherWarnings scoping: teachers export only their own warnings.
      const resolved = isTeacher ? { ...filters, issued_by: user?.id } : filters;
      const all = await getWarnings(resolved, 1, Math.min(Math.max(totalCount, 1), 5000));
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = [
        t('header_student'),
        t('header_reason'),
        t('header_severity'),
        t('header_date'),
        t('header_status'),
      ].map(esc).join(',');
      const rows = all.data.map((w) =>
        [
          w.student_name ?? 'Unknown',
          w.reason,
          t(`severity_${w.severity}` as 'severity_1' | 'severity_2' | 'severity_3'),
          formatDate(w.created_at, locale),
          w.is_acknowledged ? t('status_processed') : t('status_review'),
        ].map(esc).join(','),
      );
      const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `warnings-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast(t('export_error'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [filters, isTeacher, user?.id, totalCount, showToast, t, locale]);

  const severityButtons: { value: WarningSeverity; icon: React.ReactNode; color: string }[] = [
    { value: 1, icon: <CheckCircle color="success" sx={{ fontSize: 20 }} />, color: 'success.main' },
    { value: 2, icon: <WarningIcon color="primary" sx={{ fontSize: 20 }} />, color: 'primary.main' },
    { value: 3, icon: <ErrorIcon color="error" sx={{ fontSize: 20 }} />, color: 'error.main' },
  ];

  return (
    <Box sx={{ minWidth: 0, overflowX: 'clip' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center flex-wrap gap-3 min-w-0">
          <h1 className="text-title break-words min-w-0">{t('page_title')}</h1>
          <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
            {totalCount.toLocaleString()} {tCommon('total')}
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tCommon('updating')}
            </div>
          )}
        </div>
        {canIssue && (
          <Button
            variant="contained"
            startIcon={<ReportProblem />}
            onClick={() => document.getElementById('warning-form')?.scrollIntoView({ behavior: 'smooth' })}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 3,
              backgroundColor: 'primary.main',
              boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
              '&:hover': { backgroundColor: 'primary.dark' },
              width: { xs: '100%', md: 'auto' },
              whiteSpace: 'nowrap',
            }}
          >
            {t('btn_add_warning')}
          </Button>
        )}
      </div>

      {/* Policy Banner */}
      <Alert
        severity="warning"
        icon={<Info sx={{ fontSize: { xs: 24, md: 28 } }} />}
        sx={{
          mb: 4,
          borderRadius: 3,
          p: { xs: 2, md: 2.5 },
          '& .MuiAlert-message': { width: '100%', p: 0 },
          '& .MuiAlert-icon': { pt: 0.5 }
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
          <Box sx={{ flex: '1 1 auto' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'warning.dark', fontSize: { xs: '0.85rem', md: '0.9rem' } }}>
              {t('policy_title')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'warning.dark', opacity: 0.9, maxWidth: 600, fontSize: { xs: '0.75rem', md: '0.8rem' }, mt: 0.5 }}>
              {t.rich('policy_desc', {
                underline: (chunks) => <strong style={{ textDecoration: 'underline' }}>{chunks}</strong>
              })}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              whiteSpace: 'nowrap',
              px: 2,
              minWidth: 'fit-content',
              fontSize: '0.75rem',
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            {t('btn_full_policy')}
          </Button>
        </Box>
      </Alert>

      {/* Grid: Form + Table */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(12, 1fr)' }, gap: 3, minWidth: 0 }}>
        {/* Left: Issue Form */}
        {canIssue && (
          <MuiCard id="warning-form" sx={{ gridColumn: { xs: 'span 1', lg: 'span 5', xl: 'span 4' }, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', alignSelf: 'flex-start', bgcolor: 'background.paper', minWidth: 0 }}>
            <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReportProblem sx={{ color: 'primary.main', fontSize: 20 }} />
                {t('form_title')}
              </Typography>
            </Box>
            <MuiCardContent sx={{ p: 3 }}>
              <form onSubmit={handleSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {/* Student selector */}
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('label_select_student')}</InputLabel>
                    <Select
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      label={t('label_select_student')}
                      sx={{ borderRadius: 2 }}
                    >
                      {(students ?? []).map((s) => (
                        <MenuItem key={s.id} value={s.id}>
                          {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'Unknown'}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Severity */}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, fontSize: '0.8rem' }}>{t('label_severity_level')}</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
                      {severityButtons.map((btn) => (
                        <Box
                          key={btn.value}
                          onClick={() => setSeverity(btn.value)}
                          sx={{
                            display: 'flex',
                            flexDirection: { xs: 'row', sm: 'column' },
                            alignItems: 'center',
                            justifyContent: { xs: 'flex-start', sm: 'center' },
                            gap: 1.5,
                            p: { xs: 1, sm: 1.5 },
                            borderRadius: 2,
                            border: '2px solid',
                            borderColor: severity === btn.value
                              ? (btn.value === 3 ? 'error.main' : btn.value === 1 ? 'success.main' : 'primary.main')
                              : 'divider',
                            backgroundColor: severity === btn.value
                              ? alpha(
                                  btn.value === 3 ? theme.palette.error.main
                                  : btn.value === 1 ? theme.palette.success.main
                                  : theme.palette.primary.main,
                                  0.08
                                )
                              : 'transparent',
                            cursor: 'pointer',
                            transition: 'all 150ms',
                            '&:hover': {
                              borderColor: btn.value === 3 ? 'error.main' : btn.value === 1 ? 'success.main' : 'primary.main',
                              backgroundColor: alpha(
                                btn.value === 3 ? theme.palette.error.main
                                : btn.value === 1 ? theme.palette.success.main
                                : theme.palette.primary.main,
                                0.04
                              ),
                            },
                          }}
                        >
                          {btn.icon}
                          <Typography variant="caption" sx={{ fontWeight: 700, color: severity === btn.value ? btn.color : 'text.secondary', fontSize: '0.65rem' }}>
                            {t(`severity_${btn.value}` as 'severity_1' | 'severity_2' | 'severity_3')}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Reason */}
                  <TextField
                    label={t('label_reason')}
                    placeholder={t('placeholder_reason')}
                    multiline
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    size="small"
                    error={reason.length > 0 && reason.length < 20}
                    helperText={reason.length > 0 && reason.length < 20 ? t('error_reason_min') : ''}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />

                  {/* Action taken */}
                  <TextField
                    label={t('label_action_taken')}
                    placeholder={t('placeholder_action')}
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />

                  {/* Submit */}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={!studentId || reason.length < 20 || issueMutation.isPending}
                    fullWidth
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      borderRadius: 2,
                      py: 1.5,
                      backgroundColor: 'text.primary',
                      '&:hover': { backgroundColor: 'text.secondary' },
                    }}
                  >
                    {issueMutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : t('btn_submit')}
                  </Button>
                </Box>
              </form>
            </MuiCardContent>
          </MuiCard>
        )}

        {/* Right: Warnings Table */}
        <Box sx={{ gridColumn: { xs: 'span 1', lg: canIssue ? 'span 7' : 'span 12', xl: canIssue ? 'span 8' : 'span 12' }, minWidth: 0 }}>
          <MuiCard sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', overflow: 'hidden', bgcolor: 'background.paper' }}>
            <Box sx={{ p: { xs: 2, sm: 2.5 }, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'break-word' }}>
                {isTeacher ? t('table_title_mine') : t('table_title_all')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton
                  size="small"
                  aria-label={tCommon('filter')}
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((v) => !v)}
                  sx={{
                    border: '1px solid',
                    borderColor: hasActiveFilters ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    color: hasActiveFilters || filtersOpen ? 'primary.main' : 'text.secondary',
                    backgroundColor: hasActiveFilters
                      ? alpha(theme.palette.primary.main, 0.08)
                      : 'transparent',
                    '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
                  }}
                >
                  <Badge variant="dot" color="primary" invisible={!hasActiveFilters}>
                    <FilterList sx={{ fontSize: 18 }} />
                  </Badge>
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={tCommon('download')}
                  onClick={handleExportCSV}
                  disabled={isExporting || totalCount === 0}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                  }}
                >
                  <Download sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Box>

            {/* Filter bar */}
            <Collapse in={filtersOpen} timeout="auto" unmountOnExit>
              <Box
                sx={{
                  px: { xs: 2, sm: 2.5 },
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5,
                  alignItems: { xs: 'stretch', sm: 'center' },
                }}
              >
                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 170 } }}>
                  <InputLabel>{t('filter_severity')}</InputLabel>
                  <Select
                    value={filters.severity ?? 'all'}
                    onChange={(e) => handleSeverityFilterChange(e.target.value as string)}
                    label={t('filter_severity')}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="all">{t('filter_all')}</MenuItem>
                    <MenuItem value={1}>{t('severity_1')}</MenuItem>
                    <MenuItem value={2}>{t('severity_2')}</MenuItem>
                    <MenuItem value={3}>{t('severity_3')}</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 170 } }}>
                  <InputLabel>{t('filter_status')}</InputLabel>
                  <Select
                    value={
                      filters.acknowledged === undefined
                        ? 'all'
                        : filters.acknowledged
                          ? 'processed'
                          : 'review'
                    }
                    onChange={(e) => handleStatusFilterChange(e.target.value as string)}
                    label={t('filter_status')}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="all">{t('filter_all')}</MenuItem>
                    <MenuItem value="review">{t('status_review')}</MenuItem>
                    <MenuItem value="processed">{t('status_processed')}</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="text"
                  size="small"
                  onClick={handleClearFilters}
                  disabled={!hasActiveFilters}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    alignSelf: { xs: 'flex-start', sm: 'center' },
                  }}
                >
                  {t('filter_clear')}
                </Button>
              </Box>
            </Collapse>

            <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
              <Table sx={{ minWidth: 600 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'background.default' }}>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', color: 'text.secondary', py: 2, whiteSpace: 'nowrap' }}>{t('header_student')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', color: 'text.secondary', py: 2, whiteSpace: 'nowrap' }}>{t('header_reason')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', color: 'text.secondary', py: 2, whiteSpace: 'nowrap' }}>{t('header_severity')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', color: 'text.secondary', py: 2, whiteSpace: 'nowrap' }}>{t('header_date')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem', color: 'text.secondary', py: 2, whiteSpace: 'nowrap' }}>{t('header_status')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: pageSize }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <CircularProgress size={20} sx={{ display: 'block', mx: 'auto' }} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : warnings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t('no_warnings')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    warnings.map((row) => {
                      const sevColors = getSeverityTokens(row.severity as WarningSeverity, theme);
                      return (
                        <TableRow key={row.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                              <Avatar
                                src={row.student_avatar_url || ''}
                                sx={{ width: 32, height: 32, fontSize: '0.7rem', fontWeight: 700, backgroundColor: 'action.selected', color: 'text.secondary', flexShrink: 0 }}
                              >
                                {getInitials(row.student_name ?? 'U')}
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'break-word' }}>
                                  {row.student_name ?? 'Unknown'}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ maxWidth: { xs: 140, sm: 250 } }}>
                            <Typography variant="body2" noWrap>
                              {row.reason}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sevColors.dot }} />
                                  {t(`severity_${row.severity}` as 'severity_1' | 'severity_2' | 'severity_3')}
                                </Box>
                              }
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.6875rem',
                                backgroundColor: sevColors.bg,
                                color: sevColors.text,
                                height: 26,
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                              {formatDate(row.created_at, locale)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                color: row.is_acknowledged ? 'success.main' : 'text.disabled',
                              }}
                            >
                              {row.is_acknowledged ? t('status_processed') : t('status_review')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </Box>
          </MuiCard>

          {/* Stats cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(200px, 1fr))', md: '1fr 1fr 1fr' }, gap: 3, mt: 3 }}>
            <StatsCard className="relative transition-colors hover:bg-muted/20 overflow-hidden">
              <StatsCardContent className="flex flex-row items-center gap-4 p-5">
                <StatsCardIcon
                  style={{ backgroundColor: alpha(theme.palette.primary.main, 0.1), color: theme.palette.primary.main }}
                  className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                >
                  <TrendingDown sx={{ fontSize: 20 }} />
                </StatsCardIcon>
                <div className="flex flex-col min-w-0 flex-1 pe-6 sm:pe-0">
                  <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, mb: 0.5, textTransform: 'uppercase', fontSize: '0.625rem', lineHeight: 1.2 }} className="truncate">
                    {t('title_active_warnings')}
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: 'text.primary', lineHeight: 1, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                    {totalCount.toLocaleString()}
                  </Typography>
                </div>
                <Chip
                  label={t('chip_this_term')}
                  size="small"
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.5rem',
                    height: 16,
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'primary.main',
                    color: 'white'
                  }}
                />
              </StatsCardContent>
            </StatsCard>

            <StatsCard className="relative transition-colors hover:bg-muted/20 overflow-hidden">
              <StatsCardContent className="flex flex-row items-center gap-4 p-5">
                <StatsCardIcon
                  style={{ backgroundColor: alpha(theme.palette.success.main, 0.1), color: theme.palette.success.main }}
                  className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                >
                  <CheckCircle sx={{ fontSize: 20 }} />
                </StatsCardIcon>
                <div className="flex flex-col min-w-0 flex-1 pe-6 sm:pe-0">
                  <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, mb: 0.5, textTransform: 'uppercase', fontSize: '0.625rem', lineHeight: 1.2 }} className="truncate">
                    {t('title_resolved_warnings')}
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: 'text.primary', lineHeight: 1, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                    {totalResolved.toLocaleString()}
                  </Typography>
                </div>
                <Chip
                  label={t('chip_this_term')}
                  size="small"
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.5rem',
                    height: 16,
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'success.main',
                    color: 'white'
                  }}
                />
              </StatsCardContent>
            </StatsCard>

            <StatsCard className="relative transition-colors hover:bg-muted/20 overflow-hidden">
              <StatsCardContent className="flex flex-row items-center gap-4 p-5">
                <StatsCardIcon
                  style={{ backgroundColor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.main }}
                  className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                >
                  <ReportProblem sx={{ fontSize: 20 }} />
                </StatsCardIcon>
                <div className="flex flex-col min-w-0 flex-1 pe-6 sm:pe-0">
                  <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, mb: 0.5, textTransform: 'uppercase', fontSize: '0.625rem', lineHeight: 1.2 }} className="truncate">
                    {t('title_review_needed')}
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, color: 'error.main', lineHeight: 1, fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                    {totalReviewNeeded.toLocaleString()}
                  </Typography>
                </div>
                <Chip
                  label={t('chip_urgent')}
                  size="small"
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.5rem',
                    height: 16,
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'error.main',
                    color: 'white'
                  }}
                />
              </StatsCardContent>
            </StatsCard>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
