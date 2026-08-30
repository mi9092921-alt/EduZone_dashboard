'use client';

import { Close as CloseIcon } from '@mui/icons-material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  CircularProgress,
  Stack,
  Box,
  IconButton
} from '@mui/material';
import { ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'error' | 'warning' | 'primary' | 'success' | 'info';
  isLoading?: boolean;
  error?: string | null;
  icon?: ReactNode;
  children?: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  isLoading = false,
  error,
  icon,
  children,
  maxWidth = 'xs',
}: ConfirmDialogProps) {
  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth={maxWidth} 
      fullWidth 
      PaperProps={{ 
        sx: { 
          borderRadius: 3, 
          bgcolor: 'background.paper', 
          backgroundImage: 'none' 
        } 
      }}
    >
      <DialogTitle sx={{ p: 3, pb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" gap={1.5}>
            {icon && (
              <Box sx={{ 
                bgcolor: `${confirmColor}.main`, 
                color: `${confirmColor}.contrastText`, 
                p: 1, 
                borderRadius: 2, 
                display: 'flex', 
                opacity: 0.9 
              }}>
                {icon}
              </Box>
            )}
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>
              {title}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: 0 }}>
        <Stack gap={1}>
          {description && (
            <Typography sx={{ color: 'text.secondary', mb: 2 }}>
              {description}
            </Typography>
          )}

          {children}

          {error && (
            <Box sx={{ p: 2, mt: 2, borderRadius: 2, bgcolor: 'error.main' + '1A', color: 'error.main', border: '1px solid', borderColor: 'error.main' + '33' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{error}</Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button 
          onClick={onClose} 
          variant="outlined" 
          disabled={isLoading}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, color: 'text.secondary', borderColor: 'divider' }}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          disabled={isLoading}
          onClick={onConfirm}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
