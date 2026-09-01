# EduZone — DevOps & Deployment Guide

> **Version:** 1.0 | **Date:** 2026-03-11 | **Status:** APPROVED  
> **Stack:** GitHub Actions · Vercel · Supabase Pro · Docker

---

## 1. Environments

| Environment     | Purpose                   | URL                        | Branch    |
| --------------- | ------------------------- | -------------------------- | --------- |
| **Local**       | Developer sandbox         | `localhost:3000`           | any       |
| **Development** | Integration testing       | `dev-admin.eduzone.io`     | `develop` |
| **Staging**     | Pre-production validation | `staging-admin.eduzone.io` | `staging` |
| **Production**  | Live platform             | `admin.eduzone.io`         | `main`    |

---

## 2. Infrastructure Overview

```
┌─────────────────────────────────────────────────┐
│              GitHub (Source of Truth)           │
│   Branches: main / staging / develop / feature* │
└─────────────────────┬───────────────────────────┘
                      │ GitHub Actions CI/CD
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐        ┌──────────────┐
   │   Vercel    │        │  Supabase    │
   │  (Next.js)  │        │  (Backend)   │
   │             │        │              │
   │ - Admin App │        │ - PostgreSQL │
   │ - Edge CDN  │        │ - Auth       │
   │ - Preview   │        │ - Edge Fns   │
   │   URLs      │        │ - Realtime   │
   └─────────────┘        └──────────────┘
          │                       │
          └───────────────────────┘
                    │
            ┌───────┴────────┐
            │  Monitoring    │
            │ Sentry + DD    │
            └────────────────┘
```

---

## 3. Local Development Setup

### 3.1 Prerequisites

```bash
node --version   # Must be v20+
pnpm --version   # Must be v9+
docker --version # Must be v24+
supabase --version # Must be v1.140+
```

### 3.2 First-Time Setup

```bash
# 1. Clone
git clone https://github.com/eduzone/admin-dashboard.git
cd admin-dashboard

# 2. Install all workspace packages
pnpm install

# 3. Start local Supabase (runs PostgreSQL + Auth + Edge runtime in Docker)
supabase start

# 4. Apply all migrations + seed data
supabase db reset

# 5. Copy environment files
cp apps/admin/.env.example apps/admin/.env.local

# 6. Update .env.local with local Supabase credentials
# (credentials printed after 'supabase start')

# 7. Start development
pnpm dev
```

### 3.3 Local Environment Variables

```env
# apps/admin/.env.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-start-output>
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_APP_VERSION=local

# Optional (for local Sentry testing)
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### 3.4 Useful Local Commands

```bash
# Start everything
pnpm dev

# Supabase Studio (local DB admin UI)
open http://localhost:54323

# Run a specific migration manually
supabase db push

# Reset DB and re-seed
supabase db reset

# Generate TypeScript types from DB schema
supabase gen types typescript --local > packages/types/src/supabase.ts

# Tail Edge Function logs
supabase functions serve --env-file supabase/.env.local
```

---

## 4. CI/CD Pipeline

### 4.1 Pull Request Pipeline

Triggered on: every PR to `develop`, `staging`, or `main`

```yaml
# .github/workflows/pr-checks.yml
jobs:
  quality:
    steps:
      - pnpm install --frozen-lockfile
      - pnpm typecheck # tsc --noEmit (zero errors)
      - pnpm lint # eslint --max-warnings=0
      - pnpm test # Vitest unit tests
      - pnpm test:coverage # Coverage ≥ 80% gate
      - pnpm build # Next.js build (no type errors)

  dependency-check:
    steps:
      - dependency-cruiser # Enforce layer boundaries
      - madge --circular # No circular dependencies
      - pnpm audit --audit-level=high # No high/critical vulnerabilities

  migration-check:
    steps:
      - supabase db diff # Detect unapplied migrations
      - supabase db lint # SQL linting
```

**PR blocked if any job fails.** No exceptions.

### 4.2 Deployment Pipeline

#### Deploy to Development (on push to `develop`)

```yaml
jobs:
  deploy-dev:
    steps:
      - Run PR checks (above)
      - supabase db push --project-ref $DEV_PROJECT_REF
      - supabase functions deploy --project-ref $DEV_PROJECT_REF
      - vercel deploy --env=development
      - Run smoke tests against dev URL
```

#### Deploy to Staging (on push to `staging`)

```yaml
jobs:
  deploy-staging:
    steps:
      - Run PR checks
      - supabase db push --project-ref $STAGING_PROJECT_REF
      - supabase functions deploy --project-ref $STAGING_PROJECT_REF
      - vercel deploy --env=staging --prod
      - Run full E2E suite (Playwright)
      - Notify #deployments Slack channel
```

#### Deploy to Production (on push to `main` — requires manual approval)

```yaml
jobs:
  deploy-prod:
    environment: production # Requires approval from 2 engineers
    steps:
      - Run PR checks
      - Create DB backup snapshot
      - supabase db push --project-ref $PROD_PROJECT_REF
      - supabase functions deploy --project-ref $PROD_PROJECT_REF
      - vercel deploy --env=production --prod
      - Run smoke tests against prod URL
      - Notify #deployments Slack channel
      - Create GitHub Release tag
