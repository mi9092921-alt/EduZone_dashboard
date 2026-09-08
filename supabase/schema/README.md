# Canonical Database Schema — EduZone

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`

## 1. Purpose

This directory is the canonical development-stage SQL source represented by `supabase/config.toml`.

The schema is intentionally split into ordered layers so that ownership is explicit and reviewable.

## 2. File ownership

| File | Primary ownership |
|---|---|
| `01_extensions.sql` | extensions and schemas |
| `02_types.sql` | types/domains |
| `03_tables.sql` | table definitions |
| `04_constraints.sql` | PK/FK/UNIQUE/CHECK/EXCLUDE constraints |
| `05_indexes.sql` | indexes |
| `06_views.sql` | views/materialized views |
| `07_functions.sql` | functions/procedures |
| `08_triggers.sql` | triggers |
| `09_rls.sql` | RLS enablement and policies |
| `10_permissions.sql` | GRANT/REVOKE/default privileges |
| `11_seed_reference.sql` | seed/reference SQL represented by the current repository policy |
| `VALIDATION.sql` | validation queries; not application DDL |

Do not create duplicate active definitions in another SQL file.

## 3. Dependency order

The configured order is:

```text
01 → 02 → 03 → 04 → 05 → 07 → 06 → 08 → 09 → 10 → 11
```

`VALIDATION.sql` is a verification artifact, not another schema layer.

## 4. Security expectations

For security-sensitive SQL:

```text
RLS must remain enforced as intended
SECURITY DEFINER functions must use a controlled search_path
function EXECUTE privileges must remain least-privilege
tenant scope must be checked from trusted context
```

A source-level inspection is not enough to claim that the deployed policies behave correctly.

## 5. Shared-database rule

The schema is consumed by both:

```text
EduZone_dashboard
EduZone_App
```

Before renaming/removing/changing an RPC or shared object, trace consumers in both repositories.

## 6. Change procedure

```text
Check
→ identify exact owner file
→ inspect all callers
→ change the canonical source
→ run schema validation/reset as appropriate
→ run targeted application/security tests
→ search for dangling references
→ review diff
```

## 7. Status language

Use these terms precisely:

```text
IMPLEMENTED      = source/configuration is present
VERIFIED         = executable evidence passed
UNVERIFIED       = not tested in the current assessment
PRODUCTION READY = release gates and operational evidence are complete
```

Do not use `PRODUCTION READY` merely because all schema files exist.
