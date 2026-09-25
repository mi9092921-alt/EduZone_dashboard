'use client';

import {
  Flag,
  Add,
  ExpandMore,
  ExpandLess,
  Delete,
  PersonAdd,
  GroupAdd,
  DomainAdd,
  ContentCopy,
  CalendarToday,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Switch,
  Slider,
  Chip,
  IconButton,
  Tooltip,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Alert,
  CircularProgress,
  Autocomplete,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { memo, useState, useCallback, useEffect } from 'react';

import { PermissionGate } from '../../layout/components/PermissionGate';

import {
  useCreateFeatureFlag,
  useToggleFeatureFlag,
  useUpdateFeatureFlag,
  useDeleteFeatureFlag,
  useAddRoleOverride,
  useRemoveRoleOverride,
  useAddUserOverride,
  useRemoveUserOverride,
  useUpsertTenantOverride,
  useDeleteTenantOverride,
} from '@/adapters/mutations/settings.mutations';
import { useFeatureFlags, useFeatureFlagDetail, useRoles } from '@/adapters/queries/settings.queries';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { useToastStore } from '@/adapters/stores/toast.store';
import { LtrIsland } from '@/components/ui/LtrIsland';
import { toClientMessage } from '@/domain/errors';
import type {
  CreateFeatureFlagInput,
  FeatureFlag,
  FeatureFlagStatus,
} from '@/domain/types/feature-flag.types';
import { usePathname, useRouter } from '@/i18n/routing';

export function FeatureFlagsPage() {
  const user = useAuthUser();
  const canManageFeatureFlags = user?.primary_role === 'super_admin' ||
    user?.permissions.includes('feature_flags.manage');
  const theme = useTheme();
  const isRtl = theme.direction === 'rtl';
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Action selector (not the whole store) — subscribing with no selector would
  // re-render the page (and every row) on every toast open/close.
  const showToast = useToastStore((s) => s.showToast);

  const setSearchParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const isCreateOpen =
    searchParams.get('dialog') === 'create-flag' ||
    searchParams.get('dialog') === 'create' ||
    createOpen;

  const handleOpenCreate = useCallback(() => {
    setCreateOpen(true);
    setSearchParam('dialog', 'create-flag');
  }, [setSearchParam]);

  const handleCloseCreate = useCallback(() => {
    setCreateOpen(false);
    setSearchParam('dialog', null);
  }, [setSearchParam]);

  const [deleteTarget, setDeleteTarget] = useState<FeatureFlag | null>(null);

  // Do not invoke the server action for a user who is going to be denied by
  // the gate below. This avoids a predictable Permission denied event when a
  // non-manager reaches the route through a stale bookmark.
  const { data: flags, isLoading, isFetching } = useFeatureFlags(Boolean(canManageFeatureFlags));
  const deleteMutation = useDeleteFeatureFlag();

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      showToast(t('feature_flags.status_delete_success'), 'success');
    } catch {
      showToast(t('error_delete'), 'error');
    }
  }, [deleteTarget, deleteMutation, showToast, t]);

  // Stable callbacks so memoized rows bail out of unrelated page re-renders.
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDeleteClick = useCallback((flag: FeatureFlag) => {
    setDeleteTarget(flag);
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PermissionGate roles={['super_admin']} fallback={
      <Alert severity="error" sx={{ borderRadius: 3 }}>
        {t('admin_only_error')}
      </Alert>
    }>
      <Box sx={{ minWidth: 0, overflowX: 'clip' }}>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center flex-wrap gap-3 min-w-0">
            <h1 className="text-title break-words min-w-0">{t('feature_flags.page_title')}</h1>
            <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
              {(flags ?? []).length.toLocaleString()} {tCommon('total')}
            </div>
            {isFetching && !isLoading && (
              <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {tCommon('updating')}
              </div>
            )}
          </div>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenCreate}
            sx={{
              textTransform: 'none', fontWeight: 600, borderRadius: 2,
              backgroundColor: 'primary.main',
              boxShadow: 'none',
              gap: 1,
              width: { xs: '100%', md: 'auto' },
              whiteSpace: 'nowrap',
              '& .MuiButton-startIcon': {
                marginInlineEnd: '8px !important',
                marginInlineStart: '0 !important',
                mr: '0 !important',
                ml: '0 !important',
              },
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            {t('feature_flags.btn_add')}
          </Button>
        </div>

        {/* Flags Table — DESKTOP (≥md) */}
        <Box className="hidden md:block">
          <TableContainer sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 3, maxWidth: '100%' }}>
            {/* Fixed layout: column widths are locked to the header row, so data
                updates (toggle/rollout/refetch) can never reflow the columns. */}
            <Table size="small" sx={{ minWidth: 1150, tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ width: 64, py: 1.25 }} />
                  <TableCell sx={{ width: 200, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_key')}</TableCell>
                  <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_label')}</TableCell>
                  <TableCell sx={{ width: 150, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_status')}</TableCell>
                  <TableCell sx={{ width: 90, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_enabled')}</TableCell>
                  <TableCell sx={{ width: 200, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_rollout')}</TableCell>
                  <TableCell sx={{ width: 190, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_period')}</TableCell>
                  <TableCell align={isRtl ? 'left' : 'right'} sx={{ width: 80, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 1.25 }}>{t('feature_flags.table_actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <LinearProgress sx={{ borderRadius: 1 }} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (flags ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('feature_flags.no_flags')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  (flags ?? []).map((row) => (
                    <FeatureFlagRow
                      key={row.id}
                      row={row}
                      expanded={expandedId === row.id}
                      onToggleExpand={handleToggleExpand}
                      onDeleteClick={handleDeleteClick}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* MOBILE (<md): stacked flag cards — the 1150px table is unusable on phones */}
        <Box
          className="md:hidden"
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          {(flags ?? []).map((row) => (
            <FeatureFlagCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggleExpand={handleToggleExpand}
              onDeleteClick={handleDeleteClick}
            />
          ))}
          {(flags ?? []).length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
              {t('feature_flags.no_flags')}
            </Typography>
          )}
        </Box>

        {/* Create Dialog */}
        <CreateFlagDialog
          open={isCreateOpen}
          onClose={handleCloseCreate}
          onSuccess={() => {
            handleCloseCreate();
            showToast(t('feature_flags.status_create_success'), 'success');
          }}
        />

        {/* Delete Dialog */}
        <Dialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          maxWidth="xs"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>
            {t('feature_flags.confirm_delete_title')}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t('feature_flags.confirm_delete_msg', { key: deleteTarget?.key ?? '' })}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>
            <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none' }}>
              {t('btn_cancel')}
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {t('btn_delete')}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </PermissionGate>
  );
}

// ══════════════════════════════════════════════════
// SHARED ROW STATE — used by both the desktop table row
// and the mobile card so behavior stays identical
// ══════════════════════════════════════════════════

interface FeatureFlagRowProps {
  row: FeatureFlag;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onDeleteClick: (flag: FeatureFlag) => void;
}

/**
 * Row-local optimistic drafts + mutations, extracted from the table row so the
 * mobile card can share them. Displayed value = draft ?? server value. Drafts
 * are pruned once the (optimistically patched) cache catches up; on failure
 * the mutation rolls the cache back and the draft is dropped.
 */
function useFlagRowActions(row: FeatureFlag) {
  const t = useTranslations('settings');
  const showToast = useToastStore((s) => s.showToast);

  const toggleMutation = useToggleFeatureFlag();
  const updateMutation = useUpdateFeatureFlag();

  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [rolloutDraft, setRolloutDraft] = useState<number | null>(null);
  const [statusDraft, setStatusDraft] = useState<FeatureFlagStatus | null>(null);

  useEffect(() => {
    if (enabledDraft !== null && row.is_enabled === enabledDraft) setEnabledDraft(null);
  }, [row.is_enabled, enabledDraft]);

  useEffect(() => {
    if (rolloutDraft !== null && row.rollout_pct === rolloutDraft) setRolloutDraft(null);
  }, [row.rollout_pct, rolloutDraft]);

  useEffect(() => {
    if (statusDraft !== null && (row.status || 'active') === statusDraft) setStatusDraft(null);
  }, [row.status, statusDraft]);

  const displayedEnabled = enabledDraft ?? row.is_enabled;
  const displayedRollout = rolloutDraft ?? row.rollout_pct;
  const displayedStatus = statusDraft ?? (row.status || 'active');

  const handleToggle = () => {
    const next = !displayedEnabled;
    // Synchronous local paint — never waits for the server roundtrip.
    setEnabledDraft(next);
    toggleMutation.mutate(
      { id: row.id, enabled: next },
      {
        onSuccess: () => {
          showToast(`${row.key}: ${next ? t('status_enabled_msg') : t('status_disabled_msg')}`, 'success');
        },
        onError: () => {
          setEnabledDraft(null);
          showToast(t('error_toggle'), 'error');
        },
      },
    );
  };

  const handleRolloutCommit = (pct: number) => {
    setRolloutDraft(pct);
    updateMutation.mutate(
      { id: row.id, input: { rollout_pct: pct } },
      {
        onError: () => {
          setRolloutDraft(null);
          showToast(t('error_rollout'), 'error');
        },
      },
    );
  };

  const handleStatusChange = (newStatus: FeatureFlagStatus) => {
    setStatusDraft(newStatus);
    updateMutation.mutate(
      { id: row.id, input: { status: newStatus } },
      {
        onSuccess: () => {
          showToast(t('settings_saved'), 'success');
        },
        onError: () => {
          setStatusDraft(null);
          showToast(t('error_save'), 'error');
        },
      },
    );
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    showToast(t('copy_success', { key }), 'success');
  };

  return {
    displayedEnabled,
    displayedRollout,
    displayedStatus,
    handleToggle,
    handleRolloutCommit,
    handleStatusChange,
    handleCopyKey,
    setRolloutDraft,
  };
}

// ── Shared status select (table cell + mobile card) ──
function FlagStatusSelect({
  value,
  onChange,
  t,
}: {
  value: FeatureFlagStatus;
  onChange: (v: FeatureFlagStatus) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value as FeatureFlagStatus)}
      sx={{
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 1.5,
        width: { xs: '100%', sm: 170 },
        '& .MuiSelect-select': {
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          paddingInlineStart: '12px !important',
          paddingInlineEnd: '32px !important',
        },
        '& .MuiSelect-icon': {
          insetInlineEnd: '8px',
          insetInlineStart: 'auto',
        },
      }}
    >
      <MenuItem value="active">{t('feature_flags.status_active')}</MenuItem>
      <MenuItem value="deprecated">{t('feature_flags.status_deprecated')}</MenuItem>
      <MenuItem value="archived">{t('feature_flags.status_archived')}</MenuItem>
    </Select>
  );
}

// ── Shared rollout slider + % chip (table cell + mobile card) ──
function FlagRolloutControl({
  displayedRollout,
  onDraft,
  onCommit,
}: {
  displayedRollout: number;
  onDraft: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <LtrIsland>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Slider
          value={displayedRollout}
          onChange={(_, v) => onDraft(v as number)}
          onChangeCommitted={(_, v) => onCommit(v as number)}
          min={0}
          max={100}
          size="small"
          sx={{
            width: { xs: '100%', sm: 110 },
            maxWidth: '100%',
            color: displayedRollout === 100 ? 'success.main' : 'primary.main',
            '& .MuiSlider-thumb': { width: 14, height: 14 },
          }}
        />
        <Chip
          label={`${displayedRollout}%`}
          size="small"
          sx={{
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            backgroundColor: displayedRollout === 100 ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.primary.main, 0.1),
            color: displayedRollout === 100 ? 'success.main' : 'primary.main',
          }}
        />
      </Box>
    </LtrIsland>
  );
}

// ── Shared period chip (table cell + mobile card) ──
function FlagPeriodContent({ row, isRtl }: { row: FeatureFlag; isRtl: boolean }) {
  const t = useTranslations('settings');
  if (!row.starts_at && !row.ends_at) {
    return (
      <Chip
        label={t('feature_flags.period_permanent')}
        size="small"
        variant="outlined"
        sx={{
          height: 22,
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'text.secondary',
          borderColor: 'divider',
          backgroundColor: 'action.hover',
        }}
      />
    );
  }
  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    const dateVal = new Date(d);
    if (!Number.isFinite(dateVal.getTime())) return '—';
    return dateVal.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <CalendarToday sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {formatDate(row.starts_at)} {row.ends_at ? `← ${formatDate(row.ends_at)}` : ''}
      </Typography>
    </Box>
  );
}

// ══════════════════════════════════════════════════
// FLAG ROW — memoized, with row-local optimistic state
// ══════════════════════════════════════════════════

/**
 * A single flag row. All interaction state lives in useFlagRowActions so
 * toggling a switch or dragging a slider re-renders only this row — not the
 * whole table.
 *
 * memo() also keeps unrelated page re-renders (expansion, fetch indicator,
 * toasts) from touching rows whose data didn't change: react-query structural
 * sharing preserves row object identity across refetches, and the callbacks
 * passed from the page are stable.
 */
const FeatureFlagRow = memo(function FeatureFlagRow({
  row,
  expanded,
  onToggleExpand,
  onDeleteClick,
}: FeatureFlagRowProps) {
  const theme = useTheme();
  const isRtl = theme.direction === 'rtl';
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  const {
    displayedEnabled,
    displayedRollout,
    displayedStatus,
    handleToggle,
    handleRolloutCommit,
    handleStatusChange,
    handleCopyKey,
    setRolloutDraft,
  } = useFlagRowActions(row);

  return (
    <React.Fragment>
      <TableRow hover sx={{ '& > *': { borderBottom: expanded ? 'none' : undefined } }}>
        <TableCell>
          <IconButton size="small" onClick={() => onToggleExpand(row.id)} aria-label={expanded ? tCommon('collapse') : tCommon('expand')}>
            {expanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            {/* Fixed layout + nowrap/ellipsis: the key never reflows the
                column; a truncated key reveals its full value on hover. */}
            <Typography title={row.key} sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.primary', backgroundColor: 'action.selected', px: 1, py: 0.25, borderRadius: 1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.key}
            </Typography>
            <Tooltip title={t('tooltip_copy')}>
              <IconButton size="small" onClick={() => handleCopyKey(row.key)} aria-label={t('tooltip_copy')}>
                <ContentCopy sx={{ fontSize: 14, color: 'text.disabled' }} />
              </IconButton>
            </Tooltip>
          </Box>
        </TableCell>
        <TableCell>
          <Box>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', fontWeight: 500 }}>
              {row.label || '—'}
            </Typography>
            {row.description && (
              <Tooltip title={row.description} placement="top" arrow>
                <Typography
                  dir="auto"
                  sx={{
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    mt: 0.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    unicodeBidi: 'plaintext',
                    textAlign: isRtl ? 'right' : 'left',
                    cursor: 'default',
                  }}
                >
                  {row.description}
                </Typography>
              </Tooltip>
            )}
          </Box>
        </TableCell>
        <TableCell>
          <FlagStatusSelect value={displayedStatus} onChange={handleStatusChange} t={t} />
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* LTR island: a plain `dir="ltr"` wrapper cannot stop the
                global stylis-rtl plugin from mirroring the switch's
                `translateX`/`left` (the mirror is CSS-text-level).
                LtrIsland swaps in a plugin-free emotion cache so MUI's
                LTR baseline ships verbatim and the thumb stays on the
                track. */}
            <LtrIsland>
              <Switch
                checked={displayedEnabled}
                onChange={handleToggle}
                color="success"
                size="small"
              />
            </LtrIsland>
          </Box>
        </TableCell>
        <TableCell>
          <FlagRolloutControl
            displayedRollout={displayedRollout}
            onDraft={setRolloutDraft}
            onCommit={handleRolloutCommit}
          />
        </TableCell>
        <TableCell>
          <FlagPeriodContent row={row} isRtl={isRtl} />
        </TableCell>
        <TableCell align={isRtl ? 'left' : 'right'}>
          <Tooltip title={t('btn_delete')}>
            <IconButton
              size="small"
              onClick={() => onDeleteClick(row)}
              aria-label={t('btn_delete')}
              sx={{ color: 'error.main', '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.1) } }}
            >
              <Delete sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <FlagOverridesPanel flagId={row.id} />
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
});

// ══════════════════════════════════════════════════
// FLAG CARD — mobile (<md) counterpart of the row
// ══════════════════════════════════════════════════

const FeatureFlagCard = memo(function FeatureFlagCard({
  row,
  expanded,
  onToggleExpand,
  onDeleteClick,
}: FeatureFlagRowProps) {
  const theme = useTheme();
  const isRtl = theme.direction === 'rtl';
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  const {
    displayedEnabled,
    displayedRollout,
    displayedStatus,
    handleToggle,
    handleRolloutCommit,
    handleStatusChange,
    handleCopyKey,
    setRolloutDraft,
  } = useFlagRowActions(row);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        backgroundColor: 'background.paper',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        minWidth: 0,
      }}
    >
      {/* Key + copy, expand + delete */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
        <Typography
          title={row.key}
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: 'text.primary',
            backgroundColor: 'action.selected',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            overflowWrap: 'anywhere',
            minWidth: 0,
          }}
        >
          {row.key}
        </Typography>
        <Tooltip title={t('tooltip_copy')}>
          <IconButton size="small" onClick={() => handleCopyKey(row.key)} aria-label={t('tooltip_copy')}>
            <ContentCopy sx={{ fontSize: 14, color: 'text.disabled' }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ marginInlineStart: 'auto', display: 'flex', gap: 0.5, flexShrink: 0 }}>
          <IconButton size="small" onClick={() => onToggleExpand(row.id)} aria-label={expanded ? tCommon('collapse') : tCommon('expand')}>
            {expanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
          </IconButton>
          <Tooltip title={t('btn_delete')}>
            <IconButton
              size="small"
              onClick={() => onDeleteClick(row)}
              aria-label={t('btn_delete')}
              sx={{ color: 'error.main', '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.1) } }}
            >
              <Delete sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Label + description */}
      {(row.label || row.description) && (
        <Box sx={{ minWidth: 0 }}>
          {row.label && (
            <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', fontWeight: 500 }}>
              {row.label}
            </Typography>
          )}
          {row.description && (
            <Typography
              dir="auto"
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
                mt: 0.25,
                whiteSpace: 'normal',
                unicodeBidi: 'plaintext',
                textAlign: isRtl ? 'right' : 'left',
              }}
            >
              {row.description}
            </Typography>
          )}
        </Box>
      )}

      {/* Status + enabled switch */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <FlagStatusSelect value={displayedStatus} onChange={handleStatusChange} t={t} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <LtrIsland>
            <Switch checked={displayedEnabled} onChange={handleToggle} color="success" size="small" />
          </LtrIsland>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
            {displayedEnabled ? t('enabled') : t('disabled')}
          </Typography>
        </Box>
      </Box>

      {/* Rollout */}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
          {t('feature_flags.table_rollout')}
        </Typography>
        <FlagRolloutControl
          displayedRollout={displayedRollout}
          onDraft={setRolloutDraft}
          onCommit={handleRolloutCommit}
        />
      </Box>

      {/* Period */}
      <Box sx={{ minWidth: 0 }}>
        <FlagPeriodContent row={row} isRtl={isRtl} />
      </Box>

      {/* Overrides */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ pt: 1 }}>
          <FlagOverridesPanel flagId={row.id} />
        </Box>
      </Collapse>
    </Box>
  );
});

// ══════════════════════════════════════════════════
// OVERRIDES PANEL
// ══════════════════════════════════════════════════

function FlagOverridesPanel({ flagId }: { flagId: string }) {
  const theme = useTheme();
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const showToast = useToastStore((s) => s.showToast);
  const { data: detail, isLoading } = useFeatureFlagDetail(flagId);
  const { data: roles } = useRoles();
  const addRoleMutation = useAddRoleOverride();
  const removeRoleMutation = useRemoveRoleOverride();
  const addUserMutation = useAddUserOverride();
  const removeUserMutation = useRemoveUserOverride();
  const upsertTenantMutation = useUpsertTenantOverride();
  const deleteTenantMutation = useDeleteTenantOverride();

  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);

  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedIsExclude, setSelectedIsExclude] = useState(false);
  const [userId, setUserId] = useState('');

  // Tenant override state
  const [tenantId, setTenantId] = useState('');
  const [tenantEnabled, setTenantEnabled] = useState<boolean>(true);
  const [tenantRollout, setTenantRollout] = useState<number>(100);

  if (isLoading) {
    return (
      <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ py: 2, px: { xs: 1, sm: 2 }, minWidth: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' }, gap: 3, mb: 3 }}>
          {/* Role Overrides */}
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              <Typography variant="h3">
                {t('feature_flags.overrides.title_roles')}
              </Typography>
              <Button
                size="small"
                startIcon={<GroupAdd sx={{ fontSize: 16 }} />}
                onClick={() => setAddRoleOpen(true)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  gap: 1,
                  '& .MuiButton-startIcon': {
                    marginInlineEnd: '8px !important',
                    marginInlineStart: '0 !important',
                    mr: '0 !important',
                    ml: '0 !important',
                  },
                }}
              >
                {t('feature_flags.overrides.btn_add_role')}
              </Button>
            </Box>

            {(detail?.role_overrides ?? []).length === 0 ? (
              <Box
                sx={{
                  py: 1.5,
                  px: 2,
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: 'divider',
                  backgroundColor: 'action.hover',
                }}
              >
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontWeight: 500 }}>
                  {t('feature_flags.overrides.no_role_overrides')}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(detail?.role_overrides ?? []).map((ro) => (
                  <Chip
                    key={ro.role_id}
                    label={`${ro.role_name || ro.role_key || ro.role_id} — ${ro.is_exclude ? t('disabled') : t('enabled')}`}
                    size="small"
                    onDelete={() => removeRoleMutation.mutate({ flagId, roleId: ro.role_id })}
                    sx={{
                      fontWeight: 600, fontSize: '0.75rem',
                      backgroundColor: ro.is_exclude ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.success.main, 0.1),
                      color: ro.is_exclude ? 'error.main' : 'success.main',
                      maxWidth: '100%',
                      '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* User Overrides */}
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              <Typography variant="h3">
                {t('feature_flags.overrides.title_users')}
              </Typography>
              <Button
                size="small"
                startIcon={<PersonAdd sx={{ fontSize: 16 }} />}
                onClick={() => setAddUserOpen(true)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  gap: 1,
                  '& .MuiButton-startIcon': {
                    marginInlineEnd: '8px !important',
                    marginInlineStart: '0 !important',
                    mr: '0 !important',
                    ml: '0 !important',
                  },
                }}
              >
                {t('feature_flags.overrides.btn_add_user')}
              </Button>
            </Box>

            {(detail?.user_overrides ?? []).length === 0 ? (
              <Box
                sx={{
                  py: 1.5,
                  px: 2,
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: 'divider',
                  backgroundColor: 'action.hover',
                }}
              >
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontWeight: 500 }}>
                  {t('feature_flags.overrides.no_user_overrides')}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(detail?.user_overrides ?? []).map((uo) => (
                  <Chip
                    key={uo.user_id}
                    label={`${uo.user_email || uo.user_name || uo.user_id} — ${uo.is_exclude ? t('disabled') : t('enabled')}`}
                    size="small"
                    onDelete={() => removeUserMutation.mutate({ flagId, userId: uo.user_id })}
                    sx={{
                      fontWeight: 600, fontSize: '0.75rem',
                      backgroundColor: uo.is_exclude ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.success.main, 0.1),
                      color: uo.is_exclude ? 'error.main' : 'success.main',
                      maxWidth: '100%',
                      '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* Tenant Overrides */}
          <Box sx={{ minWidth: 0, gridColumn: { md: '1 / -1', xl: 'auto' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              <Typography variant="h3">
                {t('feature_flags.overrides.title_tenants')}
              </Typography>
              <Button
                size="small"
                startIcon={<DomainAdd sx={{ fontSize: 16 }} />}
                onClick={() => setAddTenantOpen(true)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  gap: 1,
                  '& .MuiButton-startIcon': {
                    marginInlineEnd: '8px !important',
                    marginInlineStart: '0 !important',
                    mr: '0 !important',
                    ml: '0 !important',
                  },
                }}
              >
                {t('feature_flags.overrides.btn_add_tenant')}
              </Button>
            </Box>

            {(detail?.tenant_overrides ?? []).length === 0 ? (
              <Box
                sx={{
                  py: 1.5,
                  px: 2,
                  borderRadius: 2,
                  border: '1px dashed',
                  borderColor: 'divider',
                  backgroundColor: 'action.hover',
                }}
              >
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontWeight: 500 }}>
                  {t('feature_flags.overrides.no_tenant_overrides')}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(detail?.tenant_overrides ?? []).map((to) => (
                  <Chip
                    key={to.tenant_id}
                    label={`${to.tenant_name || to.tenant_id.slice(0, 8) + '...'} — ${to.is_enabled === false ? t('disabled') : t('enabled')} (${to.rollout_pct ?? 100}%)`}
                    size="small"
                    onDelete={() => deleteTenantMutation.mutate({ flagId, tenantId: to.tenant_id })}
                    sx={{
                      fontWeight: 600, fontSize: '0.75rem',
                      backgroundColor: to.is_enabled === false ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.info.main, 0.1),
                      color: to.is_enabled === false ? 'error.main' : 'info.main',
                      maxWidth: '100%',
                      '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Add Role Dialog */}
      <Dialog
        open={addRoleOpen}
        onClose={() => setAddRoleOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{t('feature_flags.overrides.dialog_role_title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Autocomplete
              options={roles ?? []}
              getOptionLabel={(o) => o.name || o.key}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  {option.name || option.key}
                </li>
              )}
              onChange={(_, val) => setSelectedRoleId(val?.id ?? '')}
              renderInput={(params) => {
                const { InputLabelProps, InputProps, size: _size, ...rest } = params;
                return (
                  <TextField
                    {...rest}
                    label={t('feature_flags.overrides.label_role')}
                    InputLabelProps={InputLabelProps as { shrink?: boolean; className?: string }}
                    InputProps={InputProps}
                  />
                );
              }}
            />
            <FormControl size="small">
              <InputLabel>{t('feature_flags.label_type')}</InputLabel>
              <Select
                value={selectedIsExclude ? 'exclude' : 'include'}
                onChange={(e) => setSelectedIsExclude(e.target.value === 'exclude')}
                label={t('feature_flags.label_type')}
                sx={{
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    paddingInlineStart: '12px !important',
                    paddingInlineEnd: '32px !important',
                  },
                  '& .MuiSelect-icon': {
                    insetInlineEnd: '8px',
                    insetInlineStart: 'auto',
                  },
                }}
              >
                <MenuItem value="include">{t('feature_flags.btn_include')}</MenuItem>
                <MenuItem value="exclude">{t('feature_flags.btn_exclude')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button onClick={() => setAddRoleOpen(false)} sx={{ textTransform: 'none' }}>{t('btn_cancel')}</Button>
          <Button
            variant="contained"
            disabled={!selectedRoleId || addRoleMutation.isPending}
            onClick={async () => {
              try {
                await addRoleMutation.mutateAsync({
                  flagId, roleId: selectedRoleId, isExclude: selectedIsExclude,
                });
                setAddRoleOpen(false);
                setSelectedRoleId('');
              } catch (err) {
                showToast(err instanceof Error ? err.message : tCommon('failed_to_save'), 'error');
              }
            }}
            sx={{
              textTransform: 'none', fontWeight: 600, borderRadius: 2,
              backgroundColor: 'primary.main', '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            {t('feature_flags.btn_add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>{t('feature_flags.overrides.title_add_user')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              size="small"
              label={t('feature_flags.overrides.label_user_id')}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
            />
            <FormControl size="small">
              <InputLabel>{t('feature_flags.label_type')}</InputLabel>
              <Select
                value={selectedIsExclude ? 'exclude' : 'include'}
                onChange={(e) => setSelectedIsExclude(e.target.value === 'exclude')}
                label={t('feature_flags.label_type')}
                sx={{
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    paddingInlineStart: '12px !important',
                    paddingInlineEnd: '32px !important',
                  },
                  '& .MuiSelect-icon': {
                    insetInlineEnd: '8px',
                    insetInlineStart: 'auto',
                  },
                }}
              >
                <MenuItem value="include">{t('feature_flags.type_include')}</MenuItem>
                <MenuItem value="exclude">{t('feature_flags.type_exclude')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button onClick={() => setAddUserOpen(false)}>{tCommon('cancel')}</Button>
          <Button
            variant="contained"
            disabled={!userId || addUserMutation.isPending}
            onClick={async () => {
              try {
                await addUserMutation.mutateAsync({
                  flagId,
                  userId,
                  isExclude: selectedIsExclude,
                });
                setAddUserOpen(false);
                setUserId('');
              } catch (err) {
                showToast(err instanceof Error ? err.message : tCommon('failed_to_save'), 'error');
              }
            }}
          >
            {tCommon('add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Tenant Dialog */}
      <Dialog
        open={addTenantOpen}
        onClose={() => setAddTenantOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{t('feature_flags.overrides.btn_add_tenant')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              size="small"
              label={t('feature_flags.overrides.label_tenant_id')}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. 11111111-0000-0000-0000-000000000001"
            />
            <FormControl size="small">
              <InputLabel>{t('feature_flags.table_enabled')}</InputLabel>
              <Select
                value={tenantEnabled ? 'enabled' : 'disabled'}
                onChange={(e) => setTenantEnabled(e.target.value === 'enabled')}
                label={t('feature_flags.table_enabled')}
                sx={{
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    paddingInlineStart: '12px !important',
                    paddingInlineEnd: '32px !important',
                  },
                  '& .MuiSelect-icon': {
                    insetInlineEnd: '8px',
                    insetInlineStart: 'auto',
                  },
                }}
              >
                <MenuItem value="enabled">{t('feature_flags.enabled')}</MenuItem>
                <MenuItem value="disabled">{t('feature_flags.disabled')}</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5, textAlign: 'start' }}>
                {t('feature_flags.table_rollout')}: {tenantRollout}%
              </Typography>
              <LtrIsland>
                <Slider
                  value={tenantRollout}
                  onChange={(_, v) => setTenantRollout(v as number)}
                  min={0}
                  max={100}
                  size="small"
                />
              </LtrIsland>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>
          <Button onClick={() => setAddTenantOpen(false)}>{tCommon('cancel')}</Button>
          <Button
            variant="contained"
            disabled={!tenantId || upsertTenantMutation.isPending}
            onClick={async () => {
              try {
                await upsertTenantMutation.mutateAsync({
                  flagId,
                  tenantId,
                  isEnabled: tenantEnabled,
                  rolloutPct: tenantRollout,
                });
                setAddTenantOpen(false);
                setTenantId('');
              } catch (err) {
                showToast(err instanceof Error ? err.message : tCommon('failed_to_save'), 'error');
              }
            }}
          >
            {tCommon('add')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ══════════════════════════════════════════════════
// CREATE FLAG DIALOG
// ══════════════════════════════════════════════════

interface CreateFlagDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateFlagDialog({ open, onClose, onSuccess }: CreateFlagDialogProps) {
  const t = useTranslations('settings');
  const tVal = useTranslations('validation');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<FeatureFlagStatus>('active');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateFeatureFlag();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.match(/^[a-z][a-z0-9_]*$/)) {
      setError(tVal('key_format'));
      return;
    }
    if (key.length < 3) {
      setError(tVal('key_min', { min: 3 }));
      return;
    }
    try {
      const input: CreateFeatureFlagInput = {
        key,
        is_enabled: false,
        rollout_pct: 100, // 100% (converted to 10000 basis points in prepareFeatureFlagPayload)
        status,
        ...(label ? { label } : {}),
        ...(description ? { description } : {}),
        ...(startsAt ? { starts_at: new Date(startsAt).toISOString() } : {}),
        ...(endsAt ? { ends_at: new Date(endsAt).toISOString() } : {}),
      };

      await createMutation.mutateAsync(input);
      setKey('');
      setLabel('');
      setDescription('');
      setStatus('active');
      setStartsAt('');
      setEndsAt('');
      setError('');
      onSuccess();
    } catch (err: unknown) {
      // M10: conflicts arrive as ConflictError (AppError, code DUPLICATE).
      const isConflict =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: unknown }).code === 'DUPLICATE';
      setError(isConflict ? tVal('key_exists') : toClientMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Flag color="primary" />
        {t('feature_flags.dialog_create.title')}
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label={t('feature_flags.dialog_create.label_key')}
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            required
            placeholder={t('feature_flags.dialog_create.placeholder_key')}
            helperText={tVal('key_format')}
            dir="ltr"
            sx={{ '& input': { fontFamily: 'monospace' } }}
          />
          <TextField
            label={t('feature_flags.table_label')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('feature_flags.table_label')}
          />
          <FormControl size="small">
            <InputLabel>{t('feature_flags.label_status')}</InputLabel>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as FeatureFlagStatus)}
              label={t('feature_flags.label_status')}
              sx={{
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  paddingInlineStart: '12px !important',
                  paddingInlineEnd: '32px !important',
                },
                '& .MuiSelect-icon': {
                  insetInlineEnd: '8px',
                  insetInlineStart: 'auto',
                },
              }}
            >
              <MenuItem value="active">{t('feature_flags.status_active')}</MenuItem>
              <MenuItem value="deprecated">{t('feature_flags.status_deprecated')}</MenuItem>
              <MenuItem value="archived">{t('feature_flags.status_archived')}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label={t('feature_flags.dialog_create.label_desc')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            placeholder={t('feature_flags.dialog_create.placeholder_desc')}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label={t('feature_flags.dialog_create.label_starts_at')}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={t('feature_flags.dialog_create.label_ends_at')}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>{t('btn_cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!key || createMutation.isPending}
          startIcon={createMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Add />}
          sx={{
            textTransform: 'none', fontWeight: 600, borderRadius: 2,
            backgroundColor: 'primary.main',
            '&:hover': { backgroundColor: 'primary.dark' },
          }}
        >
          {t('feature_flags.dialog_create.btn_create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
