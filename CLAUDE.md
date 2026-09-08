# EduZone Dashboard — AI Engineering Guide

**Repository:** `mi9092921-alt/EduZone_dashboard`
**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`
**Reviewed:** 2026-09-08
**Package manager:** `pnpm@10.32.1`

## 1. Source of truth

When documentation conflicts with source code, configuration, tests, or Git history:

```text
Current source/configuration > executable test evidence > recent Git history > documentation
```

Do not close a task because a document says it is complete.

Use the loop:

```text
Check → Think → Modify → Verify → Repeat
```

## 2. Repository shape

The runtime application is `apps/admin`. Shared packages live under `packages/`. Database and Edge Function assets live under `supabase/`.

The application source contains:

```text
src/app
src/application
src/adapters
src/domain
src/features
src/infrastructure
src/components
src/config
src/i18n
src/lib
src/architecture
src/container.ts
src/middleware.ts
```

This is a practical layered/feature-oriented structure. Folder names alone do not prove dependency compliance.

## 3. Dependency rules

Preferred direction:

```text
app / components
  → feature / adapter
  → application
  → infrastructure
  → external systems
```

Domain code should not depend on Next.js, React, browser globals, or Supabase clients.

Application ports/use cases should not embed concrete infrastructure implementations.

Routes and server actions should remain boundary adapters rather than becoming repositories or large business-logic modules.

## 4. Request context

Current `src/container.ts` is dependency wiring and does not contain the old documented mutable `actorId` / `tenantId` globals.

Do not reintroduce mutable singleton request state.

Request identity and tenant context must be derived from trusted server/auth context and passed explicitly where required.

## 5. Authorization

`src/application/authorization/policy.ts` is a shared role-permission fast path. It is **partial centralization**, not proof of a complete authorization service.

For privileged operations:

```text
authenticate
→ authorize
→ validate resource/tenant scope
→ execute use case
→ access infrastructure
```

Never rely on UI permission checks as the security boundary.

## 6. Service-role rule

`service_role` is privileged infrastructure.

Treat every service-role usage as an explicit security boundary. Before changing or adding one:

- identify the caller;
- identify why elevated privileges are necessary;
- validate the request;
- authorize the operation;
- enforce tenant/resource scope;
- prevent secrets from entering browser bundles/logs/errors.

Do not create a broad, caller-controlled “generic admin client” abstraction.

## 7. Database rule

`supabase/schema/*.sql` is the development-stage canonical schema source represented by `supabase/config.toml`.

The database is shared with `EduZone_App`.

Before changing a table/function/RPC/policy:

```text
search dashboard usages
search student-app usages
search SQL references
search tests
search Edge Functions
search documentation
verify the final references
```

Do not introduce a second active schema source.

## 8. Verification expectations

For every security/data-affecting change, distinguish:

```text
Static/source verification
Runtime test verification
CI verification
Production/staging verification
```

Passing TypeScript is never sufficient evidence for production readiness.

For tenant-sensitive functionality, test at minimum:

```text
anonymous
authorized same-tenant user
authorized foreign-tenant user
privileged cross-tenant operator
resource owner / non-owner
```

## 9. Testing commands

Use the package scripts actually declared in `apps/admin/package.json`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm test:e2e:ui
```

Keep unit tests network-free. Use Playwright/Cypress/database harnesses for integration or end-to-end behavior.

## 10. Documentation maintenance

Do not duplicate the same architecture/security claim across many files.

Preferred ownership:

- README: orientation and current status.
- CLAUDE: agent rules and architectural constraints.
- DB agent prompt: database-only guardrails.
- Production readiness plan: release evidence and outstanding risks.
- Performance plan: performance/reliability backlog.
- Supabase README/schema README: database operations and schema ownership.

Remove or update obsolete claims rather than preserving contradictory “production ready” statements.

## 11. Required delivery discipline

Every implementation task should report:

```text
1. What was checked
2. What was actually found
3. What changed
4. What was verified
5. What remains unverified
```

Do not manufacture test results, production guarantees, or security evidence.
