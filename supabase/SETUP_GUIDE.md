# Supabase Setup Guide — EduZone Dashboard

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-08  
**Status:** database infrastructure is present; production approval still requires runtime evidence

## 1. Local setup

```powershell
supabase start
supabase status
supabase db reset
```

The current `supabase/config.toml` defines the ordered schema inputs under `supabase/schema/`.

The repository also contains deployment helpers:

```text
supabase/deploy.ps1
supabase/deploy.sh
supabase/deploy.js
```

Use the project procedure associated with the target environment; do not assume local reset is a production deployment operation.

## 2. Canonical schema

The current canonical schema is the ordered set:

```text
01_extensions.sql
02_types.sql
03_tables.sql
04_constraints.sql
05_indexes.sql
07_functions.sql
06_views.sql
08_triggers.sql
09_rls.sql
10_permissions.sql
11_seed_reference.sql
```

The order above is taken from `config.toml`, not inferred from filename sorting.

## 3. Database change policy

The database is shared with `EduZone_App`.

Before changing any shared object:

```text
inspect dashboard callers
inspect student-app callers
inspect SQL references
inspect tests and Edge Functions
make the smallest safe change
verify behavior
re-check references
```

The project policy does not permit a second active schema source.

## 4. Production boundary

The existence of schema files, RLS policies, SECURITY DEFINER functions, deployment scripts, or a successful local reset is not sufficient for production approval.

Production approval requires executable evidence for deployment behavior, RLS/tenant isolation, privileged RPCs, backup/restore, rollback or forward-fix procedure, and application release gates.

## 5. Related documents

```text
schema/README.md       → SQL ownership and dependency order
QUICK_START.md         → local developer workflow
CLAUDE.md              → agent rules
AGENTS.md              → agent rules
README.md              → Supabase-specific overview
```
