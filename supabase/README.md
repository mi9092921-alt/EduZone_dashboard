# EduZone Supabase

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Status:** **Database infrastructure present; production readiness requires runtime evidence**

## 1. What this directory contains

```text
supabase/
├── schema/         # canonical ordered SQL inputs
├── functions/      # Deno Edge Functions
├── migrations/     # repository area; do not treat as a proven migration chain
├── config.toml
└── deployment/validation tooling
```

## 2. Canonical schema

The current `config.toml` defines these ordered schema inputs:

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

Ownership rules are documented in `schema/README.md`.

## 3. Security model

The schema includes:

```text
RLS policies
SECURITY DEFINER functions
explicit grants/revokes
constraints/indexes/triggers/views
validation SQL
```

These are source-level controls. They are not by themselves evidence of a passing production security assessment.

## 4. Shared database warning

This Supabase project is shared by:

```text
EduZone_dashboard
EduZone_App
```

Any shared-schema change must be evaluated against both repositories.

## 5. Development verification

Use the project's actual configuration and scripts. Typical local verification includes:

```bash
supabase start
supabase status
supabase db reset
```

and the repository's schema validation tooling where applicable.

Do not run destructive commands against production without an explicit operational procedure and backup/restore plan.

## 6. Database change policy

Before changing a function, table, policy, constraint, index, or RPC:

```text
1. inspect canonical schema ownership
2. find all callers
3. check both repositories
4. check tests and Edge Functions
5. make the smallest safe change
6. verify local/database behavior
7. re-check references
```

Never weaken RLS or grants merely to make an application test pass.

## 7. Runtime release gate

Production database approval requires evidence for:

```text
schema deployment
RLS tenant isolation
function grants/search_path
critical RPC behavior
idempotency/concurrency
backup/restore
rollback or forward-fix procedure
```

## 8. Documentation rule

Older files that state “Production Ready” without corresponding current evidence must be treated as stale documentation and updated rather than copied forward.
