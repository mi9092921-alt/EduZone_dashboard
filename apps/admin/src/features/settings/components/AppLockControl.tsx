'use client';

import { Lock, LockOpen, Warning } from '@mui/icons-material';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useLockApp, useUnlockApp } from '@/adapters/mutations/settings.mutations';
import { parseRpcError } from '@/domain/errors';
import type { SettingsByCategory } from '@/domain/types/settings.types';

interface AppLockControlProps {
  settings?: SettingsByCategory;
}

export function AppLockControl({ settings }: AppLockControlProps) {
  const t = useTranslations('settings.app_lock');
  const tVal = useTranslations('validation');
  const maintenanceSettings = settings?.maintenance ?? [];
  const isLocked = maintenanceSettings.find((s) => s.key === 'app_locked')?.value === 'true';
  const lockMessage = maintenanceSettings.find((s) => s.key === 'app_lock_message')?.value ?? '';

  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const lockMutation = useLockApp();
  const unlockMutation = useUnlockApp();

  const handleLock = async () => {
    if (message.trim().length < 5) {
      setError(tVal('message_min', { min: 5 }));
      return;
    }
    try {
      await lockMutation.mutateAsync(message);
      setLockDialogOpen(false);
      setMessage('');
      setError('');
    } catch (err: unknown) {
      setError(parseRpcError(err).message);
    }
  };

  const handleUnlock = async () => {
    try {
      await unlockMutation.mutateAsync();
      setUnlockDialogOpen(false);
    } catch (err: unknown) {
      setError(parseRpcError(err).message);
    }
  };

  const isPending = lockMutation.isPending || unlockMutation.isPending;

  return (
    <>
      {/* Locked Banner */}
      {isLocked && (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '2px solid',
            borderColor: 'error.main',
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(220,38,38,0.1)' : 'rgba(254,242,242,1)',
            p: 2.5,
            mb: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #DC2626, #EF4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Lock sx={{ color: '#fff', fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, color: 'error.main', fontSize: '1rem' }}>
              {t('locked_banner')}
            </Typography>
            {lockMessage && (
              <Typography sx={{ color: 'error.dark', fontSize: '0.875rem', mt: 0.5 }}>
                {lockMessage}
              </Typography>
            )}
          </Box>
          <Button
            variant="contained"
            color="success"
            startIcon={<LockOpen />}
            onClick={() => setUnlockDialogOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              gap: 1,
              '& .MuiButton-startIcon': {
                margin: 0,
              },
            }}
          >
            {t('btn_unlock')}
          </Button>
        </Paper>
      )}

      {/* Lock/Unlock Buttons — only show Lock button when not locked */}
      {!isLocked && (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            p: 2.5,
            mb: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LockOpen sx={{ color: '#fff', fontSize: 20 }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>{t('title')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('desc')}
              </Typography>
            </Box>
          </Box>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Lock />}
            onClick={() => setLockDialogOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              gap: 1,
              '& .MuiButton-startIcon': {
                margin: 0,
              },
            }}
          >
            {t('btn_lock')}
          </Button>
        </Paper>
      )}

      {/* Lock Dialog */}
      <Dialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning sx={{ color: 'error.main' }} />
          {t('title')}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
            {t('warning_msg')}
          </Alert>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            label={t('label_message')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            multiline
            rows={3}
            fullWidth
            required
            placeholder={t('placeholder_message')}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLockDialogOpen(false)} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleLock}
            disabled={isPending}
            startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : <Lock />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              gap: 1,
              '& .MuiButton-startIcon': {
                margin: 0,
              },
            }}
          >
            {t('btn_lock')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unlock Dialog */}
      <Dialog
        open={unlockDialogOpen}
        onClose={() => setUnlockDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{t('unlock_confirm_title')}</DialogTitle>
        <DialogContent>
          <Typography>{t('unlock_confirm_msg')}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUnlockDialogOpen(false)} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleUnlock}
            disabled={isPending}
            startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : <LockOpen />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              gap: 1,
              '& .MuiButton-startIcon': {
                margin: 0,
              },
            }}
          >
            {t('btn_unlock')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
