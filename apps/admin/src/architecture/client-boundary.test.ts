import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * P1 — Server/Client boundary (Phase 2 P1 FIX).
 *
 * Root cause (proven by a production-build break): dual-use service modules
 * mixed browser-client reads with service-role reads in one file, so client
 * components/queries/mutations pulled `supabase/admin` (service-role) and
 * server env names into the client dependency graph:
 *
 *   UsersPage → users.queries → users.service → supabase/admin
 *
 * The fix splits every dual-use module (browser-safe `*.service` +
 * server-only `*.admin`) and server/client env (`env.client` + server-only
 * `env`). These tests make the boundary executable:
 *
 *  1. Client-bundled files never RUNTIME-import a server-only module
 *     (`import type` is explicitly allowed — types are erased).
 *  2. Every server-only module carries the `import 'server-only'` guard, so
 *     a reintroduced edge fails the production build as well.
 *  3. The exact P1 path (browser-safe services) stays free of privileged
 *     imports.
 *
 * Server Actions (`adapters/actions/*`, `'use server'`) are intentionally
 * NOT banned here — they are Next.js's sanctioned client→server bridge
 * (RPC stubs, no server code bundled).
 */

const SRC_ROOT = path.resolve(__dirname, '..');

/** Runtime importers that end up in the client bundle by convention. */
const CLIENT_SCAN_DIRS = ['features', 'components', 'adapters/queries', 'adapters/mutations'] as const;

/** Server-only module specifiers (runtime imports of these from client code = P1). */
const SERVER_ONLY_SPECIFIERS = [
  '@/infrastructure/supabase/admin',
  '@/lib/env',
  '@/infrastructure/youtube.service',
  '@/infrastructure/repos/users.admin',
  '@/infrastructure/repos/courses.admin',
  '@/infrastructure/repos/access-rules.admin',
  '@/infrastructure/repos/audit.admin',
  '@/infrastructure/repos/user-location-logs.admin',
  '@/infrastructure/stats.admin',
  '@/infrastructure/repos/user_sessions.service',
  '@/infrastructure/repos/jobs.service',
  '@/infrastructure/repos/jobs-rpc.service',
  '@/infrastructure/repos/feature-flags.service',
  '@/infrastructure/repos/notifications.repository',
  '@/infrastructure/repos/rate-limits.service',
  '@/infrastructure/repos/session.repository',
  '@/infrastructure/repos/user-admin.repository',
  '@/infrastructure/repos/tenant-admin.repository',
  '@/infrastructure/observability/audit-logger.service',
] as const;

/** Modules that MUST carry the `server-only` guard. */
const GUARDED_MODULES = [
  'src/infrastructure/supabase/admin.ts',
  'src/lib/env.ts',
  'src/infrastructure/youtube.service.ts',
  'src/infrastructure/repos/users.admin.ts',
  'src/infrastructure/repos/courses.admin.ts',
  'src/infrastructure/repos/access-rules.admin.ts',
  'src/infrastructure/repos/audit.admin.ts',
  'src/infrastructure/repos/user-location-logs.admin.ts',
  'src/infrastructure/stats.admin.ts',
  'src/infrastructure/repos/user_sessions.service.ts',
  'src/infrastructure/repos/jobs.service.ts',
  'src/infrastructure/repos/jobs-rpc.service.ts',
  'src/infrastructure/repos/feature-flags.service.ts',
  'src/infrastructure/repos/notifications.repository.ts',
  'src/infrastructure/repos/rate-limits.service.ts',
  'src/infrastructure/repos/session.repository.ts',
  'src/infrastructure/repos/user-admin.repository.ts',
  'src/infrastructure/repos/tenant-admin.repository.ts',
  'src/infrastructure/observability/audit-logger.service.ts',
] as const;

/** Browser-safe services that caused the P1 — must stay privilege-free. */
const BROWSER_SAFE_MODULES = [
  'src/infrastructure/repos/users.service.ts',
  'src/infrastructure/repos/courses.service.ts',
  'src/infrastructure/repos/access-rules.service.ts',
  'src/infrastructure/repos/audit.service.ts',
  'src/infrastructure/repos/user_location_logs.service.ts',
  'src/infrastructure/stats-service.ts',
  'src/infrastructure/supabase/client.ts',
  'src/lib/env.client.ts',
] as const;

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name) &&
      !/\.stories\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function toRelative(file: string): string {
  return path.relative(SRC_ROOT, file).replace(/\\/g, '/');
}

