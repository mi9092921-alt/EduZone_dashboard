# EduZone Dashboard — Production Readiness Plan

**Assessment baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Assessment date:** 2026-09-08  
**Decision:** **NO-GO — production readiness is not yet demonstrated**

## 1. Assessment method

This plan distinguishes three things:

```text
Implemented in source
≠
Verified at runtime
≠
Approved for production
```

Evidence is evaluated using:

```text
Check → Think → Modify → Verify → Repeat
```

A documentation file cannot close a production finding.

## 2. Verified source-level baseline

### Repository/runtime

- pnpm/Turborepo workspace is present.
- `apps/admin` is the primary Next.js application.
- Shared packages include types, UI, utils, and config.
- Supabase SQL and Deno Edge Functions are present.
- Unit, Playwright, and Cypress test assets are present.
- CI/CD workflows are present.

### Application architecture

The source tree contains domain, application, adapter, infrastructure, feature, component, app, and configuration areas.

`src/container.ts` currently acts as dependency wiring and no longer contains the mutable `actorId` / `tenantId` state described in older plans.

`application/authorization/policy.ts` centralizes the previously duplicated role-permission fast path, but its own comments identify this as only a partial step toward fully centralized authorization.

### Database configuration

`supabase/config.toml` currently uses ordered files from `supabase/schema/` as schema inputs and exposes PostgreSQL 17 locally.

`supabase/schema/README.md` defines the canonical ownership model for the ordered SQL files.

The `supabase/migrations/` area must not be described as a normal historical migration chain without explicit verification; the latest documented assessment found only a README there.

## 3. Current release gates

| Gate | Current documentation status | Required evidence |
|---|---|---|
| Typecheck | Source/script available; current PASS not independently rerun in this review | clean checkout exit 0 |
| Lint | Script exists | clean checkout exit 0 |
| Unit tests | Test infrastructure exists | deterministic no-network unit run, exit 0 |
| Build | Build script exists | production build exit 0 |
| Playwright/Cypress | Suites exist | critical flows pass in CI |
| RLS/tenant isolation | SQL controls exist | executable Tenant A/B negative matrix |
| Service-role boundary | Privileged infrastructure exists | audited allowlist + direct-route tests |
| Secrets | Environment/config mechanisms exist | rotation/history/artifact scan |
| CI/CD | Workflows exist | all release gates enforced in protected pipeline |
| Backup/restore | Operational documentation exists | successful disposable restore drill |

Anything not backed by this evidence remains **UNVERIFIED**.

## 4. High-priority findings

### P0 — Release evidence is incomplete

The repository contains substantial security and testing infrastructure, but the documentation baseline does not establish a clean, reproducible green release gate.

Required:

```text
typecheck PASS
lint PASS
unit PASS
build PASS
critical E2E PASS
security/tenant tests PASS
database verification PASS
deployment/rollback evidence PASS
```

### P0 — Tenant isolation must be an executable gate

RLS and tenant-aware SQL exist, but source presence is not proof of isolation across every application path.

Required matrix:

```text
SELECT
INSERT
UPDATE
DELETE
RPC
route handlers
Edge Functions
exports
bulk jobs
search/analytics
realtime/storage where applicable
```

For Tenant A and Tenant B, prove:

```text
A cannot read B
A cannot update B
A cannot delete B
A cannot export B
```

### P0/P1 — Authorization is only partially centralized

The shared role-permission policy reduces duplication, but it does not establish a single typed deny-by-default authorization contract for every privileged path.

Required:

```text
Authentication
→ Authorization
→ Tenant/resource scope
→ Use case
→ Infrastructure
```

### P0/P1 — Service-role usage requires explicit boundary proof

Every service-role use must be inventoried and tied to a deliberate privileged operation.

Required:

```text
caller
operation
authorization
tenant scope
input validation
auditability
error handling
secret isolation
```

### P1 — CI release-gate completeness

The repository has multiple test technologies. The release pipeline must make clear which tests are mandatory for a production release and must fail closed when a mandatory gate fails.

### P1 — Database deployment semantics require one documented source of truth

The current configuration uses ordered `supabase/schema/*.sql` inputs. Do not describe this as a conventional timestamped migration history unless a real migration chain is established and verified.

## 5. What is not a blocker by itself

The following do not prove production readiness:

```text
- TypeScript compiling
- a README saying “Production Ready”
- RLS files existing
- SECURITY DEFINER functions existing
- a test file existing
- CI workflow existing
- a staging deployment existing without rollback/restore evidence
```

## 6. Recommended release order

```text
1. Freeze documentation claims to verified facts
2. Make typecheck/lint/unit/build deterministic
3. Establish mandatory CI release gates
4. Complete authorization/service-role boundary
5. Execute Tenant A/B security matrix
6. Verify database deployment/reset semantics
7. Run critical E2E and accessibility checks
8. Establish observability, SLOs, alerting, rollback
9. Execute staging release rehearsal
10. Reassess GO/NO-GO
```

## 7. Evidence log

This document intentionally leaves runtime result cells open when execution was not performed during the documentation review.

The baseline commit used for this cleanup is:

`9f1a31659d929fcf5bbcdec58429c146021b777d`

No claim in this document overrides the evidence produced by future CI or production/staging verification.
