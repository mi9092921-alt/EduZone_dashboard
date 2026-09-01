'use client';

import {
  eduZoneTheme,
  eduZoneDarkTheme,
  eduZoneThemeRtl,
  eduZoneDarkThemeRtl,
} from '@eduzone/ui';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useLocale } from 'next-intl';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import * as React from 'react';

import { getDir } from '@/lib/direction';

function MuiThemeBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const isRtl = getDir(locale) === 'rtl';
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Use variables for core surfaces so that even before hydration, 
  // the server-rendered MUI components pick up the correct colors from CSS.
  // We specify the theme object for non-variable logic (like spacing, specific components).
  // `direction` must also flip here: the `<html dir>` attribute only affects
  // native CSS, not MUI's own layout logic (Menu/Popover placement, Dialog
  // transitions, theme.direction reads throughout the app).
  const isDark = mounted && resolvedTheme === 'dark';
  const currentTheme = isDark
    ? (isRtl ? eduZoneDarkThemeRtl : eduZoneDarkTheme)
    : (isRtl ? eduZoneThemeRtl : eduZoneTheme);

  return (
    <ThemeProvider theme={currentTheme}>
      {/* CssBaseline is now theme-aware via CSS variables, preventing the "white flash" */}
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export function EduZoneThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MuiThemeBridge>
        {children}
      </MuiThemeBridge>
    </NextThemesProvider>
  );
}