```

---

## 5. Database Migrations

### 5.1 Migration Rules

- Every schema change requires a migration file
- Migration files are **never modified after merge** — only new migrations
- Destructive operations (DROP, rename column) require explicit approval
- Every migration must be reversible (include a rollback comment)
- Migrations run in order by timestamp prefix: `20260311120000_add_feature_x.sql`

### 5.2 Creating a Migration

```bash
# Create a new migration
supabase migration new add_feature_x

# This creates: supabase/migrations/20260311120000_add_feature_x.sql

# Test locally
supabase db reset    # Full reset
supabase db push     # Apply only new migrations

# Validate
supabase db diff     # Should show no diff after push
```

### 5.3 Migration Review Checklist

Before merging a migration PR:

- [ ] Migration is idempotent where possible (`IF NOT EXISTS`, `IF EXISTS`)
- [ ] RLS policies added for new tables
- [ ] Indexes added for foreign keys + filtered columns
- [ ] Rollback procedure documented in migration comment
- [ ] Tested on dev Supabase project
- [ ] No breaking changes to existing RPC contracts (use contract versioning)

---

## 6. Secrets Management

### 6.1 Secret Hierarchy

| Secret                      | Stored In                  | Accessible By       |
| --------------------------- | -------------------------- | ------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function env | Edge Functions only |
| `SUPABASE_ANON_KEY`         | Vercel env (public)        | Browser + server    |
| `SENTRY_AUTH_TOKEN`         | GitHub Actions secrets     | CI only             |
| `VERCEL_TOKEN`              | GitHub Actions secrets     | CI only             |
| `DATADOG_API_KEY`           | Vercel env (server)        | Server-side only    |

### 6.2 Environment Variable Naming Convention

```
NEXT_PUBLIC_*    → Exposed to browser (safe for public values only)
*                → Server-only (never sent to browser)
```

**Rule:** If it contains a secret, it MUST NOT have `NEXT_PUBLIC_` prefix.

### 6.3 Rotating Secrets

When a secret is compromised:

1. Revoke old secret immediately at the provider
2. Generate new secret
3. Update in all environments (Vercel + GitHub Actions + Supabase)
4. Trigger re-deploy across all environments
5. Verify old key returns 401 on test call
6. Document incident in `docs/INCIDENT_LOG.md`

---

## 7. Rollback Procedures

### 7.1 Frontend Rollback (Vercel)

```bash
# Instant rollback to previous deployment
vercel rollback --yes

# Or via Vercel dashboard → Deployments → Promote previous
```

### 7.2 Database Rollback

```bash
# 1. Restore from snapshot (taken before every production deploy)
supabase db restore --backup-id <backup-id>

# For minor migrations — run rollback SQL
psql $DATABASE_URL -f supabase/migrations/rollback/20260311_rollback.sql
```

### 7.3 Edge Function Rollback

```bash
# Deploy previous version from git
git checkout <previous-tag>
supabase functions deploy --project-ref $PROD_PROJECT_REF
```

### 7.4 Rollback Decision Tree

```
Issue detected in production
    │
    ├── Frontend bug only?
    │       → Vercel rollback (< 2 min)
    │
    ├── Edge Function bug?
    │       → Redeploy previous function (< 5 min)
    │
    ├── DB migration issue?
    │       → Run rollback SQL + assess data impact
    │       → If data corrupted: restore from snapshot
    │
    └── Full system issue?
            → Declare incident → PagerDuty alert
            → Full rollback: Vercel + functions + DB snapshot
```

---

## 8. Performance & Capacity

### 8.1 Vercel Configuration

```json
// vercel.json
{
  "regions": ["iad1", "fra1"],
  "functions": {
    "apps/admin/src/app/api/**": {
      "maxDuration": 30
    }
  }
}
```

### 8.2 Supabase Configuration

| Setting                  | Value           |
| ------------------------ | --------------- |
| Connection pool size     | 100 (PgBouncer) |
| Max DB connections       | 500             |
| Edge Function timeout    | 30s             |
| Realtime max connections | 10,000          |
| Storage bucket max size  | 5GB             |

### 8.3 Scaling Triggers

| Metric                 | Threshold       | Action                          |
| ---------------------- | --------------- | ------------------------------- |
| DB CPU > 80%           | 5min sustained  | Scale up Supabase plan          |
| Response time P99 > 2s | 10min sustained | Investigate + add indexes       |
| Error rate > 1%        | 5min sustained  | PagerDuty alert → on-call       |
| Job queue depth > 1000 | 15min sustained | Scale Edge Function concurrency |

---

## 9. On-Call Runbook

### 9.1 Incident Severity Levels

| Level | Description                               | Response Time     | Escalation             |
| ----- | ----------------------------------------- | ----------------- | ---------------------- |
| P0    | Full outage — dashboard inaccessible      | 15 min            | CTO + Engineering Lead |
| P1    | Critical feature broken (auth, user mgmt) | 30 min            | Engineering Lead       |
| P2    | Important feature degraded                | 2 hours           | On-call engineer       |
| P3    | Minor issue / cosmetic bug                | Next business day | Ticket created         |

### 9.2 First Response Checklist

```
1. Check Vercel status: https://vercel-status.com
2. Check Supabase status: https://status.supabase.com
3. Check Sentry for error spike: https://sentry.io/eduzone
4. Check Datadog dashboards for metrics anomalies
5. Review recent deployments (last 2h)
6. Check rate limit metrics (spike = DDoS / abuse)
7. Check job queue depth (backlog = processing issue)
```
