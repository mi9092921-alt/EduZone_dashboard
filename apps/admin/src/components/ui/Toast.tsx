'use client';

import { Snackbar, Alert, Box } from '@mui/material';
import React from 'react';

import { useToastStore } from '@/adapters/stores/toast.store';

/**
 * Global Toast component rendered at the root of the application.
 * Listens to the toast store for display state.
 */
export function Toast() {
  const { open, message, severity, hideToast } = useToastStore();

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    hideToast();
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={4000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        bottom: { xs: 16, sm: 24 },
      }}
    >
      <Box sx={{ width: '100%', maxWidth: '400px' }}>
        <Alert
          onClose={handleClose}
          severity={severity}
          variant="filled"
          sx={{
            width: '100%',
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            fontWeight: 600,
            '& .MuiAlert-icon': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
        >
          {message}
        </Alert>
      </Box>
    </Snackbar>
  );
}
