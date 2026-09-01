# CLAUDE.md — EduZone Admin Dashboard

> **Quick Context:** Multi-tenant LMS admin dashboard.  
> Stack: Next.js 15 (App Router) · Supabase (PostgreSQL 16) · TypeScript 5 (strict) · Turborepo monorepo  
> Locale: Arabic (RTL) + English (LTR) via `next-intl`

---

## 📂 Monorepo Layout

```
eduzone/                          # pnpm workspace + Turborepo
├── apps/
│   └── admin/                    # Main Next.js 15 app (@eduzone/admin)
│       ├── src/
│       │   ├── app/              # Next.js App Router (locale-based: [locale]/)
│       │   │   ├── [locale]/     # Pages: courses, users, analytics, audit, settings…
│       │   │   └── api/          # Route handlers: cron, proxy-asset, video
│       │   ├── domain/           # Types, Zod schemas, constants, domain services
│       │   ├── application/      # Use cases, ports (IEventBus, ILogger, ITracer)
│       │   ├── infrastructure/   # Supabase clients, repos (services), RPC, event-bus
│       │   ├── contracts/        # Versioned API contracts (common, rpc)
│       │   ├── adapters/         # React Query hooks/mutations, Zustand stores, forms
│       │   ├── features/         # Feature slices (14 total — see below)
│       │   ├── components/       # Shared UI (Button, Card, Modal, Select, etc.)
│       │   ├── config/           # nav.config.ts (route ↔ role mapping)
│       │   ├── i18n/             # routing.ts (locales: en, ar)
│       │   ├── lib/              # Env validation (Zod), hash-chain, direction utils
│       │   └── container.ts      # DI container (singleton Supabase, logger, eventBus)
│       ├── messages/             # i18n JSON: ar.json, en.json
│       ├── tests/                # E2E tests (Playwright + Cypress)
│       └── .storybook/           # Storybook config
├── packages/
│   ├── ui/                       # Shared component library (@eduzone/ui)
│   ├── types/                    # Shared TypeScript types (@eduzone/types)
│   ├── utils/                    # Shared utilities (@eduzone/utils)
│   ├── config/                   # Shared ESLint/TS/Tailwind configs (@eduzone/config)
│   ├── core/                     # Core business logic (tests)
│   ├── auth/                     # Auth package (empty — logic lives in features/auth)
│   └── db/                       # Database package (empty — schema lives in supabase/schema/)
├── supabase/
│   ├── functions/                # Edge Functions (Deno): bulk-action, bulk-export, create-user…
│   ├── schema/                   # Canonical schema — 01_extensions.sql … 11_seed_reference.sql,
│   │                             #   applied in supabase/config.toml schema_paths order. Single
│   │                             #   source of truth: no migrations, patches, or external SQL.
│   ├── _archived_patches/        # Retired/superseded SQL kept for history only — never applied
│   ├── migrations/               # Not used for schema changes (see supabase/schema/ above)
│   └── config.toml               # Local Supabase config
├── project_documents/            # Architecture docs, PRD, API design, implementation plan
└── scripts/                      # Migration validators, security tools
```

---

## 🏛️ Architecture — Clean Architecture Layers

The admin app follows strict **Clean Architecture** with dependency rules:

```
Domain → Application → Infrastructure → Adapters → Features → App (pages)
```

| Layer              | Path                  | Responsibility                                                                         |
| ------------------ | --------------------- | -------------------------------------------------------------------------------------- |
| **Domain**         | `src/domain/`         | Types (`*.types.ts`), Zod schemas (`*.schema.ts`), constants, pure services            |
| **Application**    | `src/application/`    | Use cases, port interfaces (`IEventBus`, `ILogger`, `ITracer`), event handlers         |
| **Infrastructure** | `src/infrastructure/` | Supabase clients (browser/server/middleware), repository services, RPC, event-bus impl |
| **Adapters**       | `src/adapters/`       | React Query queries/mutations, Zustand stores, form adapters, hooks                    |
| **Features**       | `src/features/`       | Feature slices with components (UI) — each feature is self-contained                   |
| **Components**     | `src/components/`     | Shared, feature-agnostic UI primitives                                                 |

### Dependency Injection

`container.ts` is the **sole wiring point** — lazy Supabase client, logger, tracer, eventBus, and auth context:

```typescript
import { container } from '@/container';
const supabase = container.supabase; // singleton browser client
```

---

## 🚀 Commands

### Development

```bash
pnpm install                    # Install all workspace deps
pnpm dev                        # Start all apps (turbo dev) — admin on :3000
pnpm build                      # Production build all apps
pnpm lint                       # ESLint across workspace
pnpm typecheck                  # tsc --noEmit across workspace
pnpm format                     # Prettier format all files
```

