#!/usr/bin/env node
/**
 * Bundle size baseline — Execution Plan §21 (P2 Performance Baseline).
 *
 * Measures, per App Router route, the bytes of the client JS that Next.js
 * emitted for it (.next/app-build-manifest.json), plus the shared chunks
 * present in every route — the same surface the build output reports as
 * "First Load JS". This is the record-before-optimize baseline required by
 * §21: optimization work in later milestones must quote these numbers
 * before/after.
 *
 * Usage (from the repository root):
 *   $env:NEXT_PUBLIC_SUPABASE_URL='https://ci-placeholder.supabase.co'   # bash: export ...
 *   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY='ci-placeholder-anon-key'
 *   pnpm --filter @eduzone/admin build
 *   node scripts/perf/bundle-baseline.mjs [output.json]
 *
 * The same NEXT_PUBLIC_* placeholder values the CI build gate uses keep the
 * measurement deterministic (no env-dependent code paths).
 *
 * No third-party dependencies: reads the build manifests with node:fs only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NEXT = path.join(ROOT, 'apps', 'admin', '.next');
const OUT = process.argv[2] ?? null;

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

function fileBytes(relativeToNext) {
  try {
    return fs.statSync(path.join(NEXT, relativeToNext)).size;
  } catch {
    return 0;
  }
}

if (!fs.existsSync(path.join(NEXT, 'app-build-manifest.json'))) {
  console.error(
    '[bundle-baseline] .next/app-build-manifest.json not found — run ' +
      "'pnpm --filter @eduzone/admin build' first (with the CI placeholder env).",
  );
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(NEXT, 'app-build-manifest.json'), 'utf8'));
const routes = manifest.pages ?? {};

const routeNames = Object.keys(routes).sort();
if (routeNames.length === 0) {
  console.error('[bundle-baseline] manifest contains no routes — unexpected build output.');
  process.exit(1);
}

// Chunks present in EVERY route are shared "First Load JS" — counted once,
// not per route, so route numbers stay comparable.
const sharedFiles = routeNames
  .map((route) => new Set(routes[route]))
  .reduce((acc, set) => new Set([...acc].filter((f) => set.has(f))));

const measured = routeNames.map((route) => {
  const own = routes[route].filter((f) => !sharedFiles.has(f));
  const bytes = own.reduce((sum, f) => sum + fileBytes(f), 0);
  return { route, files: own.length, bytes, kb: kb(bytes) };
});
measured.sort((a, b) => b.bytes - a.bytes);

const sharedBytes = [...sharedFiles].reduce((sum, f) => sum + fileBytes(f), 0);
const totalStatic = (function walk(dir) {
  let total = 0;
  for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? walk(full) : fs.statSync(full).size;
  }
  return total;
})(path.join(NEXT, 'static'));

const baseline = {
  generatedAt: new Date().toISOString(),
  method:
    'per-route unique client JS from .next/app-build-manifest.json + shared chunks counted once; ' +
    'build ran with the CI NEXT_PUBLIC_* placeholder values',
  routes: measured,
  shared: { files: sharedFiles.size, bytes: sharedBytes, kb: kb(sharedBytes) },
  totals: {
    routes: measured.length,
    heaviestRoute: measured[0]?.route ?? null,
    staticAllBytes: totalStatic,
    staticAllKb: kb(totalStatic),
  },
};

// ── Report to stdout ──────────────────────────────────────────────────────
const width = Math.max(...measured.map((r) => r.route.length), 20);
console.log('\nBundle baseline (client JS, per route — shared chunks counted once)\n');
console.log(`${'route'.padEnd(width)}  files      bytes     KB`);
console.log('-'.repeat(width + 30));
for (const r of measured) {
  console.log(`${r.route.padEnd(width)}  ${String(r.files).padStart(5)}  ${String(r.bytes).padStart(9)}  ${String(r.kb).padStart(7)}`);
}
console.log('-'.repeat(width + 30));
console.log(
  `${'shared (every route)'.padEnd(width)}  ${String(sharedFiles.size).padStart(5)}  ${String(sharedBytes).padStart(9)}  ${String(kb(sharedBytes)).padStart(7)}`,
);
console.log(`\n.static total: ${baseline.totals.staticAllKb} KB across ${measured.length} routes\n`);

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Written: ${path.resolve(OUT)}`);
}
