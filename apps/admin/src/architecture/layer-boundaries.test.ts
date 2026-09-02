import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Architecture boundary tests (M8 — Repository / Port Boundary).
 *
 * Enforces the Clean Architecture dependency rules from
 * "EduZone Dashboard — Production Architecture Execution Plan" §12/§18:
 *
 *   domain      → domain only (no framework, no Supabase SDK, no layers)
 *   application → domain + ports (+ @supabase/supabase-js *types* injected
 *                 via parameters) — but NEVER another layer of this app.
 *
 * Application → Infrastructure must FAIL to compile in CI; these tests make
 * the rule executable so violations cannot be reintroduced silently.
 */

const SRC_ROOT = path.resolve(__dirname, '..');

const LAYER_IMPORT_RE = /from\s+['"]@\/(infrastructure|adapters|features|components|app|container)\//g;
const FRAMEWORK_IMPORT_RE = /from\s+['"](next(\/[\w-]+)*|react|react-dom)\b/g;
const SUPABASE_VALUE_IMPORT_RE = /from\s+['"]@supabase\/[\w-]+['"]/g;

/** Returns every source file (ts/tsx) under `dir`, recursively. */
function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function toRelative(file: string): string {
  return path.relative(SRC_ROOT, file).replace(/\\/g, '/');
}

/** Extracts static import/export-from module specifiers from a source file. */
function extractImports(source: string): string[] {
  const specs: string[] = [];
  const importRe = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(source)) !== null) {
    specs.push(match[1] as string);
  }
  return specs;
}

describe('architecture: domain layer purity', () => {
  const files = collectFiles(path.join(SRC_ROOT, 'domain'));

  it('has domain source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [toRelative(f), f] as const))(
    '%s imports nothing outside domain',
    (_rel, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const specs = extractImports(source);

      for (const spec of specs) {
        expect(
          LAYER_IMPORT_RE.test(spec) || FRAMEWORK_IMPORT_RE.test(spec) || SUPABASE_VALUE_IMPORT_RE.test(spec),
          `domain file imports forbidden module "${spec}"`,
        ).toBe(false);
      }
    },
  );
});

describe('architecture: application layer isolation', () => {
  const files = collectFiles(path.join(SRC_ROOT, 'application'));

  it('has application source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [toRelative(f), f] as const))(
    '%s never imports another layer of the app',
    (_rel, file) => {
      const source = fs.readFileSync(file, 'utf8');

      LAYER_IMPORT_RE.lastIndex = 0;
      const violation = LAYER_IMPORT_RE.exec(source);
      expect(
        violation,
        `application file imports forbidden layer module "${violation?.[0] ?? ''}" — ` +
          'application must depend on ports (@/application/ports/*), not concrete infrastructure/adapters',
      ).toBeNull();
    },
  );

  it('application use cases depend on ports, not concrete repositories', () => {
    const useCaseFiles = [
      ...collectFiles(path.join(SRC_ROOT, 'application', 'use-cases')),
    ];
    expect(useCaseFiles.length).toBeGreaterThan(0);

    for (const file of useCaseFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, toRelative(file)).not.toMatch(/@\/infrastructure\//);
    }
  });
});

/**
 * M9 — DTO / Schema Boundary (Execution Plan §13).
 *
 * The public boundary (server actions, route handlers, adapters) must not
 * blind-cast DB/RPC payloads across layers with `as any` / `as unknown as`.
 * Such casts silently widen what crosses the boundary and were the root of
 * the findings fixed in M9 (F9-1..F9-7). Storybook stories (*.stories.*)
 * are excluded: mock fixtures there are intentionally loose.
 */
describe('architecture: DTO / schema boundary (M9)', () => {
  const BOUNDARY_DIRS = ['adapters', 'features', 'app'] as const;
  const BLIND_CAST_RE = /\bas\s+unknown\s+as\b|\bas\s+any\b/;

  const boundaryFiles = BOUNDARY_DIRS.flatMap((dir) =>
    collectFiles(path.join(SRC_ROOT, dir)),
  ).filter((file) => !/\.stories\.(ts|tsx)$/.test(file));

  it('has boundary source files to scan', () => {
    expect(boundaryFiles.length).toBeGreaterThan(0);
  });

  it.each(boundaryFiles.map((f) => [toRelative(f), f] as const))(
    '%s uses no blind casts (as unknown as / as any)',
    (_rel, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const match = BLIND_CAST_RE.exec(source);
      expect(
        match,
        `blind cast "${match?.[0] ?? ''}" in ${toRelative(file)} — map/validate the payload at the boundary instead (Zod schema or typed mapper)`,
      ).toBeNull();
    },
  );
});
