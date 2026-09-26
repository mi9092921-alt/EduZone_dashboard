# Canonical Database Schema — EduZone

**Reviewed:** 2026-09-24

## Purpose

This directory is the canonical development-stage SQL source represented by `supabase/config.toml`. Do not create duplicate active definitions elsewhere.

## File ownership

| File                    | Ownership                                                                  |
| ----------------------- | -------------------------------------------------------------------------- |
| `01_extensions.sql`     | extensions and schemas                                                     |
| `02_types.sql`          | types and domains                                                          |
| `03_tables.sql`         | table definitions                                                          |
| `04_constraints.sql`    | constraints                                                                |
| `05_indexes.sql`        | indexes                                                                    |
| `06_views.sql`          | views and materialized views                                               |
| `07_functions.sql`      | functions and procedures                                                   |
| `08_triggers.sql`       | triggers                                                                   |
| `09_rls.sql`            | RLS enablement and policies                                                |
| `10_permissions.sql`    | grants, revokes, and default privileges                                    |
| `11_seed_reference.sql` | reference/bootstrap data used by the repository policy                     |
| `12_seed_qa_demo.sql`   | disposable QA/E2E data; not in the production-oriented `schema_paths` list |
| `VALIDATION.sql`        | validation queries; not application DDL                                    |

## Configured order

```text
01 → 02 → 03 → 04 → 05 → 07 → 06 → 08 → 09 → 10 → 11
```

The order above is copied from `supabase/config.toml`; it is not inferred from filename sorting. The deployment helpers may apply the QA seed explicitly for a disposable test database.

## Security and shared-database rules

Keep RLS, controlled SECURITY DEFINER `search_path`, least-privilege function privileges, and trusted tenant checks intact. The database is documented as shared with `EduZone_App`; trace consumers in both repositories before changing a shared object. Source inspection is not proof that deployed policies behave correctly.

## Change procedure

```text
identify the owner file → trace callers → make the smallest change
→ run local/schema and targeted security checks → search for dangling references
→ review the diff
```

Use `IMPLEMENTED` for source/configuration, `VERIFIED` for executable evidence, and `UNVERIFIED` when the relevant runtime or external state was not checked.
