# EduZone — DevOps and Deployment Notes

**Reviewed:** 2026-09-24
**Status:** repository procedures and workflow files are present; environment URLs, Vercel/Supabase projects, approvals, and successful releases are not verifiable from this checkout.

## 1. What the repository actually contains

- `.github/workflows/ci.yml` — CI checks.
- `.github/workflows/deploy.yml` — checks for the deployment branch/event; it does not itself prove that infrastructure was deployed.
- `.github/workflows/e2e.yml` — conditional local-Supabase/Playwright workflow controlled by `E2E_ENABLED`.
- `apps/admin/vercel.json` — Vercel headers and one daily cron declaration for `/api/cron/routine`.
- `supabase/deploy.ps1`, `supabase/deploy.js`, and `supabase/deploy.sh` — schema deployment helpers with different connection assumptions.
- `supabase/deploy_functions.ps1` — Edge Function deployment helper.

There is no checked-in evidence here for `develop` or `staging` environments, public environment URLs, a Vercel project, a Supabase project deployment, Datadog, PagerDuty, or an external cron provider. Treat those as operator-owned configuration that must be verified separately.

## 2. Local development

```powershell
pnpm install --frozen-lockfile
supabase start
supabase status
supabase\deploy.ps1 local
pnpm dev
```

Review the target connection before running any deployment helper. `supabase/migrations/` contains no active SQL migration chain, so do not describe `supabase db reset` as a production upgrade or rollback mechanism.

## 3. CI and tests

The root scripts are declared in `package.json`; admin-specific scripts are declared in `apps/admin/package.json`. The E2E workflow creates a disposable local Supabase stack and applies the repository SQL explicitly. The workflow is conditional, and external GitHub settings such as required checks must be verified through GitHub rather than inferred from YAML. See [`.github/BRANCH_PROTECTION.md`](../.github/BRANCH_PROTECTION.md) for a dated snapshot.

## 4. Secrets and environment files

Use the checked-in templates [`apps/admin/.env.local.example`](../apps/admin/.env.local.example) and [`apps/admin/.env.test.example`](../apps/admin/.env.test.example). Populated `.env*` files are local-only. Production-only values such as `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, Sentry DSNs, CORS origins, and provider credentials require the target operator's secret manager; their names in templates do not prove that values exist or are configured.

The QA seed is disposable and opt-in. Never apply it to a shared staging or production database.

## 5. Database and Edge Function changes

For schema ownership, order, and validation see [`../supabase/schema/README.md`](../supabase/schema/README.md). Before changing shared SQL, inspect both repository consumers, SQL dependencies, Edge Functions, tests, and CI. Deploy Edge Functions only after reviewing `supabase/deploy_functions.ps1` and confirming the target project and required secrets.

## 6. Rollback

[`rollback-plan.md`](rollback-plan.md) is a procedure template. It does not prove that a backup/restore drill, Vercel rollback, Edge Function rollback, or database recovery has been executed. Record those results in the production-readiness evidence ledger before calling a release ready.
