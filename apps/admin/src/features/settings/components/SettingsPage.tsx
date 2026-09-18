'use client';

import {
  Edit,
  Save,
  Close,
  Lock,
  Build,
  Refresh,
  ContentCopy,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  Alert,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  IconButton,
  Switch,
  TextField,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import { PermissionGate } from '../../layout/components/PermissionGate';
import { useLayout } from '../../layout/hooks/useLayout';

import { AccessRulesManager } from './AccessRulesManager';
import { AppLockControl } from './AppLockControl';
import { MaintenanceWizard } from './MaintenanceWizard';

import { useSetSetting } from '@/adapters/mutations/settings.mutations';
import { useSettingsByCategory } from '@/adapters/queries/settings.queries';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { useToastStore } from '@/adapters/stores/toast.store';
import { LtrIsland } from '@/components/ui/LtrIsland';
import { parseRpcError } from '@/domain/errors';
import type { SettingKv } from '@/domain/types/settings.types';

const getCategoryTabs = (t: (key: string) => string) => [
  { key: 'security', label: t('tabs.security'), icon: <Lock sx={{ fontSize: 18 }} /> },
  { key: 'maintenance', label: t('tabs.maintenance'), icon: <Build sx={{ fontSize: 18 }} /> },
  { key: 'limits', label: t('tabs.limits'), icon: <Refresh sx={{ fontSize: 18 }} /> },
  { key: 'general', label: t('tabs.general'), icon: <Edit sx={{ fontSize: 18 }} /> },
];

const VALUE_TYPE_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'error'> = {
  string: 'primary',
  integer: 'success',
  boolean: 'warning',
  json: 'error',
};

// ── Shared chips (used by both the desktop table and the mobile cards) ──
function ValueTypeChip({ type }: { type: string }) {
  const theme = useTheme();
  const paletteKey = VALUE_TYPE_COLORS[type] || 'primary';
  const main = theme.palette[paletteKey]?.main || theme.palette.primary.main;
  return (
    <Chip
      label={type}
      size="small"
      sx={{
        height: 22,
        fontSize: '0.7rem',
        fontWeight: 700,
        fontFamily: 'monospace',
        backgroundColor: alpha(main, 0.1),
        color: main,
        border: `1px solid ${alpha(main, 0.2)}`,
      }}
    />
  );
}

function VisibilityChip({
  isPublic,
  publicLabel,
  privateLabel,
}: {
  isPublic: boolean;
  publicLabel: string;
  privateLabel: string;
}) {
  const theme = useTheme();
  return (
    <Chip
      label={isPublic ? publicLabel : privateLabel}
      size="small"
      sx={{
        height: 20,
        fontSize: '0.65rem',
        fontWeight: 600,
        backgroundColor: isPublic ? alpha(theme.palette.success.main, 0.15) : alpha(theme.palette.error.main, 0.15),
        color: isPublic ? 'success.main' : 'error.main',
      }}
    />
  );
}

// ── Mobile (<md) card for one setting — mirrors the desktop table row ──
interface SettingCardProps {
  row: SettingKv;
  valueNode: React.ReactNode;
  isEditing: boolean;
  isPending: boolean;
  canEdit: boolean;
  labels: {
    edit: string;
    save: string;
    cancel: string;
    copy: string;
    public: string;
    private: string;
  };
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onCopy: (key: string) => void;
}

function SettingCard({
  row,
  valueNode,
  isEditing,
  isPending,
  canEdit,
  labels,
  onEdit,
  onSave,
  onCancel,
  onCopy,
}: SettingCardProps) {
  const theme = useTheme();
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
        gap: 1.25,
        minWidth: 0,
      }}
    >
      {/* Key + copy, type + visibility pushed to the far end */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
        <Typography
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
        <Tooltip title={labels.copy}>
          <IconButton size="small" onClick={() => onCopy(row.key)} aria-label={labels.copy}>
            <ContentCopy sx={{ fontSize: 14, color: 'text.disabled' }} />
          </IconButton>
        </Tooltip>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
            marginInlineStart: 'auto',
          }}
        >
          <ValueTypeChip type={row.value_type} />
          <VisibilityChip
            isPublic={row.is_public}
            publicLabel={labels.public}
            privateLabel={labels.private}
          />
        </Box>
      </Box>

      {/* Label + description */}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', fontWeight: 500 }}>
          {row.label || '—'}
        </Typography>
        {row.description && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
            {row.description}
          </Typography>
        )}
      </Box>

      {/* Value display or full-width edit input */}
      <Box sx={{ minWidth: 0 }}>{valueNode}</Box>

      {/* Version + actions */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
          v{row.version}
        </Typography>
        {isEditing ? (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              onClick={onSave}
              disabled={isPending}
              startIcon={<Save sx={{ fontSize: 16 }} />}
              aria-label={labels.save}
              sx={{
                color: 'success.main',
                backgroundColor: alpha(theme.palette.success.main, 0.1),
                '&:hover': { backgroundColor: alpha(theme.palette.success.main, 0.2) },
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                boxShadow: 'none',
              }}
            >
              {labels.save}
            </Button>
            <Button
              size="small"
              onClick={onCancel}
              startIcon={<Close sx={{ fontSize: 16 }} />}
              aria-label={labels.cancel}
              sx={{
                color: 'error.main',
                backgroundColor: alpha(theme.palette.error.main, 0.1),
                '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.2) },
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                boxShadow: 'none',
              }}
            >
              {labels.cancel}
            </Button>
          </Box>
        ) : (
          <Button
            size="small"
            onClick={onEdit}
            disabled={!canEdit}
            startIcon={<Edit sx={{ fontSize: 16 }} />}
            aria-label={labels.edit}
            sx={{
              color: 'primary.main',
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
              '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.15) },
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: 'none',
            }}
          >
            {labels.edit}
          </Button>
        )}
      </Box>
    </Box>
  );
}

