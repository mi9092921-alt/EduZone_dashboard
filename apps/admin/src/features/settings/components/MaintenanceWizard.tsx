'use client';

import { Build, NavigateNext, NavigateBefore, Check, Warning } from '@mui/icons-material';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  Autocomplete,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useEnableMaintenanceMode,
  useDisableMaintenanceMode,
} from '@/adapters/mutations/settings.mutations';
import { useRoles } from '@/adapters/queries/settings.queries';
import { parseRpcError } from '@/domain/errors';
import type { MaintenanceModeParams, SettingsByCategory } from '@/domain/types/settings.types';

const getSteps = (t: ReturnType<typeof useTranslations>) => [
  t('steps.status'),
  t('steps.message'),
  t('steps.deadline'),
  t('steps.roles'),
  t('steps.users'),
];

interface MaintenanceWizardProps {
  settings?: SettingsByCategory;
}

export function MaintenanceWizard({ settings }: MaintenanceWizardProps) {
  const t = useTranslations('settings.maintenance_wizard');
  const tVal = useTranslations('validation');
  const STEPS = getSteps(t);

  const maintenanceSettings = settings?.maintenance ?? [];
  const isCurrentlyEnabled =
    maintenanceSettings.find((s) => s.key === 'maintenance_mode')?.value === 'true';
  const currentMessage =
    maintenanceSettings.find((s) => s.key === 'maintenance_message')?.value ?? '';
  const currentEndsAt =
    maintenanceSettings.find((s) => s.key === 'maintenance_ends_at')?.value ?? '';

  const [activeStep, setActiveStep] = useState(0);
  const [enabled, setEnabled] = useState(isCurrentlyEnabled);
  const [message, setMessage] = useState(currentMessage);
  const [messageEn, setMessageEn] = useState('');
  const [endsAt, setEndsAt] = useState(currentEndsAt ? currentEndsAt.slice(0, 16) : '');
  const [excludeRoles, setExcludeRoles] = useState<string[]>([]);
  const [excludeUsers, setExcludeUsers] = useState<string[]>([]);
  const [error, setError] = useState('');

  const { data: roles } = useRoles();
  const enableMutation = useEnableMaintenanceMode();
  const disableMutation = useDisableMaintenanceMode();

  const handleNext = () => {
    if (activeStep === 1 && !message.trim()) {
      setError(tVal('message_min', { min: 1 }));
      return;
    }
    if (activeStep === 2 && endsAt && new Date(endsAt) <= new Date()) {
      setError(tVal('future_date'));
      return;
    }
    setError('');
    setActiveStep((s) => s + 1);
  };

  const handleBack = () => {
    setError('');
    setActiveStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    try {
      if (enabled) {
        const payload: MaintenanceModeParams = {
          message,
          ends_at: endsAt
            ? new Date(endsAt).toISOString()
            : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
        if (messageEn) payload.message_en = messageEn;
        if (excludeRoles.length) payload.exclude_roles = excludeRoles;
        if (excludeUsers.length) payload.exclude_users = excludeUsers;

        await enableMutation.mutateAsync(payload);
      } else {
        await disableMutation.mutateAsync();
      }
      setActiveStep(0);
    } catch (err: unknown) {
      setError(parseRpcError(err).message);
    }
  };

  const handleDisable = async () => {
    try {
      await disableMutation.mutateAsync();
    } catch (err: unknown) {
      setError(parseRpcError(err).message);
    }
  };

  const isPending = enableMutation.isPending || disableMutation.isPending;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid #E2E8F0',
        p: 3,
        mb: 3,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: isCurrentlyEnabled
              ? 'linear-gradient(135deg, #DC2626, #EF4444)'
              : 'linear-gradient(135deg, #6366F1, #818CF8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Build sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0F172A' }}>
            معالج وضع الصيانة
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B' }}>
            {isCurrentlyEnabled ? 'وضع الصيانة مفعل حالياً' : 'وضع الصيانة معطل'}
          </Typography>
        </Box>
        {isCurrentlyEnabled && (
          <Chip
            label="مفعل"
            size="small"
            sx={{
              ml: 'auto',
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              fontWeight: 700,
            }}
          />
        )}
      </Box>

      {isCurrentlyEnabled && (
        <Alert
          severity="warning"
          icon={<Warning />}
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button size="small" color="inherit" onClick={handleDisable} disabled={isPending}>
              تعطيل الآن
            </Button>
          }
        >
          وضع الصيانة مفعل حالياً. المستخدمون لن يتمكنوا من الوصول إلى التطبيق.
        </Alert>
      )}

      {/* Stepper */}
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel
              sx={{
                '& .MuiStepLabel-label': { fontSize: '0.8rem', fontWeight: 600 },
                '& .MuiStepIcon-root.Mui-active': { color: '#6366F1' },
                '& .MuiStepIcon-root.Mui-completed': { color: '#16A34A' },
              }}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Step Content */}
      <Box sx={{ minHeight: 120, mb: 3 }}>
        {/* Step 0: Enable/Disable */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  color="warning"
                  sx={{ transform: 'scale(1.3)' }}
                />
              }
              label={
                <Typography sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                  {enabled ? t('label_enable') : t('label_disabled')}
                </Typography>
              }
            />
          </Box>
        )}

        {/* Step 1: Messages */}
        {activeStep === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t('label_message_ar')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
              dir="rtl"
            />
            <TextField
              label={t('label_message_en')}
              value={messageEn}
              onChange={(e) => setMessageEn(e.target.value)}
              multiline
              rows={2}
              fullWidth
              dir="ltr"
            />
          </Box>
        )}

        {/* Step 2: End Date */}
        {activeStep === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <TextField
              type="datetime-local"
              label={t('label_deadline')}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 300 }}
            />
            <Typography variant="body2" sx={{ color: '#64748B' }}>
              {t('deadline_desc')}
            </Typography>
          </Box>
        )}

        {/* Step 3: Exclude Roles */}
        {activeStep === 3 && (
          <Box>
            <Autocomplete
              multiple
              options={Array.from(new Set(roles?.map((r) => r.key) ?? []))}
              value={excludeRoles}
              onChange={(_, v) => setExcludeRoles(v)}
              renderInput={(params) => {
                const { InputLabelProps, size, ...restParams } = params;
                return (
                  <TextField
                    {...restParams}
                    size={
                      (size ?? 'medium') as NonNullable<
                        React.ComponentProps<typeof TextField>['size']
                      >
                    }
                    InputLabelProps={
                      (InputLabelProps ?? {}) as NonNullable<
                        React.ComponentProps<typeof TextField>['InputLabelProps']
                      >
                    }
                    label={t('label_roles')}
                  />
                );
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...chipProps } = getTagProps({ index });
                  return (
                    <Chip
                      key={key}
                      label={option}
                      size="small"
                      {...chipProps}
                      sx={{ fontWeight: 600 }}
                    />
                  );
                })
              }
            />
            <Typography variant="body2" sx={{ color: '#64748B', mt: 1 }}>
              {t('roles_desc')}
            </Typography>
          </Box>
        )}

        {/* Step 4: Exclude Users */}
        {activeStep === 4 && (
          <Box>
            <TextField
              label={t('label_add_user')}
              placeholder="user@example.com"
              fullWidth
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !excludeUsers.includes(val)) {
                    setExcludeUsers((prev) => [...prev, val]);
                    input.value = '';
                  }
                }
              }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
              {excludeUsers.map((u) => (
                <Chip
                  key={u}
                  label={u}
                  size="small"
                  onDelete={() => setExcludeUsers((prev) => prev.filter((x) => x !== u))}
                  sx={{ fontWeight: 600 }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
          startIcon={<NavigateBefore />}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {t('btn_prev')}
        </Button>
        {activeStep < STEPS.length - 1 ? (
          <Button
            variant="contained"
            onClick={handleNext}
            endIcon={<NavigateNext />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              backgroundColor: '#6366F1',
              '&:hover': { backgroundColor: '#4F46E5' },
            }}
          >
            {t('btn_next')}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            endIcon={isPending ? <CircularProgress size={16} color="inherit" /> : <Check />}
            disabled={isPending}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              backgroundColor: enabled ? '#DC2626' : '#16A34A',
              '&:hover': { backgroundColor: enabled ? '#B91C1C' : '#15803D' },
            }}
          >
            {enabled ? t('btn_finish_enable') : t('btn_finish_disable')}
          </Button>
        )}
      </Box>
    </Paper>
  );
}
