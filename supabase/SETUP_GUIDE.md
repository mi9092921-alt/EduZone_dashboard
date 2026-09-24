# Supabase Setup Guide — EduZone Dashboard

**Reviewed:** 2026-09-24
**Status:** repository setup tooling is present; remote deployment and production readiness remain unverified here.

## 1. Local setup

```powershell
supabase start
supabase status
supabase\deploy.ps1 local
```

The deployment script validates the numbered files in `supabase/schema/` and applies them in the repository's configured order. Inspect the script and target connection before using it. A local reset is not a production deployment operation.

## 2. Canonical schema

The active order is defined explicitly in `supabase/config.toml`:

```text
01_extensions.sql → 02_types.sql → 03_tables.sql → 04_constraints.sql
→ 05_indexes.sql → 07_functions.sql → 06_views.sql → 08_triggers.sql
→ 09_rls.sql → 10_permissions.sql → 11_seed_reference.sql
```

`12_seed_qa_demo.sql` is disposable QA/E2E data and is not part of the configured production-oriented order. The migrations directory currently contains only its README.

## 3. QA seed boundary

The QA seed creates test accounts and demo data. It is opt-in in the deployment tooling and must be used only with a disposable local/QA database. Never use the documented test credentials against staging or production.

## 4. Shared database and production boundary

The repository documents the Supabase database as shared with `EduZone_App`. Before changing a shared object, inspect both repositories, SQL dependencies, Edge Functions, tests, and CI. If the other repository is unavailable, record compatibility as **UNVERIFIED**.

The existence of schema files, RLS policies, SECURITY DEFINER functions, deployment scripts, or a successful local run does not prove production approval. That requires executable evidence for deployment behavior, tenant isolation, privileged RPCs, backup/restore, rollback or forward-fix, and application release gates.

## 5. Related documents

- [`schema/README.md`](schema/README.md) — SQL ownership and dependency order.
- [`QUICK_START.md`](QUICK_START.md) — local workflow.
- [`README.md`](README.md) — Supabase scope and evidence rules.
- [`deploy.ps1`](deploy.ps1) — local validation/deployment helper.
