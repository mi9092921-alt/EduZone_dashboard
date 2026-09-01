'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

import { EduZoneThemeProvider } from './ThemeProvider';

import { Toast } from '@/components/ui/Toast';
import { AuthProvider } from '@/features/auth';
import { getQueryClient } from '@/infrastructure/rpc/globalQueryClient';
import { getDir } from '@/lib/direction';



/**
 * Global Providers — wraps the entire app.
 * - React Query (QueryClientProvider)
 * - MUI App Router Cache (AppRouterCacheProvider)
 * - Dynamic ThemeProvider (next-themes + MUI)
 * - AuthProvider (hydrates Zustand state)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const locale = useLocale();
  const isRtl = getDir(locale) === 'rtl';

  // The emotion cache needs the RTL stylis plugin so that MUI's own
  // `sx`/`styleOverrides` physical CSS (margin-left, padding-right, etc.) is
  // mirrored for Arabic. A distinct cache `key` per direction is required —
  // reusing the LTR cache would serve stale, un-mirrored styles after a
  // locale switch. The LTR branch omits `stylisPlugins` to keep emotion's
  // own default (`[prefixer]`) untouched.
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouterCacheProvider
        options={
          isRtl
            ? { key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin], enableCssLayer: true }
            : { key: 'mui', enableCssLayer: true }
        }
      >
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
