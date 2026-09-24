# EduZone Admin Dashboard

This repository contains the Next.js admin application for the EduZone platform. The application is a multi-tenant management surface; this README describes the repository as it exists, not a production approval.

> **Current status (reviewed 2026-09-24):** source and test infrastructure are present. Runtime, staging, deployment, backup/restore, and external-service readiness are not established by this file alone. See [`project_documents/PRODUCTION_READINESS_PLAN.md`](project_documents/PRODUCTION_READINESS_PLAN.md).

## What is in the repository

The active application is [`apps/admin`](apps/admin). The source tree contains authenticated pages and supporting services for users, courses, tenants, analytics, audit/activity logs, settings, feature flags, jobs, notifications, warnings, and teacher course views. The route folders are under [`apps/admin/src/app/[locale]`](apps/admin/src/app/%5Blocale%5D).

The repository also contains:

- `packages/` — shared `config`, `types`, `ui`, and `utils` packages.
- `supabase/schema/` — the ordered SQL inputs named by [`supabase/config.toml`](supabase/config.toml).
- `supabase/functions/` — Edge Function entrypoints. Their presence is not proof that they are deployed or that external integrations are configured.
- `scripts/security/` — local security-test and verification tooling.
- `.github/workflows/` — CI, deployment-check, and Playwright workflows.

## Local development

Prerequisites are Node.js, pnpm `10.32.1` (the version declared in `package.json`), Docker/Supabase CLI when using the local database, and the environment values required by the admin app.

```powershell
pnpm install --frozen-lockfile
Copy-Item apps/admin/.env.local.example apps/admin/.env.local
pnpm dev
```

The app package starts on `http://localhost:3000`. For local Supabase work, use the repository's checked-in configuration and deployment helpers; do not assume that `supabase db reset` alone applies the ordered files in `supabase/schema/` because `supabase/migrations/` currently contains no SQL migration chain.

Environment templates are:

- [`apps/admin/.env.local.example`](apps/admin/.env.local.example) for local development.
- [`apps/admin/.env.test.example`](apps/admin/.env.test.example) for tests with placeholders only.

Never commit populated environment files or use the QA seed against a shared/staging/production database. See [`supabase/SETUP_GUIDE.md`](supabase/SETUP_GUIDE.md).

## Useful commands

These commands are declared by the workspace or the admin package:

```powershell
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm --filter @eduzone/admin test:e2e:ui
pnpm --filter @eduzone/admin storybook
```

The root scripts delegate to Turborepo where configured. The admin package also contains Cypress and Storybook scripts; their existence does not mean every suite runs in CI.

## Verification status

The repository includes seven Playwright spec files under `apps/admin/tests/e2e/` and fifteen Cypress spec files under `apps/admin/cypress/e2e/`. The Playwright workflow is conditional on the repository variable `E2E_ENABLED`; the current value and branch-protection settings must be checked on GitHub, not inferred from YAML. Unit, lint, typecheck, build, RLS, and tenant-isolation results are time-sensitive and must be recorded from the relevant run.

Source-level controls include Supabase Auth integration, RLS/permission SQL, server-side authorization paths, validation schemas, and service-role use in server infrastructure. These controls are not a claim that the deployed system is secure or production-ready.

## Database boundary

The development-stage canonical SQL source is the ordered set in `supabase/config.toml`, currently:

```text
01_extensions.sql
02_types.sql
03_tables.sql
04_constraints.sql
05_indexes.sql
07_functions.sql
06_views.sql
08_triggers.sql
09_rls.sql
10_permissions.sql
11_seed_reference.sql
```

`12_seed_qa_demo.sql` is a disposable QA/demo seed used explicitly by the local/E2E tooling; it is not in the canonical production-oriented `schema_paths` list. The database is documented as shared with `EduZone_App`; cross-repository compatibility must be checked before changing shared objects.

See [`supabase/schema/README.md`](supabase/schema/README.md), [`supabase/README.md`](supabase/README.md), and [`agent_prompt_eduzone_db.md`](agent_prompt_eduzone_db.md) for ownership and change-control rules.

## Documentation map

- [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md) — document ownership and current references.
- [`CLAUDE.md`](CLAUDE.md) — engineering and agent constraints.
- [`project_documents/PRODUCTION_READINESS_PLAN.md`](project_documents/PRODUCTION_READINESS_PLAN.md) — evidence ledger and open release gates.
- [`project_documents/FOUR_FEATURES_EXECUTION_PLAN.md`](project_documents/FOUR_FEATURES_EXECUTION_PLAN.md) — proposed feature work; not an implementation report.
- [`project_documents/GOOGLE_DRIVE_VIDEO_PLAN.md`](project_documents/GOOGLE_DRIVE_VIDEO_PLAN.md) — proposed integration; not evidence of an implemented Drive integration.
- [Production Architecture Execution Plan](EduZone%20Dashboard%20%E2%80%94%20Production%20Architecture%20Execution%20Plan.md) — architecture roadmap and historical milestone references.

Reference specifications under `project_documents/` describe intended requirements or historical decisions. They must not override source code, configuration, tests, or current runtime evidence.
