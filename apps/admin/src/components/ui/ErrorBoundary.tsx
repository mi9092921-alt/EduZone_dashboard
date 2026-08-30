'use client';

import { ErrorOutline as AlertCircle, Refresh } from '@mui/icons-material';
import { Box, Button, Container, Typography, Paper } from '@mui/material';
import { useTranslations } from 'next-intl';
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Standard React Error Boundary.
 * Catches rendering errors in its child tree.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in boundary [${this.props.name || 'Global'}]:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      
      return (
        <ErrorPage 
          error={this.state.error} 
          reset={() => this.setState({ hasError: false })} 
        />
      );
    }

    return this.props.children;
  }
}

/**
 * The default fallback UI for full-page or section-level errors.
 */
export function ErrorPage({ error, reset }: { error?: Error | undefined; reset?: () => void }) {
  const t = useTranslations('errors');

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          py: 8,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 4,
            border: '1px solid',
            borderColor: 'error.light',
            bgcolor: 'error.main',
            color: 'error.contrastText',
            mb: 4,
          }}
        >
          <AlertCircle sx={{ fontSize: 48, mb: 1, opacity: 0.9 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {t('title')}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8, maxWidth: '300px', mx: 'auto' }}>
            {t('desc')}
          </Typography>
        </Paper>

        <Box sx={{ gap: 2, display: 'flex' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Refresh />}
            onClick={() => reset ? reset() : window.location.reload()}
            sx={{ borderRadius: 2 }}
          >
            {t('retry')}
          </Button>
          <Button
            variant="outlined"
            onClick={() => window.location.href = '/'}
            sx={{ borderRadius: 2 }}
          >
            {t('home')}
          </Button>
        </Box>

        {error && process.env.NODE_ENV === 'development' && (
          <Box sx={{ mt: 6, textAlign: 'left', width: '100%', overflow: 'auto' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', p: 2, bgcolor: '#f1f1f1', display: 'block', borderRadius: 1 }}>
              {error.message}
              <br />
              {error.stack}
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}
