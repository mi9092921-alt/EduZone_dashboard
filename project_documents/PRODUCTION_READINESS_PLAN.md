# EduZone Dashboard — Production Readiness Plan

**Assessment date:** 2026-08-28  
**Scope:** repository, application source, Supabase schema/configuration, tests, CI/CD, and production operations artifacts  
**Decision:** **NO-GO**. The repository is not yet demonstrably production-ready.

## 1. Executive Summary

EduZone is an active pnpm/Turborepo monorepo containing a Next.js admin application, shared packages, Supabase schema SQL, Edge Functions, unit tests, Playwright/Cypress suites, and operational documentation. The implementation has meaningful security intent (RLS SQL, SECURITY DEFINER functions, server-side clients, Sentry, audit/hash-chain code), but intent and documentation are not proof of runtime safety.

The current release is blocked by:

- the production test command failing with multiple unit-test failures, unhandled fetch errors, and Vitest worker timeouts;
- lint not completing successfully (`next lint` is deprecated and the run ended with an ESLint/Next integration warning);
- the production build compiling but failing during the subsequent lint/type-validation stage;
- privileged API routes using `service_role` and broad `any` types without a uniform authorization/validation boundary;
- a cron endpoint that accepts requests without a secret outside production and returns internal error messages;
- schema files being configured as migration inputs while `supabase/migrations` contains only a README, leaving migration history/rollback semantics unproven;
- CI not running E2E, integration, RLS/tenant-isolation, migration, dependency-vulnerability, or restore verification gates;
- local ignored environment data containing real-looking Supabase service-role, anon, YouTube, and Sentry credentials. These must be treated as exposed and rotated, even though the file is not tracked.

No P0/P1 item should be closed from documentation, file presence, or a successful TypeScript check alone.

## 2. Current Architecture

### Repository shape

The repository is a pnpm workspace with `apps/*` and `packages/*`, orchestrated by Turborepo. The main runtime is `apps/admin`; shared packages are `@eduzone/types`, `@eduzone/ui`, `@eduzone/utils`, and a mostly empty `@eduzone/config`. Supabase SQL is split into ordered files under `supabase/schema`, while Edge Functions are under `supabase/functions`.

### Runtime flow

`middleware.ts` composes next-intl routing and Supabase session refresh. Localized App Router pages live under `src/app/[locale]`. Data access is distributed across adapters, repositories, Supabase clients, RPCs, route handlers, Edge Functions, and browser-side query/mutation hooks. This is a layered design in practice, but it is not yet enforced by automated dependency rules.

### Database flow

The schema uses public/private/internal/audit/maintenance concerns, SQL functions, RLS, grants, triggers, views, indexes, and validation SQL. The configured `supabase/config.toml` treats the schema files as migration inputs, but there is no normal migration sequence in `supabase/migrations`.

## 3. Verified Current State

| Area | Status | Evidence |
|---|---|---|
| pnpm/Turborepo workspace | VERIFIED | `package.json`, `pnpm-workspace.yaml`, `turbo.json` |
| App Router/locales | VERIFIED | `apps/admin/src/app/[locale]/*` exists |
| Supabase schema artifacts | VERIFIED | ordered `supabase/schema/*.sql`, validation SQL |
| TypeScript check | VERIFIED (local run) | `pnpm.cmd typecheck`: 4 tasks successful |
| Shared-package lint | BROKEN/MISSING | package scripts literally run `echo 'No lint configured yet'` |
| Admin lint | BROKEN/NOT VERIFIED | `next lint` deprecated; run did not complete successfully |
| Unit/storybook test command | BROKEN | failures, unhandled `Failed to fetch`, worker timeouts; run took about 9m38s |
| Production compilation | PARTIALLY VERIFIED | Next reported `Compiled successfully`; overall `pnpm.cmd build` exited 1 during lint/type validation |
| E2E execution in CI | MISSING | `.github/workflows/ci.yml` has no Playwright/Cypress step |
| Integration/RLS tests in CI | MISSING | no database service, seeded test project, or isolation matrix in CI |
| Migration history | MISSING/RISK | `supabase/migrations` contains only README |
| Live RLS behavior | NOT VERIFIED | only source SQL/validation files were inspected; no two-tenant live test completed |
| Secret hygiene | RISK | ignored local env contains populated privileged credentials; no rotation evidence |
| Observability | PARTIALLY VERIFIED | Sentry configuration exists; request/correlation/alert/recovery verification is absent |

