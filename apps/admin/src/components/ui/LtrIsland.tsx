'use client';

import { eduZoneDarkTheme, eduZoneTheme } from '@eduzone/ui';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { Box, ThemeProvider, useTheme } from '@mui/material';
import * as React from 'react';

/**
 * LtrIsland — renders children with physically LTR geometry inside an RTL
 * locale (used by the Switches / Sliders on /flags).
 *
 * Why this exists: the global emotion cache (see `src/app/[locale]/providers.tsx`)
 * attaches `stylis-plugin-rtl`, which mirrors EVERY rule it compiles —
 * `left: 0` ships as `right: 0` and MUI's checked `translateX(16px)` ships as
 * `translateX(-16px)`. That mirror is applied to the CSS text itself, so
 * neither a `dir="ltr"` attribute nor a `ThemeProvider` with an LTR theme can
 * opt a subtree out of it (MUI 5.18's Switch/Slider emit static transforms
 * and never read `theme.direction`). An LTR-wrapped control therefore still
 * received mirrored CSS: its thumb slid out of the track and was clipped by
 * `.MuiSwitch-root { overflow: hidden }`.
 *
 * This island fixes the problem at the cache level: a module-level singleton
 * cache WITHOUT the RTL stylis plugin (emotion's own `[prefixer]` default,
 * same as the LTR branch of providers.tsx) plus an LTR `ThemeProvider` and
 * `dir="ltr"`, so MUI generates its LTR baseline verbatim inside the island.
 * Emotion dedupes identical rules by class name, so many islands share one
 * set of inserted styles.
 *
 * Note: the island cache is client-inserted (AppRouterCacheProvider only
 * server-extracts its own cache). Current call sites render after client data
 * has loaded, so there is no SSR flash to account for.
 */

// Module-level singleton — a per-render cache would remount style tags for
// every row/dialog instance.
let ltrCache: ReturnType<typeof createCache> | null = null;

function getLtrCache() {
  if (!ltrCache) {
    // Omitting `stylisPlugins` keeps emotion's own default (`[prefixer]`) —
    // nothing is mirrored inside the island.
    ltrCache = createCache({ key: 'edz-ltr' });
  }
  return ltrCache;
}

export function LtrIsland({ children }: { children: React.ReactNode }) {
  const parentTheme = useTheme();
  // Pass the parent theme through unchanged in LTR locales; derive the LTR
  // variant (matching the current palette mode) in RTL ones — same convention
  // as FeatureFlagsPage's former `ltrTheme`.
  const ltrTheme =
    parentTheme.direction === 'ltr'
      ? parentTheme
      : parentTheme.palette.mode === 'dark'
        ? eduZoneDarkTheme
        : eduZoneTheme;

  return (
    <CacheProvider value={getLtrCache()}>
      <ThemeProvider theme={ltrTheme}>
        <Box dir="ltr">{children}</Box>
      </ThemeProvider>
    </CacheProvider>
  );
}
