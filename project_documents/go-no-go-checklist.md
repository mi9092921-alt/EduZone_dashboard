# EduZone Admin Dashboard — Go/No-Go Launch Checklist

**Project:** EduZone Admin Dashboard v1.0  
**Target Date:** ******\_\_\_******  
**Environment:** Production (`me-south-1`)

---

## Pre-Launch Requirements

### ✅ Quality & Testing

| Check                                                                                                                                                                                                                     | Owner | Status | Notes                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright E2E tests pass (4 spec files / 18 tests: auth login+logout+token-version, user list & filters + lock/unlock, a11y audits, UX/RTL/keyboard regression)                                                       | QA    | ☐      | Run: `pnpm --filter @eduzone/admin exec playwright test`. **17/18 passing** — [E2E (Playwright) #23](https://github.com/mi9092921-alt/EduZone_dashboard/actions/runs/33977117026): the 18th (`users.spec.ts` lock/unlock) fails correctly, exposing a real P0 bug (see Security section) rather than a test defect. Do not mark ✅ by weakening that test — it should go green on its own once the P0 bug is fixed. Last full-green run: [#22](https://github.com/mi9092921-alt/EduZone_dashboard/actions/runs/33973022592/job/101324780761) (17/17, auth port only, commit `4a4e87f`). Gate live in `.github/workflows/e2e.yml` (`E2E_ENABLED=true`). |
| Cypress E2E tests pass (15 spec files: moderation — ban/suspend/lock/bulk-lock; courses — create/enroll/revoke; warnings; audit-chain verify; notifications; settings — maintenance-mode/app-lock; auth token-version) | QA    | ☐      | Run: `pnpm --filter @eduzone/admin exec cypress run`. **Not yet ported to Playwright** — see ⚠️ note below. Not currently wired into any CI workflow. |
| Unit test coverage ≥ 80%                                                                                                                                                                                                | Dev   | ☐      | Run: `vitest run --coverage`                                                                                                                     |
| Storybook interaction tests pass                                                                                                                                                                                       | Dev   | ☐      |                                                                                                                                                    |
| No TypeScript errors (`tsc --noEmit`)                                                                                                                                                                                  | Dev   | ☐      |                                                                                                                                                    |
| No Critical/High CVEs (`pnpm audit`)                                                                                                                                                                                   | Dev   | ☐      | Accepted: picomatch (dev-only)                                                                                                                    |

> [!WARNING]
> **RFC-012 (2026-03-08)** mandates Vitest + Playwright and retiring Cypress. As of this update, that migration is **incomplete**: of the 4 existing Playwright spec files, only 2 (auth login/logout, basic user list & filters) actually correspond to a Cypress flow — the other 2 (a11y, UX/RTL regression) are net-new checks with no Cypress equivalent. Counting directly from the 15 `.cy.ts` files, **13 flows** — not 11 as previously stated here — exist **only** in Cypress with no Playwright port: all user-moderation actions (ban/suspend/lock/bulk-lock), courses (create/enroll/revoke), warnings, audit-chain verification, notifications, settings (maintenance-mode/app-lock), and auth token-version.
>
> A first port (auth token-version, added as a new describe block in `auth.spec.ts`) was drafted from the real source (`src/adapters/hooks/useSessionCheck.ts`, `src/features/auth/components/AuthProvider.tsx`) — the old Cypress version targeted a `[data-cy="page-header"]` selector and a `/users/admins` route that don't exist anywhere in `src/`, so it could not have been passing as-is. **Confirmed green**: [E2E (Playwright) #22](https://github.com/mi9092921-alt/EduZone_dashboard/actions/runs/33973022592/job/101324780761) — 17/17 passed, no flaky, commit `4a4e87f`. 11 flows remain unported.
>
> The port initially introduced a real regression (run #21: `Login flow`/`Logout flow` went flaky — see prior run history). Root cause: those two plus the new token-version test all perform independent fresh logins as `super_admin@eduzone-test.com`, and with `fullyParallel: true` + 2 CI workers, Playwright could schedule any of the three concurrently, tripping `trg_enforce_single_active_session` (`supabase/schema/08_triggers.sql`) against each other. Fixed with `test.describe.configure({ mode: 'serial' })` on the parent block, forcing all three onto one worker in declaration order — **verified in run #22 above**, clean with no flaky tests.
>
> **`users/lock-user` port: test correctly FAILING — real P0 bug found, not a test defect (2026-09-05).** Added as a new `Lock / Unlock account (Cloud Safe)` describe block in `users.spec.ts` (not a new file — same pattern as the auth port landing in `auth.spec.ts`). Like the auth port, the old Cypress version (`cypress/e2e/users/lock-user.cy.ts`) could not have been passing as written — see prior note history for the stale selectors/RPC names it guessed at. The new test targets the real UI correctly (row kebab menu, `Lock Account` confirm button, `student@eduzone-test.com` / Omar Abdullah as the only safe-to-mutate seeded active user) but [run #23](https://github.com/mi9092921-alt/EduZone_dashboard/actions/runs/33977117026) failed on all 3 attempts, identically, at the success-toast assertion. Root cause traced to a real, always-reproducible product bug, not the test — **see the new 🔴 P0 row under Security below**. Do not "fix" this test to route around the bug (mocking, loosening the assertion, etc.) — leave it red until `control_user_account`/`terminate_user_sessions` are actually fixed, then it should go green with no other changes needed. Also flagged in passing but **not yet acted on**: `BanUserDialog`'s confirm field label/placeholder read "Type CONFIRM to proceed" / "CONFIRM" (`messages/en.json`), but `banUserSchema` (`domain/schemas/user.schema.ts`) requires the literal text `BAN` — a real UI/validation mismatch in `src/`, unrelated to this port, worth its own ticket before `users/ban-user` is attempted.
>
> Cypress must **not** be removed (dependency, specs, or `cypress.env.json.example`) until all flows are ported and verified green in Playwright. Until then, both suites are required launch gates. Tracking: fix the P0 bug below, confirm `lock-user` goes green (18/18, no flaky) as a result, then port the remaining 10, then re-run this checklist update to drop the Cypress row.

### 🔒 Security

| Check                                               | Owner | Status | Notes                                            |
| --------------------------------------------------- | ----- | ------ | ------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY` only in Edge Functions  | Dev   | ☐      | gitleaks scan                                    |
| RLS smoke test: Teacher sees 0 user rows            | Dev   | ☐      | `scripts/security/rls-smoke-test.ts`             |
| Exhaustive permissions test passes                  | Dev   | ☐      | `scripts/security/permission-exhaustive-test.ts` |
| HTTP Security Headers in place (CSP, HSTS, X-Frame) | Dev   | ☐      | `vercel.json`                                    |
| No hardcoded secrets in git history                 | Dev   | ☐      | `git log -S "service_role"`                      |
| 🔴 **P0: Lock/Unlock/Suspend/Ban and Terminate Sessions always fail** | Dev | ☐ | **Fix drafted (2026-09-05), pending audit sign-off + CI verification — not yet applied.** Root cause: `control_user_account` and `terminate_user_sessions` (`schema/07_functions.sql:2457,2394`) each gated on `public.user_has_permission(auth.uid(), ...)` / `p_user_id = auth.uid()`, but both are called only via the bare service_role client (`admin.rpc(...)`, `infrastructure/repos/user-admin.repository.ts`; `infrastructure/supabase/admin.ts` — "unauthenticated... bypasses RLS"), which carries no user JWT, so `auth.uid()` was always `NULL` there and both checks always evaluated false → `RAISE EXCEPTION 'PERMISSION_DENIED'` unconditionally. Caller-side authorization (`requirePermission('users.lock')` in the Server Action) was and is correct — this was purely the redundant, broken internal check. `issue_warning` was **not** affected: it correctly uses the request-scoped `createServerClient()` (`user-admin.repository.ts:164`). Reproduced live in CI: [E2E (Playwright) #23](https://github.com/mi9092921-alt/EduZone_dashboard/actions/runs/33977117026) (job's `error-context.md` showed the confirm dialog left open with "An unexpected error occurred. Please try again." after clicking "Lock Account" — that generic message is `InfrastructureError`'s deliberate, correctly-working design of masking raw DB text from the client while logging the real detail server-side (`taxonomy.ts`), not a bug — initially miscalled a bug here and corrected). **Fix**: both RPCs now take an explicit `p_actor_id uuid` (the already-authorized `ctx.userId`, threaded through `IUserAdminRepository` → the two use-cases → the repository's `admin.rpc(...)` calls) and check permission/tenant against that instead of `auth.uid()`; also fixes `control_user_account`'s `locked_by` (was silently always `NULL`, same root cause), makes a tenant mismatch raise `NOT_FOUND` instead of silently affecting zero rows, tightens `terminate_user_sessions`'s tenant scope to the actor's own tenant (replacing an unconditional `auth.role() = 'service_role'` bypass — flagged as a deliberate tightening to review, not just a mechanical fix), and adds the `assertSameTenant` IDOR/BOLA guard to both Server Actions (present on `deleteUserAction` already, missing here). Both edited SQL functions parse clean under `pglast` (libpg_query); `07_functions.sql` is flagged "do not modify without audit" in `supabase/AGENTS.md`, so this still needs human sign-off + a real CI run before merging. |

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