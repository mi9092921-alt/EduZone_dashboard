# EduZone Supabase

**Reviewed:** 2026-09-24
**Status:** database source and deployment tooling are present; runtime and production readiness remain separately unverified.

## Scope

```text
supabase/
├── schema/       canonical ordered SQL inputs
├── functions/    Deno Edge Function entrypoints
├── migrations/   README only; no active SQL migration chain
├── config.toml
└── deployment and validation helpers
```

## Canonical schema

The active development-stage order is the explicit `schema_paths` list in `config.toml`, documented in [`schema/README.md`](schema/README.md). `12_seed_qa_demo.sql` is disposable QA/E2E data and is not part of that production-oriented list.

The schema contains RLS, SECURITY DEFINER functions, grants/revokes, constraints, indexes, triggers, views, and validation SQL. These are source-level controls, not proof of deployed behavior.

## Local verification

```powershell
supabase start
supabase status
supabase\deploy.ps1 local
```

Review the target connection and deployment script before applying changes. A plain `supabase db reset` must not be reported as a successful application of this repository's ordered schema because the migrations directory contains no SQL chain.

## Shared database and change policy

The repository documents the database as shared with `EduZone_App`. Before changing a table, RPC, function, policy, constraint, or trigger, inspect dashboard callers, the student-app callers where available, SQL dependencies, Edge Functions, tests, CI, and documentation. If the other repository cannot be inspected, mark cross-repository compatibility **UNVERIFIED**.

Never weaken RLS or broaden grants to make an application test pass. Production approval requires executable evidence for schema deployment, tenant isolation, privileged RPC behavior, backup/restore, and rollback or forward-fix procedures.
