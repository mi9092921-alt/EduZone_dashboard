import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RPC_CATALOG, requiresAdminClient } from '@/infrastructure/rpc/rpc-catalog';

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

/**
 * M10 — Error Architecture (Execution Plan §14).
 *
 * Two executable rules:
 *
 * 1. Raw error re-throws are banned at the infrastructure boundary.
 *    `if (error) throw error;` forwards PostgREST/PG messages (constraint
 *    names, schema details, hints) to whoever catches upstream. Errors
 *    crossing the infrastructure boundary must be mapped to the domain
 *    taxonomy (`domain/errors`) instead.
 *
 * 2. `getErrorMessage` must not be used for client-facing results.
 *    It passes through ANY raw `.message` (including raw DB errors).
 *    Client-facing boundaries use `toClientMessage`, which masks
 *    non-AppError shapes.
 */
describe('architecture: error boundary (M10)', () => {
  const RAW_RETHROW_RE = /\bif\s*\((?:\w*Err\w*|error|err)\)\s*(?:console\.[\w.]+\([^;]*\);\s*)?throw\s+(?:error|err|e)\s*;/;
  const SCAN_DIRS = ['infrastructure', 'adapters', 'app', 'application'] as const;

  const errorBoundaryFiles = SCAN_DIRS.flatMap((dir) =>
    collectFiles(path.join(SRC_ROOT, dir)),
  ).filter((file) => !/\.test\.ts$/.test(file));

  it('has error-boundary source files to scan', () => {
    expect(errorBoundaryFiles.length).toBeGreaterThan(0);
  });

  it.each(errorBoundaryFiles.map((f) => [toRelative(f), f] as const))(
    '%s never re-throws a raw DB error (if (error) throw error)',
    (_rel, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const match = RAW_RETHROW_RE.exec(source);
      expect(
        match,
        `raw re-throw in ${toRelative(file)} — map it to the error taxonomy ` +
          '(InfrastructureError/ConflictError/NotFoundError/... from @/domain/errors) so raw DB details never reach clients',
      ).toBeNull();
    },
  );

  it('client-facing error mapping uses toClientMessage, not getErrorMessage', () => {
    for (const file of errorBoundaryFiles) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('getErrorMessage')) continue;
      expect(
        source.includes('toClientMessage') || /parseRpcError|hasPerm|\.test\./.test(source) === true,
        `getErrorMessage in ${toRelative(file)} passes raw .message through — ` +
          'use toClientMessage for client-facing results (it masks non-AppError shapes)',
      ).toBe(true);
    }
  });
});

/**
 * M11 — RPC Boundary (Execution Plan §15).
 *
 * Postgres RPCs are privileged database entry points: each carries its own
 * SECURITY DEFINER/INVOKER semantics, EXECUTE grants, and tenant/permission
 * guards (see infrastructure/rpc/rpc-catalog.ts — the single source of truth).
 *
 * Rule: `.rpc(` call sites are allowed ONLY inside `infrastructure/` plus the
 * documented exception below. UI components (features/), server-action
 * boundaries (adapters/, app/) and use cases (application/) must go through
 * a repository/service function so classification, error mapping and admin
 * client usage are decided in one reviewed place — not sprinkled at will.
 */