## 4. Production Readiness Score

This score is a risk-oriented snapshot, not a release approval. It is weighted toward runtime evidence and release controls.

| Dimension | Score | Reason |
|---|---:|---|
| Architecture | 6/10 | Layered folders exist; boundaries are not enforced and UI/API code contains broad casts and duplicated authorization logic |
| Security | 4/10 | Security mechanisms exist, but privileged routes, CORS, secrets, and error exposure require hardening and tests |
| Data Integrity | 5/10 | Constraints/functions/validation SQL exist; migration history and concurrency verification are incomplete |
| Authentication | 6/10 | Supabase SSR refresh and auth guard exist; API route coverage and revocation/expiry evidence are incomplete |
| Authorization | 4/10 | UI permission helpers exist, but route/RPC/worker consistency is not proven; bulk route has local role logic |
| Multi-Tenancy | 4/10 | tenant fields and RLS are present in source; no executable cross-tenant attack matrix is passing |
| Performance | 5/10 | indexes, MVs, pagination, and package optimization exist; bundle/query/load measurements are absent |
| Testing | 2/10 | significant unit failures and unhandled network calls; no CI E2E/integration/security gate |
| Observability | 4/10 | Sentry and logging exist; request IDs, dashboards, SLOs, alerts, and runbooks are not verified |
| CI/CD | 3/10 | basic CI/deploy workflows exist; tool versions differ and release gates/rollback are incomplete |
| UX | 6/10 | loading/error/RTL-oriented components exist; full responsive and critical-flow acceptance is unverified |
| Accessibility | 5/10 | axe/Storybook tooling exists; automated suite is not a passing release gate |
| Documentation | 5/10 | extensive design docs exist, but source-vs-doc drift and operational evidence remain |
| Operations | 3/10 | backup/restore and rollback documents exist; executable restore drill and production proof are missing |
| **Overall** | **4.3/10 (43/100)** | **NO-GO until P0/P1 work and release-gate evidence are complete** |

## 5. Critical Findings

### P0-SEC-001 — Privileged credentials require immediate rotation

- **Status:** RISK / P0
- **Symptom:** ignored `apps/admin/.env.local` contains populated service-role, anon, YouTube, and Sentry values; test output also emitted an anon JWT.
- **Root cause:** local credentials are used by runtime/tests and are not protected by a verified secret-scanning and rotation process.
- **Impact:** service-role compromise bypasses RLS and can modify/read all data; third-party keys may incur abuse or data exposure.
- **Files:** `apps/admin/.env.local`, `.gitignore`, test/storybook configuration.
- **Required change:** revoke/rotate all affected keys; audit git history, CI logs, artifacts, screenshots, and Sentry; replace test fixtures with unmistakable fake values; add secret scanning and a documented rotation procedure.
- **Validation:** secret scan over current tree/history and CI artifacts; confirm old keys fail and least-privilege replacement keys work.

### P0-REL-001 — Release verification is red

- **Status:** BROKEN / P0
- **Evidence:** `pnpm.cmd test` failed with multiple failing suites, unhandled fetch rejections, and Vitest worker startup timeouts. `pnpm.cmd build` compiled then exited 1 during lint/type validation. `pnpm.cmd lint` did not complete successfully.
- **Impact:** invalid code can pass or release; failures are too slow and noisy to diagnose reliably.
- **Required change:** separate unit and Storybook browser projects, make network calls impossible in unit tests, fix failing assertions/mocks, cap worker/resource usage, migrate lint to ESLint CLI, and make build/lint/typecheck deterministic.
- **Validation:** clean install followed by all commands with exit code 0 and stored CI artifacts.

### P0-DB-001 — Schema source of truth and rollback are unproven

- **Status:** MISSING / P0
- **Evidence:** `supabase/config.toml` lists `supabase/schema/*.sql` as migration inputs; `supabase/migrations` has only README.
- **Impact:** deploys may not be repeatable, migration ordering may differ from local state, and rollback/data-loss behavior is undefined.
- **Required change:** establish one canonical migration chain, split seed/reference data, add forward/backward safety rules, and require `supabase db reset`, `db lint`, diff, and staging push in CI.
- **Validation:** reset from empty database, apply migrations twice, compare schema fingerprint, run rollback/forward rehearsal on a disposable clone.

