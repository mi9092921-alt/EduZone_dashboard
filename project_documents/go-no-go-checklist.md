# EduZone Admin Dashboard — Go/No-Go Launch Checklist

**Project:** EduZone Admin Dashboard v1.0  
**Target Date:** ******\_\_\_******  
**Environment:** Production (`me-south-1`)

---

## Pre-Launch Requirements

### ✅ Quality & Testing

| Check                                                                                                                                                                                                                     | Owner | Status | Notes                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright E2E tests pass (4 spec files / 15 tests: auth login+logout, user list & filters, a11y audits, UX/RTL/keyboard regression)                                                                                  | QA    | ☐      | Run: `pnpm --filter @eduzone/admin exec playwright test`. Gate defined in `.github/workflows/e2e.yml`, **dormant** until `E2E_ENABLED=true` — see activation checklist in that file. |
| Cypress E2E tests pass (15 spec files: moderation — ban/suspend/lock/bulk-lock; courses — create/enroll/revoke; warnings; audit-chain verify; notifications; settings — maintenance-mode/app-lock; auth token-version) | QA    | ☐      | Run: `pnpm --filter @eduzone/admin exec cypress run`. **Not yet ported to Playwright** — see ⚠️ note below. Not currently wired into any CI workflow. |
| Unit test coverage ≥ 80%                                                                                                                                                                                                | Dev   | ☐      | Run: `vitest run --coverage`                                                                                                                     |
| Storybook interaction tests pass                                                                                                                                                                                       | Dev   | ☐      |                                                                                                                                                    |
| No TypeScript errors (`tsc --noEmit`)                                                                                                                                                                                  | Dev   | ☐      |                                                                                                                                                    |
| No Critical/High CVEs (`pnpm audit`)                                                                                                                                                                                   | Dev   | ☐      | Accepted: picomatch (dev-only)                                                                                                                    |

> [!WARNING]
> **RFC-012 (2026-03-08)** mandates Vitest + Playwright and retiring Cypress. As of this update, that migration is **incomplete**: Playwright covers only 4 of the 15 real E2E flows (auth + basic user list). The other 11 flows — all user-moderation actions, courses, warnings, audit-chain verification, notifications, and settings — exist **only** in Cypress and have no Playwright equivalent yet. Cypress must **not** be removed (dependency, specs, or `cypress.env.json.example`) until those 11 flows are ported and verified green in Playwright. Until then, both suites are required launch gates. Tracking: port remaining flows, then re-run this checklist update to drop the Cypress row.

### 🔒 Security

| Check                                               | Owner | Status | Notes                                            |
| --------------------------------------------------- | ----- | ------ | ------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY` only in Edge Functions  | Dev   | ☐      | gitleaks scan                                    |
| RLS smoke test: Teacher sees 0 user rows            | Dev   | ☐      | `scripts/security/rls-smoke-test.ts`             |
| Exhaustive permissions test passes                  | Dev   | ☐      | `scripts/security/permission-exhaustive-test.ts` |
| HTTP Security Headers in place (CSP, HSTS, X-Frame) | Dev   | ☐      | `vercel.json`                                    |
| No hardcoded secrets in git history                 | Dev   | ☐      | `git log -S "service_role"`                      |

### 🚀 Infrastructure

| Check                                              | Owner  | Status | Notes                    |
| -------------------------------------------------- | ------ | ------ | ------------------------ |
| Supabase Production project created (`me-south-1`) | DevOps | ☐      |                          |
| Schema v5.0 migrations applied                     | DevOps | ☐      | `supabase db push`       |
| All 5 Edge Functions deployed                      | DevOps | ☐      |                          |
| pg_cron extension enabled                          | DevOps | ☐      | Dashboard → Extensions   |
| All 8 pg_cron jobs scheduled                       | DevOps | ☐      | `SELECT * FROM cron.job` |
| Read Replica configured (`eu-west-1`)              | DevOps | ☐      | Supabase Pro feature     |
| DNS CNAME pointing to Vercel                       | DevOps | ☐      | ~24h propagation         |
| SSL certificate active                             | DevOps | ☐      | Auto via Vercel          |

### 📊 Monitoring

| Check                                 | Owner  | Status | Notes                 |
| ------------------------------------- | ------ | ------ | --------------------- |
| Sentry DSN configured in Vercel env   | Dev    | ☐      |                       |
| Sentry receiving test errors          | Dev    | ☐      | Trigger manually      |
| Vercel Analytics enabled              | DevOps | ☐      | Dashboard → Analytics |
| Supabase slow query alerts configured | DevOps | ☐      | > 500ms threshold     |

### 🎭 Staging Smoke Test (must pass before Production)

| Feature                                | Tested | Result          |
| -------------------------------------- | ------ | --------------- |
| Login as super_admin                   | ☐      | ☐ Pass / ☐ Fail |
| Login as admin                         | ☐      | ☐ Pass / ☐ Fail |
| Login as teacher                       | ☐      | ☐ Pass / ☐ Fail |
| Users page — no 500 errors             | ☐      | ☐ Pass / ☐ Fail |
| Lock user action                       | ☐      | ☐ Pass / ☐ Fail |
| Courses page — list loads              | ☐      | ☐ Pass / ☐ Fail |
| Settings page — visible to super_admin | ☐      | ☐ Pass / ☐ Fail |
| Audit logs — queryable                 | ☐      | ☐ Pass / ☐ Fail |
| Arabic locale (RTL) verified           | ☐      | ☐ Pass / ☐ Fail |
| Sentry receives intentional error      | ☐      | ☐ Pass / ☐ Fail |

### 🗃️ Rollback Readiness

| Check                                        | Owner  | Status |
| -------------------------------------------- | ------ | ------ |
| Pre-production DB snapshot taken and labeled | DevOps | ☐      |
| Previous Vercel deployment SHA noted         | DevOps | ☐      |
| Rollback procedure tested on Staging         | Dev    | ☐      |
| `docs/rollback-plan.md` reviewed by team     | Team   | ☐      |

---

## Approval

> [!CAUTION]
> Production launch requires sign-off from both PM and Tech Lead. No exceptions.

| Role                   | Name | Signature          | Date         |
| ---------------------- | ---- | ------------------ | ------------ |
| **PM / Product Owner** |      | ********\_******** | **\_\_\_\_** |
| **Tech Lead**          |      | ********\_******** | **\_\_\_\_** |
| **QA Lead**            |      | ********\_******** | **\_\_\_\_** |

---

## Launch Window

**Proposed Launch Time:** ******\_\_\_******  
**Region:** Middle East (me-south-1)  
**Rollback Deadline:** T+2 hours (if critical issues found)

---

_This document must be completed and signed before executing `P10-LAUNCH-002`._