### Admin App Only (from `apps/admin/`)

```bash
pnpm dev                        # next dev --turbopack --port 3000
pnpm test                       # Vitest (unit + storybook projects)
pnpm test:coverage              # Vitest with V8 coverage
pnpm test:e2e                   # Playwright E2E
pnpm test:e2e:ui                # Playwright interactive UI
pnpm cypress:open               # Cypress interactive
pnpm storybook                  # Storybook on :6006
```

### Supabase

```bash
supabase start                  # Local Supabase stack (Docker)
supabase db reset               # Reset + apply migrations + seed
```

---

## 🧩 Feature Slices

Each feature under `src/features/` follows the pattern:

```
features/<name>/
├── components/     # Feature-specific React components
├── stores/         # Optional feature-local Zustand stores
└── index.ts        # Barrel export
```

| Feature         | Description                                                | Roles       |
| --------------- | ---------------------------------------------------------- | ----------- |
| `dashboard`     | Stats cards, recent activity, overview                     | all         |
| `courses`       | CRUD, curriculum builder (sections/lessons), import/export | all         |
| `users`         | User management, bulk ops, devices, sessions               | admin+      |
| `auth`          | Login, session check, role-based guards                    | all         |
| `analytics`     | Charts, registration trends, geographic data               | admin+      |
| `settings`      | System settings, maintenance mode                          | admin+      |
| `tenants`       | Multi-tenant management                                    | super_admin |
| `audit`         | Audit log viewer, hash-chain verification                  | super_admin |
| `jobs`          | Background job queue monitoring                            | super_admin |
| `notifications` | In-app notification system                                 | all         |
| `warnings`      | User warning management                                    | all         |
| `activities`    | Activity log browser                                       | admin+      |
| `teacher`       | Teacher-specific course/student views                      | teacher     |
| `layout`        | Sidebar, header, AdminShell, navigation                    | all         |
| `admin`         | Admin-specific views                                       | admin+      |

---

## 🔑 Key Patterns & Conventions

### TypeScript

- **Strict mode** with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- Path alias: `@/` → `apps/admin/src/`
- Bracket-notation for env: `process.env['NEXT_PUBLIC_SUPABASE_URL']`
- Zod for all runtime validation (env vars, form inputs, API contracts)

### State Management

- **Server state:** React Query v5 (`@tanstack/react-query`)
  - Query key factory in `adapters/queries/keys.ts` — always use `queryKeys.*`
  - Queries in `adapters/queries/*.queries.ts`
  - Mutations in `adapters/mutations/*.mutations.ts`
- **Client state:** Zustand v5
  - Stores in `adapters/stores/` — `auth.store.ts`, `ui.store.ts`, `toast.store.ts`, `realtime.store.ts`
- **URL state:** `nuqs` for search param synchronization

### Supabase Integration

- **Three client variants** — never mix them:
  - `infrastructure/supabase/client.ts` → Browser (singleton, `createBrowserClient`)
  - `infrastructure/supabase/server.ts` → Server Components/Route Handlers (`createServerClient`)
  - `infrastructure/supabase/middleware.ts` → Next.js middleware (`updateSession`)
- **Repository services** in `infrastructure/repos/` — all DB access goes through `*.service.ts`
  - `courses.service.ts` (28KB — largest), `users.service.ts`, `analytics.service.ts`, etc.
- **RLS enforced** on all tables — tenant isolation via JWT `tenant_id` claim
- **Never** use `service_role` key in browser code

### Internationalization (i18n)

- `next-intl` v4 with App Router
- Locales: `en` (LTR), `ar` (RTL)
- Messages: `apps/admin/messages/{en,ar}.json`
- Routing: `src/i18n/routing.ts` — locale-prefixed URLs (`/en/courses`, `/ar/courses`)
- RTL support: CSS fixes in `globals.css`, `lib/direction.ts`, `stylis-plugin-rtl` for MUI

### UI & Styling

- **MUI v5** (`@mui/material`) — primary component library
- **Tailwind CSS v4** — utility styling, design tokens in `globals.css`
- **Custom theme** with dark/light modes (`data-theme` attribute, `next-themes`)
- Design tokens: HSL-based color system, layout tokens (`--sidebar-width`, `--header-height`)
- Shared UI primitives in `components/ui/` — Button, Card, Modal, Drawer, Select, etc.
- Storybook for component documentation

### Role-Based Access Control (RBAC)

Three roles: `super_admin` > `admin` > `teacher`

- Route guard: `nav.config.ts` maps routes → allowed roles
- Component guard: `<PermissionGate>` wrapper
- Hook: `usePermission()` in `adapters/hooks/`
- DB enforcement: RLS policies + SECURITY DEFINER RPCs