### P0-TEN-001 — Tenant isolation is not an executable release gate

- **Status:** NOT VERIFIED / P0
- **Evidence:** RLS and tenant helpers exist in SQL, but no passing two-tenant matrix was run through direct tables, RPC, route handlers, exports, jobs, search, analytics, and realtime.
- **Impact:** a single OR policy, service-role query, cache key, or worker bug can disclose another tenant’s data.
- **Required change:** create seeded Tenant A/B security tests and enforce tenant context at every boundary; prohibit client-supplied tenant override except for explicitly authorized super-admin operations.
- **Validation:** authenticated A/B negative tests return zero rows/403 for every listed path; repeat with direct RPC/API calls, not just UI.

## 6. Security Findings

| ID | Priority | Status | Evidence / risk | Required action | Verification |
|---|---|---|---|---|---|
| P0-SEC-001 | P0 | RISK | populated ignored credentials and JWT emitted by tests | rotate, history/artifact scan, fake fixtures | old credentials revoked; gitleaks/secret scan clean |
| P1-SEC-002 | P1 | BROKEN | `api/cron/routine/route.ts:13-16` skips secret enforcement when `NODE_ENV !== production` | require a non-empty constant-time secret in every environment; fail closed; use dedicated worker auth | unauthenticated/malformed requests always 401 |
| P1-SEC-003 | P1 | RISK | cron uses service-role client at module scope and returns `err.message` at `:179-184` | lazy-load server-only client, generic external errors, structured internal logs | response contains no DB/function details |
| P1-SEC-004 | P1 | RISK | `next.config.ts:18-22` and proxy routes allow `Access-Control-Allow-Origin: *` | restrict origins and methods/headers; require auth for media proxy | browser-origin matrix and preflight tests |
| P1-SEC-005 | P1 | RISK | privileged bulk route uses direct service-role client and local role permission map | centralize authorization policy and tenant context; validate body with Zod | direct POST matrix for every role/action/tenant |
| P1-SEC-006 | P1 | NOT VERIFIED | SECURITY DEFINER/RLS SQL is extensive, but live policy semantics are not tested | run catalog checks plus adversarial SQL/RPC tests; lock search_path and grants | two-tenant and anonymous access suite passes |
| P2-SEC-007 | P2 | RISK | many `any` casts across API/UI/repositories | replace boundary types with generated DB types/Zod schemas | ESLint no-explicit-any policy with justified exceptions |
| P2-SEC-008 | P2 | PARTIALLY VERIFIED | CSP is present in Vercel config but uses `unsafe-inline`, `unsafe-eval`, broad HTTPS images, and wildcard-like Supabase sources | generate nonce-based CSP and documented exceptions | header scan plus XSS regression suite |
| P2-SEC-009 | P2 | NOT VERIFIED | CSRF, SSRF, upload/path traversal and rate-limit coverage not demonstrated | threat-model each route and add negative tests/rate limits | automated abuse tests and production limits observed |

## 7. Database Findings

The schema files provide substantial controls: RLS declarations, policies, SECURITY DEFINER functions, grants, constraints, indexes, triggers, views, and `VALIDATION.sql`. This is **PARTIALLY VERIFIED**, not a claim that the deployed database is safe.

Required database work:

1. Create canonical timestamped migrations from a clean baseline; do not use a mutable ordered schema directory as the only deployment history.
2. Add catalog assertions for every exposed table: RLS enabled/forced as intended, no unexpected grants to `anon`, safe SECURITY DEFINER owner/search_path, and explicit function execute grants.
3. Build a Tenant A/B fixture with users, courses, enrollments, notifications, audit rows, jobs, analytics, and storage objects.
4. Test direct SELECT/INSERT/UPDATE/DELETE, RPC, Edge Functions, Next route handlers, exports, bulk operations, search, analytics, job workers, and realtime filters.
5. Add unique/check/FK/index review tied to actual query plans and concurrency tests. Verify soft-delete predicates cannot be bypassed by RPC or exports.
6. Separate reference seed data from production migrations and document safe/destructive migration classes.

## 8. Architecture Findings

