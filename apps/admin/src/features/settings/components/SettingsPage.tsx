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

import { AccessRulesManager } from './AccessRulesManager';
import { AppLockControl } from './AppLockControl';
import { MaintenanceWizard } from './MaintenanceWizard';

import { useSetSetting } from '@/adapters/mutations/settings.mutations';
import { useSettingsByCategory } from '@/adapters/queries/settings.queries';
import { useToastStore } from '@/adapters/stores/toast.store';
import { parseRpcError } from '@/domain/errors';
import type { SettingKv } from '@/domain/types/settings.types';


const getCategoryTabs = (t: ReturnType<typeof useTranslations>) => [
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

export function SettingsPage() {
  const theme = useTheme();
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const CATEGORY_TABS = getCategoryTabs(t);
  const [activeTab, setActiveTab] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { showToast } = useToastStore();

  const { data: grouped, isLoading, isFetching } = useSettingsByCategory();
  const setSettingMutation = useSetSetting();

  const currentCategory = CATEGORY_TABS[activeTab]?.key ?? 'general';
  const settings = grouped?.[currentCategory as keyof typeof grouped] ?? [];

  const handleEdit = useCallback((setting: SettingKv) => {
    setEditingKey(setting.key);
    setEditValue(setting.value);
  }, []);

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
            maxWidth: 300,
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
        <Switch
          checked={editValue === 'true'}
          onChange={(e) => setEditValue(e.target.checked ? 'true' : 'false')}
          color="primary"
        />
      );
    }

    if (setting.value_type === 'integer') {
      return (
        <TextField
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          size="small"
          sx={{ width: 150 }}
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
          sx={{ width: 300, fontFamily: 'monospace', fontSize: '0.8rem' }}
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
        sx={{ width: 250 }}
        autoFocus
      />
    );
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
        {grouped ? <AppLockControl settings={grouped} /> : <AppLockControl />}

        {/* Category Tabs */}
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
            variant="fullWidth"
            sx={{
              backgroundColor: 'action.hover',
              borderBottom: '1px solid',
              borderColor: 'divider',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                minHeight: 56,
                gap: 1,
              },
              '& .Mui-selected': { color: 'primary.main' },
              '& .MuiTabs-indicator': { backgroundColor: 'primary.main', height: 2 },
            }}
          >
            {CATEGORY_TABS.map((tab) => (
              <Tab key={tab.key} label={tab.label} icon={tab.icon} iconPosition="start" />
            ))}
          </Tabs>

          {/* Settings Table */}
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
                            <IconButton size="small" onClick={() => handleCopyKey(row.key)}>
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
                          <Chip
                            label={row.value_type}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              backgroundColor: alpha(theme.palette[VALUE_TYPE_COLORS[row.value_type] || 'primary']?.main || theme.palette.primary.main, 0.1),
                              color: theme.palette[VALUE_TYPE_COLORS[row.value_type] || 'primary']?.main || 'primary.main',
                              border: `1px solid ${alpha(theme.palette[VALUE_TYPE_COLORS[row.value_type] || 'primary']?.main || theme.palette.primary.main, 0.2)}`,
                            }}
                          />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.is_public ? t('public') : t('private')}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                             backgroundColor: row.is_public ? alpha(theme.palette.success.main, 0.15) : alpha(theme.palette.error.main, 0.15),
                             color: row.is_public ? 'success.main' : 'error.main',
                           }}
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
        </Paper>

        {/* Maintenance Wizard — only on Maintenance tab */}
        {currentCategory === 'maintenance' && (
          grouped ? <MaintenanceWizard settings={grouped} /> : <MaintenanceWizard />
        )}

        {/* Access Rules Manager — only on Security tab */}
        {currentCategory === 'security' && (
          <AccessRulesManager />
        )}
      </Box>
    </PermissionGate>
  );
}
