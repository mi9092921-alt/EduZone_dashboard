import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'storybook-static/**',
      'test-results/**',
      'src/stories/**',
      '**/*.stories.*',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // Test files legitimately need `any` for mock/spy casting (e.g.
    // `(fn as any).mockResolvedValue(...)`) — typing every mock precisely
    // adds boilerplate with no real safety benefit, since this code never
    // runs in production. Every other rule (including no-unused-vars) still
    // applies at full strictness to test files.
    files: ['**/*.test.{ts,tsx}', '**/*.test-d.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Cypress's documented pattern for extending Cypress.Chainable with
    // custom commands requires `declare global { namespace Cypress {...} }` —
    // there is no ES-module equivalent for this kind of ambient type merging.
    files: ['cypress/support/**/*.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // M14 — Architecture Enforcement (Execution Plan §18).
  //
  // Turns the Clean Architecture dependency rules into fail-fast ESLint
  // errors so `pnpm lint` — and therefore the CI *Lint* gate, which runs
  // before Test/Build — breaks directly on a violation instead of waiting
  // for the vitest guard (src/architecture/layer-boundaries.test.ts).
  //
  // Core rules enforced here (Execution Plan §18):
  //   domain      → only domain / shared-pure
  //   application → domain + ports + dto + errors (application ↛ infrastructure)
  //   domain      ↛ Supabase, ↛ Next, ↛ React
  //   features    ↛ service_role
  //   routes      ↛ business logic (no DB connections opened in routes)
  //
  // Flat config note: for the same rule id, the LAST matching block wins.
  // Blocks are therefore ordered general → specific, and each specific block
  // re-states the general bans it must keep for its files.
  //
  // `allowTypeImports: true` on @supabase patterns encodes the documented M8
  // exception: layers may reference Supabase *types* (injected
  // `SupabaseClient` parameters) but never create/obtain clients themselves.
  // ─────────────────────────────────────────────────────────────────────────
  {
    // service-role containment (M4 boundary, `features ↛ service_role`):
    // createAdminClient() bypasses every RLS policy. It may only be imported
    // inside infrastructure/ and the two documented privileged API routes
    // (bulk-action, audit cleanup). Also: no direct Supabase SDK *value*
    // imports outside infrastructure/ — clients are created in exactly one
    // layer and reached through container.supabase / infrastructure services.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/infrastructure/**',
      'src/app/api/bulk-action/**',
      'src/app/api/audit/cleanup-duplicate-seqs/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/infrastructure/supabase/admin', '@/infrastructure/supabase/admin/*'],
            message:
              'service_role containment: createAdminClient() bypasses all RLS. It is importable only from src/infrastructure/** and the documented privileged routes (app/api/bulk-action, app/api/audit/cleanup-duplicate-seqs). Put the operation behind an infrastructure repository/service and depend on that.',
          },
          {
            group: ['@supabase/*'],
            allowTypeImports: true,
            message:
              'Supabase clients are created only inside src/infrastructure/. Use container.supabase (browser), createServerClient() (server) or an infrastructure service; type-only imports are allowed.',
          },
        ],
      }],
    },
  },
  {
    // domain purity: `domain → only domain / shared-pure`,
    // `domain ↛ Supabase / Next / React`. Shared-pure externals (zod,
    // @eduzone/types) and relative imports inside domain stay allowed.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^@/(?!domain(?:/|$))',
            message:
              'domain may only import from @/domain/* (plus pure externals like zod and @eduzone/types). It must not reach any other layer of this app.',
          },
          {
            group: [
              'next', 'next/*',
              'react', 'react/*', 'react-dom', 'react-dom/*',
              '@supabase/*',
              '@eduzone/ui', '@eduzone/ui/*',
            ],
            message:
              'domain stays framework- and vendor-agnostic: no Next.js, no React, no Supabase SDK, no UI kit.',
          },
        ],
      }],
    },
  },
  {
    // application isolation: `application → domain + ports + dto + errors`,
    // `application ↛ infrastructure` (and every other layer of this app).
    // Implementations are injected at the boundaries (adapters/, app/).
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '@/infrastructure/**', '@/adapters/**', '@/features/**',
              '@/components/**', '@/app/**', '@/container', '@/container/**',
            ],
            message:
              'application must not import another layer of this app (infrastructure/adapters/features/components/app/container). Depend on ports from @/application/ports and let the boundaries compose implementations.',
          },
          {
            group: ['next', 'next/*', 'react', 'react/*', 'react-dom', 'react-dom/*'],
            message: 'application stays framework-agnostic: no Next.js or React imports in use cases/ports.',
          },
          {
            group: ['@supabase/*'],
            allowTypeImports: true,
            message:
              'application may reference Supabase TYPES only (injected SupabaseClient parameters); runtime clients come from infrastructure via the boundaries.',
          },
        ],
      }],
    },
  },
  {
    // thin routes: `routes ↛ business logic` — route handlers open no DB
    // connections themselves; data access goes through infrastructure
    // clients/services. (.rpc() call sites are additionally guarded by the
    // vitest RPC boundary test; the two service-role routes below are the
    // documented M4 exceptions and are excluded.)
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: [
      'src/app/api/bulk-action/**',
      'src/app/api/audit/cleanup-duplicate-seqs/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/infrastructure/supabase/admin', '@/infrastructure/supabase/admin/*'],
            message:
              'service_role containment: only app/api/bulk-action and app/api/audit/cleanup-duplicate-seqs are documented privileged routes. Route the operation through infrastructure instead.',
          },
          {
            group: ['@supabase/*'],
            allowTypeImports: true,
            message:
              'routes must not open DB connections: use createServerClient()/infrastructure services (type-only imports are allowed).',
          },
        ],
      }],
    },
  },
  {
    // `features ↛ service_role` and no direct Supabase SDK in UI code:
    // features reach data through adapter hooks/actions or
    // container.supabase (the browser client) — never the SDK directly.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/infrastructure/supabase/admin', '@/infrastructure/supabase/admin/*'],
            message:
              'features ↛ service_role: createAdminClient() bypasses all RLS and must stay inside infrastructure/ (plus the two documented privileged API routes).',
          },
          {
            group: ['@supabase/*'],
            allowTypeImports: true,
            message:
              'features must not import the Supabase SDK; use container.supabase / adapter hooks (type-only imports are allowed).',
          },
        ],
      }],
    },
  },
];
