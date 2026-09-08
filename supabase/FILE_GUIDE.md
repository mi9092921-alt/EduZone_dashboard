# Supabase Directory & File Guide

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-08

This guide reflects the current repository tree. It intentionally does not refer to legacy seed files or nonexistent troubleshooting/summary documents.

## Current layout

```text
supabase/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── FILE_GUIDE.md
├── QUICK_START.md
├── SETUP_GUIDE.md
├── RESTRUCTURE_DOWNLOADS.md      # reference/planning document
├── migrations/
│   └── README.md                 # no active migration chain
├── schema/
│   ├── README.md
│   ├── VALIDATION.sql
│   ├── 01_extensions.sql
│   ├── 02_types.sql
│   ├── 03_tables.sql
│   ├── 04_constraints.sql
│   ├── 05_indexes.sql
│   ├── 06_views.sql
│   ├── 07_functions.sql
│   ├── 08_triggers.sql
│   ├── 09_rls.sql
│   ├── 10_permissions.sql
│   └── 11_seed_reference.sql
├── functions/                    # Deno Edge Functions
├── _archived_patches/             # superseded SQL artifacts
├── config.toml
├── deploy.js
├── deploy.ps1
└── deploy.sh
```

## Where to look

**Schema ownership:** `schema/README.md`  
**Local setup:** `QUICK_START.md` / `SETUP_GUIDE.md`  
**Agent rules:** `AGENTS.md` / `CLAUDE.md`  
**Validation:** `schema/VALIDATION.sql`  
**Deployment scripts:** `deploy.ps1`, `deploy.sh`, `deploy.js`

## Database change rule

For development-stage schema work, `supabase/schema/` is the canonical SQL source represented by `config.toml`.

Do not invent another active schema source. Before changing a shared table, function, RPC, policy, or constraint, trace usage in both `EduZone_dashboard` and `EduZone_App`.

The `migrations/` directory currently contains documentation only; do not describe it as a timestamped migration history.