The intended flow Domain → Application → Infrastructure → Adapters → Features → App is represented by folders, but there is no import-boundary enforcement. Current risks include business/permission logic duplicated in UI, route handlers, and repositories; direct service-role use in route handlers; `any` at infrastructure boundaries; and unclear ownership of server actions versus API/RPC operations.

### Required refactor sequence

- Define allowed import graph with ESLint boundaries or dependency-cruiser.
- Introduce a single authorization service/port returning typed decisions and tenant context.
- Introduce typed server-only admin gateway for the few operations requiring service-role, with audit and allowlisted operations.
- Keep domain/application code free of Next, Supabase, React, and browser globals.
- Move parsing and output contracts to shared Zod schemas; generate/derive types from one source.
- Remove dead Storybook/demo artifacts from production packages or explicitly classify them as test-only.

## 9. Performance Findings

No production bundle, Web Vitals, database EXPLAIN, or load-test baseline was captured. Therefore current bottlenecks are **NOT VERIFIED**. Likely scale risks are the notification fan-out loop in `api/cron/routine`, bulk exports/updates, analytics queries, 5,000-row audit verification, realtime subscriptions, and client-side MUI/Data Grid bundles.

Required measurements and actions:

- capture cold/warm route TTFB, LCP, INP, CLS, JS transfer and route bundle sizes;
- load-test list/search/export/bulk paths at 10, 1,000, and 10,000+ records;
- EXPLAIN critical queries, confirm tenant/filter/order indexes, and eliminate N+1 queries;
- enforce pagination, bounded exports, queue-based jobs, timeouts, idempotency, leases, and cancellation;
- include tenant and authorization scope in React Query keys and invalidate on logout/tenant switch;
- set SLOs and budgets before tuning.

## 10. Testing Findings

### Current evidence

- 25 unit test files, 3 Playwright specs, and 15 Cypress specs exist.
- Vitest runs a Storybook browser project alongside unit tests; the run produced unhandled network failures, multiple failing suites, worker timeouts, and React `act(...)` warnings.
- Tests observed unhandled requests to Supabase and multiple GoTrueClient instances, demonstrating test isolation problems.
- E2E suites are not part of the CI workflow.

### Required test pyramid

- **Unit:** domain rules, permission decisions, parsers, hash-chain canonicalization, retry/idempotency logic; no network.
- **Integration:** repositories against disposable Supabase/Postgres, RPC signatures, RLS policies, auth/session/token-version behavior.
- **Security:** Tenant A/B, anonymous, role escalation, direct API/RPC, export/bulk/realtime/storage paths.
- **E2E:** login/logout/refresh, role access, CRUD, destructive confirmation, critical teacher/admin flows, Arabic/English/RTL, responsive smoke.
- **Accessibility:** axe plus keyboard/focus/modal/contrast checks on representative workflows.
- **Regression:** every fixed P0/P1 gets a permanent test and fixture.

## 11. CI/CD Findings

`ci.yml` installs, scans secrets, typechecks, lints, runs Vitest coverage, builds, and runs Supabase DB lint. It does not run E2E, integration/RLS tests, migration reset/diff/push against a disposable database, dependency audit, or deployment smoke tests. `deploy.yml` uses pnpm 9 while the repository declares pnpm 10.32.1, deploys Vercel before database migrations, and has no explicit rollback/health-check gate.

Required pipeline:

1. pin Node, pnpm, Supabase CLI, Playwright browsers, and lockfile versions;
2. install with `--frozen-lockfile`;
3. secret scan and dependency audit with a reviewed exception policy;
4. ESLint, typecheck, unit, integration, security/RLS, accessibility, E2E, build;
5. validate migrations on empty and representative databases;
6. deploy database backward-compatible changes before application where required;
7. deploy app, run health and smoke checks, then promote;
8. publish artifacts, metrics, release ID, and rollback instructions.

## 12. UX & Accessibility Findings

Arabic/English messages, next-intl routing, RTL utilities, Storybook, and axe dependencies are present. This is **PARTIALLY VERIFIED** only. No complete keyboard/focus/contrast/responsive run passed in this audit. Validate mobile/tablet/desktop, loading/empty/error/disabled states, destructive confirmation, pagination/filtering, modal focus trapping, screen-reader labels, logical CSS directions, date/number formatting, and locale fallback behavior.

## 13. Documentation Findings