describe('architecture: RPC boundary (M11)', () => {
  /** Documented non-infrastructure call sites (each justified in the RPC catalog). */
  const RPC_CALL_SITE_EXCEPTIONS = new Set([
    // M5 centralized authorization: user_has_permission enforces
    // p_user_id = auth.uid() server-side for non-service-role callers.
    'application/authorization/authorization.service.ts',
  ]);

  const RPC_SCAN_DIRS = ['infrastructure', 'adapters', 'features', 'app', 'application'] as const;
  const rpcFiles = RPC_SCAN_DIRS.flatMap((dir) => collectFiles(path.join(SRC_ROOT, dir))).filter(
    (file) => !/\.test\.tsx?$/.test(file) && !/\.stories\.(ts|tsx)$/.test(file),
  );

  it('has RPC-boundary source files to scan', () => {
    expect(rpcFiles.length).toBeGreaterThan(0);
  });

  it.each(rpcFiles.map((f) => [toRelative(f), f] as const))(
    '%s calls .rpc() only inside infrastructure (or a documented exception)',
    (rel, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const isInfra = rel.startsWith('infrastructure/');
      if (isInfra || RPC_CALL_SITE_EXCEPTIONS.has(rel)) return;

      const rpcCallCount = (source.match(/\.rpc\s*(?:<[^>]*>)?\(/g) ?? []).length;
      expect(
        rpcCallCount,
        `${rel} calls .rpc() directly — RPCs are catalogued privileged entry points ` +
          '(infrastructure/rpc/rpc-catalog.ts). Move the call into an infrastructure ' +
          'repository/service and depend on that instead.',
      ).toBe(0);
    },
  );

  it('every catalogued service-role RPC is owned by infrastructure', () => {
    // Guard the catalog itself: each service-role RPC must be owned by an
    // infrastructure module (call sites stay behind reviewed wrappers).
    const serviceRole = RPC_CATALOG.filter((def) => requiresAdminClient(def));
    expect(serviceRole.length).toBeGreaterThan(0);
    for (const def of serviceRole) {
      expect(
        def.owner,
        `service-role RPC ${def.name} must name an infrastructure owner (got: ${def.owner})`,
      ).toMatch(/infrastructure/);
    }
  });
});

/**
 * M14 — Architecture Enforcement (Execution Plan §18).
 *
 * ESLint (eslint.config.mjs) now fails `pnpm lint` — and therefore the CI
 * *Lint* gate — for these rules. This vitest guard is a second, independent
 * net: it runs in the *Test* gate so a misconfigured ESLint setup cannot
 * silently reintroduce the security-critical violation.
 *
 * service_role containment: `createAdminClient()` (service-role client)
 * bypasses every RLS policy in the database. Importing it anywhere outside
 * `infrastructure/` — except the two documented privileged API routes
 * (bulk-action, audit cleanup) — re-opens the M4 attack surface where any
 * client-reachable module could act as the service role.
 */
describe('architecture: service-role containment (M14)', () => {
  /** Documented importers of the service-role client outside infrastructure. */
  const SERVICE_ROLE_ALLOWED_PREFIXES = [
    'infrastructure/',
    'app/api/bulk-action/',
    'app/api/audit/cleanup-duplicate-seqs/',
  ];

  // Scan the whole src tree (not just the layers the other describes cover):
  // a service-role import in lib/, config/, components/ or at the src root
  // would be just as fatal.
  const files = collectFiles(SRC_ROOT).filter(
    (file) =>
      !/\.test\.tsx?$/.test(file) &&
      !/\.stories\.(ts|tsx)$/.test(file) &&
      !SERVICE_ROLE_ALLOWED_PREFIXES.some((prefix) => toRelative(file).startsWith(prefix)),
  );

  it('has source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [toRelative(f), f] as const))(
    '%s never imports the service-role client',
    (rel, file) => {
      const source = fs.readFileSync(file, 'utf8');
      // Matches the alias import and any relative path ending in
      // supabase/admin, so the rule survives path-alias refactors.
      const violation = source.match(/from\s+['"][^'"]*supabase\/admin['"]/);
      expect(
        violation,
        `${rel} imports the service-role client (${violation?.[0] ?? ''}) — ` +
          'createAdminClient() bypasses all RLS and is importable only from ' +
          'src/infrastructure/** and the documented privileged API routes ' +
          '(app/api/bulk-action, app/api/audit/cleanup-duplicate-seqs). Put the ' +
          'operation behind an infrastructure repository/service instead.',
      ).toBeNull();
    },
  );
});
