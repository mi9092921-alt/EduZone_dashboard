import { eduZoneThemeRtl } from '@eduzone/ui';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { Slider, Switch, ThemeProvider } from '@mui/material';
import { render } from '@testing-library/react';
import * as React from 'react';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { describe, expect, it } from 'vitest';

import { LtrIsland } from './LtrIsland';

/**
 * Reproduces the /flags Switch RTL bug at the CSS level.
 *
 * providers.tsx attaches `stylis-plugin-rtl` to the emotion cache for RTL
 * locales. That plugin (via cssjanus) mirrors every physical declaration in
 * the cache — including `left: 0` → `right: 0` and MUI's checked
 * `translateX(16px)` → `translateX(-16px)` — and it does so on the CSS text,
 * so a `dir="ltr"` wrapper cannot opt a subtree out. The thumb then slides
 * out of the track and `.MuiSwitch-root { overflow: hidden }` clips it.
 *
 * LtrIsland swaps in a plugin-free cache so MUI's LTR baseline ships
 * verbatim. These tests assert the exact shipped (post-mirror) CSS.
 */

/** Whitespace-free view of the CSS so assertions don't depend on serialization. */
function compact(css: string): string {
  return css.replace(/\s+/g, '');
}

/** All CSS emitted under a given emotion cache key (style tags carry `data-emotion`). */
function headCss(cacheKey: string): string {
  return Array.from(document.head.querySelectorAll(`style[data-emotion="${cacheKey}"]`))
    .map((tag) => tag.textContent ?? '')
    .join('');
}

/** Renders under a cache configured exactly like providers.tsx for RTL locales. */
function renderInRtlApp(ui: React.ReactElement, cacheKey: string) {
  const rtlCache = createCache({
    key: cacheKey,
    stylisPlugins: [prefixer, rtlPlugin],
  });
  return render(
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={eduZoneThemeRtl}>{ui}</ThemeProvider>
    </CacheProvider>,
  );
}

describe('LtrIsland (RTL cache mirror isolation)', () => {
  it('documents the root cause: a bare Switch under the RTL cache ships mirrored CSS', () => {
    // Unique cache key per test keeps the head CSS assertions scoped.
    const { container } = renderInRtlApp(<Switch checked size="small" color="success" />, 'muirtl-bare');

    const css = compact(headCss('muirtl-bare'));

    // The checked travel was mirrored (+16px → -16px)…
    expect(css).toContain('translateX(-16px)');
    expect(css).not.toContain('translateX(16px)');
    // …and so was the switchBase anchoring (left: 0 → right: 0).
    expect(css).not.toContain('position:absolute;top:0;left:0');
    expect(container.querySelector('.MuiSwitch-switchBase')).not.toBeNull();
  });

  it('ships MUI\'s unmirrored LTR baseline for a Switch inside the island', () => {
    const { container } = renderInRtlApp(
      <LtrIsland>
        <Switch checked size="small" color="success" />
      </LtrIsland>,
      'muirtl-island',
    );

    // The island opt-out is structural: `dir="ltr"` wrapper present…
    expect(container.querySelector('[dir="ltr"]')).not.toBeNull();

    const css = compact(headCss('edz-ltr'));

    // …anchoring is the LTR baseline, not the mirrored `right: 0`…
    expect(css).toContain('position:absolute;top:0;left:0');
    // …and the checked travel is the positive +16px (size="small").
    expect(css).toContain('translateX(16px)');
    expect(css).not.toContain('translateX(-16px)');
    expect(css).not.toContain('translateX(-20px)');
  });

  it('protects the Slider thumb centering from the mirror as well', () => {
    renderInRtlApp(
      <LtrIsland>
        <Slider value={50} size="small" />
      </LtrIsland>,
      'muirtl-slider',
    );

    const css = compact(headCss('edz-ltr'));

    // MUI centers the thumb with translate(-50%, -50%); cssjanus would flip
    // it to translate(50%, -50%) and push the thumb off the rail.
    expect(css).toContain('translate(-50%,-50%)');
    expect(css).not.toContain('translate(50%,-50%)');
  });

  it('renders a bare Slider under the RTL cache mirrored (control for the test above)', () => {
    renderInRtlApp(<Slider value={50} size="small" />, 'muirtl-slider-bare');

    const css = compact(headCss('muirtl-slider-bare'));

    expect(css).toContain('translate(50%,-50%)');
    expect(css).not.toContain('translate(-50%,-50%)');
  });
});
