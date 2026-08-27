'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { eduZoneTheme, eduZoneDarkTheme } from '@eduzone/ui';

function MuiThemeBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Use variables for core surfaces so that even before hydration, 
  // the server-rendered MUI components pick up the correct colors from CSS.
  // We specify the theme object for non-variable logic (like spacing, specific components).
  const currentTheme = mounted && resolvedTheme === 'dark' ? eduZoneDarkTheme : eduZoneTheme;

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