Existing documents are useful design intent but must be reconciled with source and runtime evidence. Add a drift register to every release, documenting the exact command/date/environment for each claim. Mark RLS, RBAC, audit integrity, monitoring, backup/restore, and CI claims as VERIFIED only when their executable checks and artifacts exist.

## 14. Risk Register

| Risk | Severity | Likelihood | Owner | Mitigation / exit evidence |
|---|---|---:|---|---|
| credential compromise | P0 | High | Security | rotate/revoke, history/artifact scan, clean secret scan |
| cross-tenant disclosure | P0 | Medium/High | Backend/DB | A/B adversarial matrix passes on all boundaries |
| red test/build gate | P0 | Certain | QA/Platform | deterministic green CI from clean install |
| non-repeatable schema deploy | P0 | High | DB/DevOps | canonical migrations + reset/diff/rollback drill |
| unauthorized cron/bulk action | P1 | Medium | Backend | fail-closed auth, centralized policy, route tests |
| sensitive error/CORS exposure | P1 | Medium | Security | generic errors, origin allowlist, header tests |
| worker duplicate/partial processing | P1 | Medium | Backend | idempotency keys, leases, retries, reconciliation |
| missing incident diagnosis | P1 | Medium | Operations | request IDs, Sentry alerts, dashboards, runbook drill |
| performance collapse at scale | P2 | Medium | Platform | load baseline and bounded operations |
| RTL/a11y regression | P2 | Medium | Frontend | automated locale/a11y/responsive suite |

## 15. Root Cause Clusters

1. **Release evidence gap:** documentation and test files exist, but CI does not prove the critical claims.
2. **Boundary duplication:** authorization, tenant filters, and service-role access are implemented in multiple layers without a single policy contract.
3. **Environment/tool drift:** pnpm versions differ; Next lint and Sentry integrations are deprecated; Vitest browser/unit versions are mismatched.
4. **Database lifecycle gap:** schema SQL is detailed, but migration history, rollback, and live isolation tests are absent.
5. **Test isolation gap:** Storybook browser tests and unit tests share a run with real-looking Supabase configuration and unhandled network requests.

## 16. Complete Implementation Plan

Each task below includes the required execution contract.

### Phase 0 — Blockers

#### P0-SEC-001 — Rotate and contain credentials

- **Problem/Root Cause:** local/test credentials are populated and leakage is possible through logs/artifacts.
- **Evidence/Files:** ignored `.env.local`, test output, `.gitignore`.
- **Required Change:** rotate all affected keys; fake test env; scan history/CI; document ownership and rotation.
- **Dependencies/Risk:** provider access; rotation can temporarily interrupt local/deployed clients.
- **Validation:** old keys rejected; new keys work only in intended contexts; scan clean.
- **Acceptance/DoD:** no live credential in tracked files, logs, screenshots, reports, or fixtures; approved rotation record.

#### P0-REL-002 — Restore deterministic release commands

- **Problem/Root Cause:** lint/test/build are red or non-deterministic.
- **Files:** root scripts, `apps/admin/package.json`, `vitest.config.ts`, ESLint config, CI.
- **Required Change:** migrate to ESLint CLI; align Vitest/browser versions; isolate Storybook tests; fix all failing tests and unhandled fetches.
- **Validation:** clean `pnpm install --frozen-lockfile`; lint, typecheck, unit, coverage, and build exit 0.
- **Acceptance/DoD:** CI green twice from clean runners; no unhandled errors or worker timeouts.

#### P0-DB-003 — Establish canonical migrations

- **Required Change:** baseline ordered migrations, separate seeds, add migration checksums and backward-compatible deployment policy.
- **Validation:** empty reset, repeat application, schema diff, staging push, rollback rehearsal.
- **Acceptance/DoD:** a new agent can create the same database from an empty instance using one documented command sequence.

#### P0-TEN-004 — Prove tenant isolation

- **Required Change:** seeded A/B matrix for every table/RPC/API/worker/export/realtime/storage path.
- **Validation:** direct and UI-independent negative tests; zero cross-tenant rows and writes.
- **Acceptance/DoD:** report artifact includes role, tenant, path, expected denial, observed denial.

### Phase 1 — Security & Data Integrity

#### P1-SEC-005 — Centralize authorization and tenant context

