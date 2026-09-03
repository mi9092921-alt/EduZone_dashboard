#!/usr/bin/env node
/**
 * Web-vitals baseline — Execution Plan §21 (P2 Performance Baseline).
 *
 * Measures real browser navigation metrics (TTFB, FCP, LCP, CLS, DCL, Load)
 * for the PUBLIC routes of the running app, using the Playwright Chromium
 * build already installed for this repository. Authenticated pages need the
 * seeded test backend (same precondition as the E2E gate — see
 * M15/M16 reports); INP additionally needs scripted interaction scenarios
 * and is therefore not part of this load baseline.
 *
 * Usage (from the repository root, with the app already serving):
 *   node scripts/perf/web-vitals.mjs http://localhost:3100 /login [runs=3]
 *
 * With the CI NEXT_PUBLIC_* placeholder values the Supabase calls fail
 * gracefully (middleware catches and treats the visitor as anonymous), which
 * is enough to measure the load path of public pages. Results are printed as
 * a table and, when an output path is given, written as JSON.
 *
 * No third-party dependencies: uses @playwright/test's bundled chromium.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// `playwright` is a dependency of @eduzone/admin (not the root workspace), so
// resolve it from the app package — works under pnpm's non-hoisted layout.
const { chromium } = createRequire(path.join(ROOT, 'apps', 'admin', 'package.json'))('playwright');
const [, , baseUrl = 'http://localhost:3100', routeArg = '/login', runsArg = '3'] = process.argv;
const RUNS = Math.max(1, Number(runsArg) || 3);
const OUT = process.env.VITALS_OUT ?? null;

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const round1 = (v) => Math.round(v * 10) / 10;

const browser = await chromium.launch();
const samples = [];

for (let i = 0; i < RUNS; i += 1) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect web-vitals from the page itself, before any app JS runs.
  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, cls: 0, fcp: 0 };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__vitals.lcp = entries[entries.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') window.__vitals.fcp = entry.startTime;
        }
      }).observe({ type: 'paint', buffered: true });
    } catch {}
  });

  const response = await page.goto(new URL(routeArg, baseUrl).href, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  // Give observers a moment to flush post-load shifts/paints.
  await page.waitForTimeout(1500);

  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    const vitals = window.__vitals ?? {};
    return {
      ttfb: entry ? entry.responseStart - entry.startTime : 0,
      domContentLoaded: entry ? entry.domContentLoadedEventEnd - entry.startTime : 0,
      load: entry ? entry.loadEventEnd - entry.startTime : 0,
      transferKb: entry ? Math.round((entry.transferSize / 1024) * 10) / 10 : 0,
      fcp: vitals.fcp ?? 0,
      lcp: vitals.lcp ?? 0,
      cls: Math.round((vitals.cls ?? 0) * 1000) / 1000,
    };
  });

  samples.push({ run: i + 1, finalUrl: page.url(), status: response?.status() ?? 0, ...nav });
  await context.close();
}
await browser.close();

const fields = ['ttfb', 'fcp', 'lcp', 'cls', 'domContentLoaded', 'load', 'transferKb'];
const summary = Object.fromEntries(fields.map((f) => [f, round1(median(samples.map((s) => s[f])))]) );

console.log(`\nWeb-vitals baseline — ${baseUrl}${routeArg} (${RUNS} runs, chromium)\n`);
for (const s of samples) {
  console.log(
    `run ${s.run}: status=${s.status} ttfb=${round1(s.ttfb)}ms fcp=${round1(s.fcp)}ms ` +
      `lcp=${round1(s.lcp)}ms cls=${s.cls} dcl=${round1(s.domContentLoaded)}ms ` +
      `load=${round1(s.load)}ms transfer=${s.transferKb}KB  -> ${s.finalUrl}`,
  );
}
console.log('\nmedian:', JSON.stringify(summary));

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(
    path.resolve(OUT),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, route: routeArg, runs: RUNS, samples, median: summary }, null, 2)}\n`,
  );
  console.log(`Written: ${path.resolve(OUT)}`);
}