### Testing

- **Unit:** Vitest + jsdom + React Testing Library
- **Stories:** Storybook v10 + `@storybook/addon-vitest` (browser tests via Playwright)
- **E2E:** Playwright (`playwright.config.ts`) + Cypress (`cypress.config.ts`)
- Coverage thresholds: Lines 80%, Branches 55%, Functions 70%, Statements 80%
- Test files: `*.test.ts` / `*.test.tsx` colocated with source

### Error Monitoring

- **Sentry** (`@sentry/nextjs`) — client, server, and edge configs
- Configs: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`

---

## 📁 Important Files

| File                                       | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `container.ts`                             | DI wiring — singleton Supabase, logger, eventBus                  |
| `middleware.ts`                            | Auth guard + i18n routing composition                             |
| `config/nav.config.ts`                     | Navigation items with role-based access                           |
| `adapters/queries/keys.ts`                 | React Query key factory                                           |
| `infrastructure/repos/courses.service.ts`  | Course CRUD, curriculum, sections, lessons                        |
| `lib/env.ts`                               | Zod-validated environment variables                               |
| `app/globals.css`                          | Design tokens, RTL fixes, Tailwind theme                          |
| `i18n/routing.ts`                          | Locale definitions and navigation helpers                         |
| `supabase/schema/`                         | Canonical production database schema (11 files, applied in order) |
| `project_documents/implementation_plan.md` | Full implementation roadmap                                       |

---

## 🗄️ Database Schema (v13)

The canonical schema (`supabase/schema/`, 11 files — 01_extensions.sql through
11_seed_reference.sql, plus VALIDATION.sql — applied in the order listed in
`supabase/config.toml`'s `schema_paths`) defines:

- **Multi-tenant** with `tenant_id` on all tables
- **RLS** enforced on every table — policies check JWT claims
- **SECURITY DEFINER** RPCs for privileged operations
- **Materialized views** for analytics dashboards
- **Audit log** with cryptographic hash-chain immutability
- **pg_cron** scheduled maintenance jobs

Key tables: `users`, `courses`, `sections`, `lessons`, `lesson_contents`, `enrollments`, `course_progress`, `audit_logs`, `tenants`, `feature_flags`, `system_settings`, `warnings`, `notifications`

---

## ⚠️ Gotchas & Critical Rules

1. **Tenant context is mandatory** — All Supabase mutations must have valid `tenant_id` in JWT. The DB function `assert_tenant()` will reject requests without it.

2. **Never import infrastructure from domain** — Clean Architecture dependency rule is strictly enforced. Domain knows nothing about Supabase.

3. **Always use `queryKeys.*`** — Never hardcode React Query keys. Use the factory in `adapters/queries/keys.ts`.

4. **i18n keys must exist in both `ar.json` AND `en.json`** — Missing keys will render the raw key string in production.

5. **RTL layout** — Any new CSS/components must be tested in both LTR (English) and RTL (Arabic) modes. Use logical properties (`margin-inline-start` vs `margin-left`).

6. **MUI + Tailwind coexistence** — MUI is the primary component system. Tailwind handles layout/spacing. Dark mode uses `data-theme` attribute (not `class`).

7. **Env vars** — Access through `lib/env.ts` validated schema, or use bracket notation `process.env['KEY']` (never dot notation due to strict TS config).

8. **Supabase client selection**:
   - Client Component → `container.supabase` (browser client)
   - Server Component/Route Handler → `createServerClient()` from `infrastructure/supabase/server.ts`
   - Middleware → `updateSession()` from `infrastructure/supabase/middleware.ts`

9. **Package manager** — `pnpm` only (v10.32.1+). Do not use npm or yarn.

10. **Import order** — ESLint enforces: builtins → external (React first) → internal, with alphabetical sorting and blank lines between groups.

---

## 📝 Code Style

- **Prettier:** single quotes, semicolons, trailing commas, 100 char width, LF line endings
- **ESLint:** `@typescript-eslint/recommended` + import ordering
- **Commits:** Conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- **Branches:** `feature/P{phase}-{MODULE}-{number}-{description}` (e.g., `feature/P3-COURSE-007-curriculum-builder`)

---

## 🌐 Edge Functions (Supabase)

Located in `supabase/functions/` (Deno runtime):

| Function        | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `bulk-action`   | Execute bulk operations (delete, suspend, etc.) |
| `bulk-export`   | Export data as CSV/JSON                         |
| `bulk-worker`   | Background worker for long-running bulk jobs    |
| `create-user`   | Admin user creation (bypasses client-side auth) |
| `export-report` | Generate and export analytics reports           |

Shared utilities in `supabase/functions/_shared/`.