- **Problem/Root Cause:** route-local permission maps and service-role paths can diverge from DB policy.
- **Files:** bulk route, mutations, permission hooks, RPC grants/policies.
- **Required Change:** typed policy port; server-side decision; explicit tenant context; deny-by-default.
- **Validation:** role/action/tenant matrix against direct POST/RPC and UI.
- **Acceptance/DoD:** no sensitive operation succeeds through a path absent from the central policy.

#### P1-SEC-006 — Harden cron, bulk, proxy, and error surfaces

- **Required Change:** fail-closed secrets, constant-time comparison, rate limits, origin allowlist, input/output schemas, generic responses, request IDs, bounded body/results.
- **Validation:** abuse tests for missing/invalid auth, oversized payloads, SSRF/CORS/open redirect, retries and duplicate requests.
- **Acceptance/DoD:** no internal error detail or privileged operation is reachable without verified authz.

#### P1-DB-007 — Validate RLS/functions/grants live

- **Required Change:** catalog assertions and adversarial SQL/RPC tests; audit every SECURITY DEFINER function’s search_path, owner, grants, and caller checks.
- **Validation:** Supabase local/staging tests with anon/authenticated/service-role roles.
- **Acceptance/DoD:** RLS and grant report is attached to release and all expected-deny cases pass.

#### P1-DATA-008 — Add integrity and concurrency guarantees

- **Required Change:** unique/check/FK/index review; transactions; idempotency keys; job leases; duplicate and concurrent write tests.
- **Validation:** race harness for enrollment, account control, audit append, bulk jobs, and notifications.
- **Acceptance/DoD:** duplicate/retry/concurrent scenarios produce one valid outcome and auditable failures.

### Phase 2 — Reliability

#### P1-REL-009 — Define safe error and retry behavior

- **Required Change:** typed error taxonomy, timeouts, bounded retries, retry-safe mutations, partial-failure reconciliation, user-safe messages.
- **Validation:** injected network/DB/RPC failures and offline/browser refresh scenarios.
- **Acceptance/DoD:** every critical flow has a tested success, timeout, permission, validation, and partial-failure state.

#### P1-OBS-010 — Make incidents diagnosable

- **Required Change:** structured logs, request/correlation/release IDs, Sentry server/edge/client separation, alerts, dashboards, PII redaction, audit event correlation.
- **Validation:** synthetic failed request traced end-to-end; alert fires and runbook resolves it.
- **Acceptance/DoD:** on-call can identify tenant-safe request context without reading secrets or PII.

#### P1-JOB-011 — Productionize background workers

- **Required Change:** formal job state machine, lease ownership, retry/backoff, dead-letter/replay, cancellation, idempotency, metrics, reconciliation.
- **Validation:** 10/1,000/10,000+ record load and forced worker crash tests.
- **Acceptance/DoD:** no duplicate side effects; stuck jobs are detected and recoverable.

### Phase 3 — Architecture

#### P2-ARCH-012 — Enforce dependency boundaries

- **Required Change:** import rules, typed ports, server-only admin gateway, remove infrastructure leakage from domain/features.
- **Validation:** dependency graph check in CI and targeted unit tests.
- **Acceptance/DoD:** forbidden imports fail CI; business rules run without Next/Supabase.

#### P2-ARCH-013 — Remove unsafe type escape hatches

- **Required Change:** replace boundary `any`, unsafe casts, and non-null env assertions with typed schemas and validated config.
- **Validation:** ESLint rules plus `tsc --noEmit`; justified exceptions are documented.
- **Acceptance/DoD:** no unreviewed `any` at API/auth/DB boundaries.

### Phase 4 — Performance

#### P2-PERF-014 — Establish budgets and optimize hot paths

- **Required Change:** route bundle/Web Vitals budgets, query plans, pagination, N+1 removal, bounded analytics/export, query-key isolation.
- **Validation:** repeatable Lighthouse/Web Vitals, bundle analyzer, EXPLAIN, and load reports.
- **Acceptance/DoD:** agreed budgets pass on representative data and p95 targets are documented.

### Phase 5 — Testing

#### P1-QA-015 — Build the release test matrix

- **Required Change:** unit/integration/E2E/security/a11y suites with no external network in unit tests and disposable DB fixtures.
- **Validation:** CI executes all suites and publishes reports/coverage.
- **Acceptance/DoD:** critical paths and every P0/P1 have passing regression tests.

