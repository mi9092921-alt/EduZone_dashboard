# Supabase Migrations Directory

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-08

## Current state

This directory currently contains **documentation only**. It does not contain a timestamped active migration chain.

```text
supabase/migrations/
└── README.md
```

The development-stage database uses the ordered files in `supabase/schema/`, as configured by `supabase/config.toml` under `db.migrations.schema_paths`.

## Governance rule

Do not describe this directory as a complete historical migration system unless an actual migration chain is present and verified.

For the current project policy:

```text
Canonical SQL source → supabase/schema/
No second active schema source
No temporary SQL patch source
```

Historical/superseded SQL artifacts belong under `supabase/_archived_patches/` rather than being treated as active deployment inputs.

## Verification requirement

Database deployment semantics remain a release concern. A local schema reset or the presence of ordered SQL files does not by itself prove production rollback, upgrade, or restore safety.