export function SettingsPage() {
  const theme = useTheme();
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { isDesktop } = useLayout();
  const CATEGORY_TABS = getCategoryTabs(t);
  const [activeTab, setActiveTab] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { showToast } = useToastStore();
  const user = useAuthUser();
  const canWriteSettings = user?.primary_role === 'super_admin' ||
    user?.permissions.includes('settings.write');
  const canManageAppLock = user?.primary_role === 'super_admin';

  const { data: grouped, isLoading, isFetching } = useSettingsByCategory();
  const setSettingMutation = useSetSetting();

  const currentCategory = CATEGORY_TABS[activeTab]?.key ?? 'general';
  const settings = grouped?.[currentCategory as keyof typeof grouped] ?? [];

  const handleEdit = useCallback((setting: SettingKv) => {
    if (!canWriteSettings) return;
    setEditingKey(setting.key);
    setEditValue(setting.value);
  }, [canWriteSettings]);

  const handleCancel = useCallback(() => {
    setEditingKey(null);
    setEditValue('');
  }, []);

  const handleSave = useCallback(async (setting: SettingKv) => {
    try {
      await setSettingMutation.mutateAsync({
        key: setting.key,
        value: editValue,
        valueType: setting.value_type,
      });
      setEditingKey(null);
      setEditValue('');
      showToast(t('status_save_success'), 'success');
    } catch (err: unknown) {
      showToast(parseRpcError(err).message, 'error');
    }
  }, [editValue, setSettingMutation, showToast, t]);

  const handleCopyKey = useCallback((key: string) => {
    navigator.clipboard.writeText(key);
    showToast(t('copy_success', { key }), 'success');
  }, [showToast, t]);

  const renderValueInput = (setting: SettingKv) => {
    if (editingKey !== setting.key) {
      return (
        <Typography
          sx={{
            fontFamily: setting.value_type === 'json' ? 'monospace' : 'inherit',
            fontSize: '0.875rem',
            color: 'text.secondary',
            maxWidth: { xs: '100%', sm: 300 },
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {setting.value_type === 'boolean'
            ? (setting.value === 'true' ? `✅ ${t('enabled')}` : `❌ ${t('disabled')}`)
            : setting.value}
        </Typography>
      );
    }

    if (setting.value_type === 'boolean') {
      return (
        <LtrIsland>
          <Switch
            checked={editValue === 'true'}
            onChange={(e) => setEditValue(e.target.checked ? 'true' : 'false')}
            color="primary"
          />
        </LtrIsland>
      );
    }

    if (setting.value_type === 'integer') {
      return (
        <TextField
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          size="small"
          sx={{ width: { xs: '100%', sm: 150 } }}
          autoFocus
        />
      );
    }

    if (setting.value_type === 'json') {
      return (
        <TextField
          multiline
          minRows={2}
          maxRows={6}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          size="small"
          sx={{ width: { xs: '100%', sm: 300 }, maxWidth: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
          autoFocus
          error={(() => { try { JSON.parse(editValue); return false; } catch { return true; } })()}
          helperText={(() => { try { JSON.parse(editValue); return ''; } catch { return t('error_invalid_json'); } })()}
        />
      );
    }

    return (
      <TextField
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        size="small"
        sx={{ width: { xs: '100%', sm: 250 } }}
        autoFocus
      />
    );
  };

  const cardLabels = {
    edit: t('tooltip_edit'),
    save: t('tooltip_save'),
    cancel: t('tooltip_cancel'),
    copy: t('tooltip_copy'),
    public: t('public'),
    private: t('private'),
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PermissionGate roles={['admin', 'super_admin']} fallback={
      <Alert severity="error" sx={{ borderRadius: 3 }}>
        {t('no_permission_error')}
      </Alert>
    }>
      <Box>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-title">{t('page_title')}</h1>
            <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
              {Object.values(grouped ?? {}).flat().length.toLocaleString()} {tCommon('total')}
            </div>
            {isFetching && !isLoading && (
              <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {tCommon('updating')}
              </div>
            )}
          </div>
        </div>

        {/* App Lock Control */}
        {grouped ? <AppLockControl settings={grouped} canEdit={canManageAppLock} /> : <AppLockControl canEdit={canManageAppLock} />}

        {/* Category Tabs — scrollable on phones (touch swipe), stretched on desktop */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
            mb: 3,
            backgroundColor: 'background.paper',
            backgroundImage: 'none',
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant={isDesktop ? 'fullWidth' : 'scrollable'}
            scrollButtons={false}
            allowScrollButtonsMobile
            sx={{
              backgroundColor: 'action.hover',
              borderBottom: '1px solid',
              borderColor: 'divider',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.85rem', md: '0.9rem' },
                minHeight: { xs: 48, md: 56 },
                gap: { xs: 0.5, md: 1 },
                px: { xs: 1.5, md: 2 },
              },
              '& .Mui-selected': { color: 'primary.main' },
              '& .MuiTabs-indicator': { backgroundColor: 'primary.main', height: 2 },
            }}
          >
            {CATEGORY_TABS.map((tab) => (
              <Tab key={tab.key} label={tab.label} icon={tab.icon} iconPosition="start" />
            ))}
          </Tabs>

          {/* DESKTOP (≥md): full settings table */}
          <Box className="hidden md:block">
            <TableContainer>
              <Table sx={{ minWidth: 1000 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_key')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_label')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_value')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_type')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_public')}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_version')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', color: 'text.secondary', py: 2 }}>{t('table_actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isFetching && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <LinearProgress sx={{ height: 2 }} />
                      </TableCell>
                    </TableRow>
                  )}
                  {settings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t('no_settings')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    settings.map((row) => (
                      <TableRow key={row.key} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography
                              sx={{
                                fontFamily: 'monospace',
                                 fontSize: '0.8rem',
                                color: 'text.primary',
                                backgroundColor: 'action.selected',
                                px: 1,
                                py: 0.25,
                                borderRadius: 1,
                              }}
                            >
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
                              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                                {row.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {renderValueInput(row)}
                        </TableCell>
                        <TableCell>
                          <ValueTypeChip type={row.value_type} />
                        </TableCell>
                        <TableCell>
                          <VisibilityChip
                            isPublic={row.is_public}
                            publicLabel={t('public')}
                            privateLabel={t('private')}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                            v{row.version}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {editingKey === row.key ? (
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title={t('tooltip_save')}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleSave(row)}
                                  disabled={setSettingMutation.isPending}
                                  aria-label={t('tooltip_save')}
                                  sx={{
                                    color: 'success.main',
                                    backgroundColor: alpha(theme.palette.success.main, 0.1),
                                    '&:hover': { backgroundColor: alpha(theme.palette.success.main, 0.2) },
                                  }}
                                >
                                  <Save sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={t('tooltip_cancel')}>
                                <IconButton
                                  size="small"
                                  onClick={handleCancel}
                                  aria-label={t('tooltip_cancel')}
                                  sx={{
                                    color: 'error.main',
                                    backgroundColor: alpha(theme.palette.error.main, 0.1),
                                    '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.2) },
                                  }}
                                >
                                  <Close sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            <Tooltip title={t('tooltip_edit')}>
                              <IconButton
                                size="small"
                                onClick={() => handleEdit(row)}
                                disabled={!canWriteSettings}
                                aria-label={t('tooltip_edit')}
                                sx={{
                                  color: 'primary.main',
                                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
                                }}
                              >
                                <Edit sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          )
                          }
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* MOBILE (<md): stacked setting cards — the 1000px table is not
              usable on phones, each setting becomes a self-contained card */}
          <Box
            className="md:hidden"
            sx={{
              p: { xs: 1.5, sm: 2 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              minHeight: 200,
            }}
          >
            {isFetching && !isLoading && <LinearProgress sx={{ height: 2, mb: 1 }} />}
            {settings.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', py: 6 }}
              >
                {t('no_settings')}
              </Typography>
            ) : (
              settings.map((row) => (
                <SettingCard
                  key={row.key}
                  row={row}
                  valueNode={renderValueInput(row)}
                  isEditing={editingKey === row.key}
                  isPending={setSettingMutation.isPending}
                  canEdit={Boolean(canWriteSettings)}
                  labels={cardLabels}
                  onEdit={() => handleEdit(row)}
                  onSave={() => handleSave(row)}
                  onCancel={handleCancel}
                  onCopy={handleCopyKey}
                />
              ))
            )}
          </Box>
        </Paper>

        {/* Maintenance Wizard — only on Maintenance tab */}
        {currentCategory === 'maintenance' && (
          grouped ? <MaintenanceWizard settings={grouped} canEdit={Boolean(canWriteSettings)} /> : <MaintenanceWizard canEdit={Boolean(canWriteSettings)} />
        )}

        {/* Access Rules Manager — only on Security tab */}
        {currentCategory === 'security' && (
          <AccessRulesManager />
        )}
      </Box>
    </PermissionGate>
  );
}
