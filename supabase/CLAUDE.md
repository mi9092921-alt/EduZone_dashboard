# EduZone Supabase — AI Engineering Guide

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`

## Current structure

```text
supabase/schema/        canonical ordered SQL inputs
supabase/functions/     Deno Edge Functions
supabase/_archived_patches/  historical/superseded SQL
supabase/migrations/    documentation only in the current tree
```

## Canonical schema

The active development-stage schema is represented by the ordered paths in `supabase/config.toml`.

```text
01_extensions
02_types
03_tables
04_constraints
05_indexes
07_functions
06_views
08_triggers
09_rls
10_permissions
11_seed_reference
```

Read `schema/README.md` for object ownership.

## Database changes

The database is shared with `EduZone_App`.

Before modifying a shared object:

```text
Check callers in both repositories
→ check SQL dependencies
→ check tests/Edge Functions
→ make the smallest change
→ verify
→ repeat reference search
```

The project policy does not permit a second active schema source.

## Security

Maintain:

```text
RLS
least-privilege grants
controlled SECURITY DEFINER search_path
server-side authorization
tenant isolation
secret isolation
```

Never treat file presence as security evidence.

## Evidence language

Use these terms precisely:

```text
IMPLEMENTED  = source/configuration is present
VERIFIED     = executable evidence passed
UNVERIFIED   = not tested in the current assessment
PRODUCTION READY = release gates and operational evidence are complete
```

Do not write `PRODUCTION READY` when only source inspection has been performed.
