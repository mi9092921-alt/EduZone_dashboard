'use client';

import { QueryClientProvider } from '@tanstack/react-query';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { getQueryClient } from '@/infrastructure/rpc/globalQueryClient';
import { EduZoneThemeProvider } from './ThemeProvider';
import { AuthProvider } from '@/features/auth';
import { Toast } from '@/components/ui/Toast';

/**
 * Global Providers — wraps the entire app.
 * - React Query (QueryClientProvider)
 * - MUI App Router Cache (AppRouterCacheProvider)
 * - Dynamic ThemeProvider (next-themes + MUI)
 * - AuthProvider (hydrates Zustand state)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouterCacheProvider options={{ enableCssLayer: true }}>
        <EduZoneThemeProvider>
          <AuthProvider>
            {children}
            <Toast />
          </AuthProvider>
        </EduZoneThemeProvider>
      </AppRouterCacheProvider>
    </QueryClientProvider>
  );
}
