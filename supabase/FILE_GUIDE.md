# Supabase Directory & File Guide

**Reviewed:** 2026-09-24

This guide reflects the current repository tree. It does not treat historical proposals or external Supabase state as current evidence.

## Current layout

```text
supabase/
├── README.md, AGENTS.md, CLAUDE.md, QUICK_START.md, SETUP_GUIDE.md
├── config.toml
├── deploy.js, deploy.ps1, deploy.sh, deploy_functions.ps1
├── schema/
│   ├── 01_extensions.sql … 11_seed_reference.sql
│   ├── 12_seed_qa_demo.sql       # disposable QA/E2E seed; opt-in only
│   ├── VALIDATION.sql
│   └── README.md
├── functions/                    # one index.ts per function
├── migrations/README.md           # no active SQL migration chain
└── _archived_patches/             # historical/superseded SQL artifacts
```

The active order is the explicit `db.migrations.schema_paths` list in `config.toml`; it is not inferred from filename sorting. The QA/demo seed is applied only by explicit local/E2E or opt-in tooling and must not be used against a shared environment.

## Where to look

| Need                     | File                                               |
| ------------------------ | -------------------------------------------------- |
| SQL ownership and order  | [`schema/README.md`](schema/README.md)             |
| Local workflow           | [`QUICK_START.md`](QUICK_START.md)                 |
| Setup and seed boundary  | [`SETUP_GUIDE.md`](SETUP_GUIDE.md)                 |
| Agent rules              | [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md) |
| Validation SQL           | [`schema/VALIDATION.sql`](schema/VALIDATION.sql)   |
| Schema deployment        | `deploy.ps1`, `deploy.sh`, `deploy.js`             |
| Edge Function deployment | `deploy_functions.ps1`                             |

Before changing a shared table, function, RPC, policy, or constraint, trace consumers in the dashboard, the student application where available, SQL, Edge Functions, tests, and CI.