/**
 * Extracts RUNTIME import specifiers (static + dynamic), resolving each
 * specifier against the importing file so `@/x/y` and `./y` forms compare
 * equal. Pure `import type` statements are erased (types don't exist at
 * runtime); mixed value/type imports keep the runtime edge (conservative).
 */
function extractRuntimeImports(file: string, source: string): string[] {
  const specs: string[] = [];
  const dir = path.dirname(file);

  // Static import/export-from (skip pure type imports).
  const staticRe = /(?:^|\n)\s*(import|export)\s([^;'"]*?)from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = staticRe.exec(source)) !== null) {
    const [, keyword, clause, spec] = match;
    if (keyword === 'import' && /^\s*type\b/.test(clause ?? '')) continue;
    specs.push(resolveSpec(dir, spec ?? ''));
  }

  // Dynamic import('...') with a literal specifier.
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRe.exec(source)) !== null) {
    specs.push(resolveSpec(dir, match[1] as string));
  }

  return specs;
}

/** Normalizes `@/a/b` and `./b`/`../b` to `@/…` form (drops extension). */
function resolveSpec(dir: string, spec: string): string {
  if (spec.startsWith('@/')) return spec.replace(/\.(ts|tsx)$/, '');
  if (spec.startsWith('.')) {
    const abs = path.resolve(dir, spec).replace(/\\/g, '/');
    const rel = path.relative(SRC_ROOT, abs).replace(/\\/g, '/');
    return ('@/' + rel).replace(/\.(ts|tsx)$/, '');
  }
  return spec;
}

describe('P1: client bundle never reaches server-only modules', () => {
  const files = CLIENT_SCAN_DIRS.flatMap((dir) => collectFiles(path.join(SRC_ROOT, dir)));
  // Any 'use client' file anywhere in src is client-bundled by definition.
  const allFiles = collectFiles(SRC_ROOT);
  const clientFiles = allFiles.filter((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return /['"]use client['"]/.test(source);
  });
  const scanned = [...new Map([...files, ...clientFiles].map((f) => [f, f])).values()];

  it('has client-bundled files to scan', () => {
    expect(scanned.length).toBeGreaterThan(0);
  });

  it.each(scanned.map((f) => [toRelative(f), f] as const))(
    '%s has no runtime import of a server-only module',
    (_rel, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const imports = extractRuntimeImports(file, source);
      for (const spec of imports) {
        const hit = (SERVER_ONLY_SPECIFIERS as readonly string[]).find(
          (banned) => spec === banned || spec.startsWith(banned + '/'),
        );
        expect(
          hit,
          `CLIENT BOUNDARY VIOLATION: ${toRelative(file)} runtime-imports server-only "${spec}" — ` +
            'move the privileged code behind a Server Action / Route Handler (see P1 FIX).',
        ).toBeUndefined();
      }
    },
  );
});

describe('P1: server-only modules carry the server-only guard', () => {
  it.each(GUARDED_MODULES)('%s imports server-only', (rel) => {
    const resolved = path.join(SRC_ROOT, rel.slice('src/'.length));
    const source = fs.readFileSync(resolved, 'utf8');
    expect(
      source,
      `${rel} must start with \`import 'server-only'\` so a client import fails the build`,
    ).toMatch(/^\s*import\s+['"]server-only['"]/m);
  });
});

describe('P1: the original UsersPage→admin path stays severed', () => {
  it.each(BROWSER_SAFE_MODULES)('%s has no privileged runtime import', (rel) => {
    const resolved = path.join(SRC_ROOT, rel.slice('src/'.length));
    const source = fs.readFileSync(resolved, 'utf8');
    const imports = extractRuntimeImports(resolved, source);
    for (const spec of imports) {
      const hit = (SERVER_ONLY_SPECIFIERS as readonly string[]).find(
        (banned) => spec === banned || spec.startsWith(banned + '/'),
      );
      expect(
        hit,
        `P1 REGRESSION: ${rel} runtime-imports "${spec}" — the UsersPage→admin path is back.`,
      ).toBeUndefined();
    }
  });
});