### Phase 6 — UX / Accessibility

#### P2-UX-016 — Verify Arabic, English, RTL, responsive, and keyboard behavior

- **Required Change:** locale key parity, logical CSS, focus management, modal traps, error/loading/empty states, touch targets, contrast.
- **Validation:** Playwright locale/device matrix plus axe and keyboard scripts.
- **Acceptance/DoD:** no critical a11y/RTL defects; screenshots and automated report attached.

### Phase 7 — CI/CD & Deployment

#### P1-OPS-017 — Make CI a release gate

- **Required Change:** align versions, add integration/RLS/E2E/audit/migration checks, block deploy on failure, artifact retention.
- **Validation:** intentionally broken branch fails each relevant gate; valid branch passes.
- **Acceptance/DoD:** production deploy cannot bypass P0/P1 gates.

#### P1-OPS-018 — Define safe deployment and rollback

- **Required Change:** health checks, smoke tests, DB/app ordering, feature flags, Vercel rollback, migration recovery, release annotations.
- **Validation:** staging deployment failure and rollback drill.
- **Acceptance/DoD:** rollback completes within documented RTO without corrupting data.

### Phase 8 — Final Production Validation

#### P0-REL-019 — Execute release gate and sign-off

- **Required Change:** collect command logs, security/RLS artifacts, migration fingerprint, backup/restore proof, monitoring alert proof, locale/device results.
- **Validation:** independent reviewer reruns from clean checkout/environment.
- **Acceptance/DoD:** all gate items below are VERIFIED; otherwise status remains NO-GO.

## 17. Dependency Graph

```text
P0-SEC-001 ─┬─> P1-SEC-005 ─┬─> P1-DB-007 ─┬─> P0-TEN-004
            └─> P1-SEC-006  └─> P1-DATA-008 ┘

P0-DB-003 ────────────────> P1-DB-007 ─────> P1-QA-015
P0-REL-002 ───────────────> P1-QA-015 ─────> P0-REL-019
P1-REL-009 ─> P1-OBS-010 ─> P1-JOB-011 ───> P1-OPS-018
P2-ARCH-012 ─> P2-ARCH-013 ─> P2-PERF-014
P2-UX-016 ─────────────────────────────────> P0-REL-019
P1-OPS-017 ────────────────────────────────> P1-OPS-018 ─> P0-REL-019
```

## 18. Production Release Gate

Release is **GO only when every item is VERIFIED by an artifact**:

- clean frozen install;
- lint, typecheck, unit, integration, E2E, accessibility, security, and production build pass;
- no critical dependency/secret findings;
- no open P0/P1 risk;
- RLS, RBAC, tenant isolation, exports, jobs, and realtime verified;
- secrets rotated/validated and absent from logs/artifacts;
- migrations reset/apply/diff/rollback verified;
- backup restore and deployment rollback rehearsed;
- monitoring, alerting, request IDs, and runbooks exercised;
- Arabic, English, RTL, responsive, keyboard, and critical error states verified;
- production smoke test passes after deployment.

## 19. Verification Strategy

The independent verification pass must:

1. start from a clean checkout and frozen install;
2. compare this plan with actual source, generated artifacts, deployed schema, and workflow behavior;
3. rerun all release-gate commands and record exact versions, timestamps, environment class, and exit codes;
4. run Tenant A/B tests through direct database, RPC, route, Edge Function, UI, bulk, export, search, analytics, and realtime paths;
5. inspect logs and artifacts for secrets/PII leakage;
6. repeat the migration, restore, rollback, and incident drills;
7. mark each claim VERIFIED, PARTIALLY VERIFIED, NOT VERIFIED, BROKEN, MISSING, or RISK; never infer a pass from file existence.

## 20. Final Readiness Assessment

**Current state: NO-GO / 43 out of 100.** The project has a substantial implementation foundation and useful security/design artifacts, but the evidence does not support a production release. The immediate sequence is credential containment, deterministic green release commands, canonical migrations, and executable tenant/RLS authorization tests. Only after those blockers pass should reliability, architecture, performance, UX, and operational hardening be promoted through the release gate.

This document is a task-by-task handoff. A subsequent agent should execute it in phase order, attach evidence to each task, and update statuses rather than re-deriving the audit from documentation.
