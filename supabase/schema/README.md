# Modular Schema Layout (`supabase/schema`)

This directory is the **canonical database schema** for the development-stage database. All active SQL that defines or secures the database must live here.

## Canonical source

| Role                           | Path                             |
| ------------------------------ | -------------------------------- |
| Canonical schema (DDL + logic) | `supabase/schema/*.sql`          |
| Validation                     | `supabase/schema/VALIDATION.sql` |

**Rule:** Edit the existing canonical files in this directory directly. Do not create migration files, external SQL copies, generated patches, or a second active schema source.

## File Layout and Ownership

Each SQL object type has exactly one home. Cross-file duplication is invalid.

| File                    | Contents                                                                                                                                                         | Must NOT contain                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `01_extensions.sql`     | `CREATE SCHEMA`, `CREATE EXTENSION`, extension-related grants                                                                                                    | Tables, functions, RLS                                                               |
| `02_types.sql`          | `CREATE TYPE`, `ALTER TYPE`, domains                                                                                                                             | Tables, constraints                                                                  |
| `03_tables.sql`         | `CREATE TABLE`, `PARTITION OF`, `COMMENT ON TABLE`. Includes Primary Keys for staging tables (e.g., `internal.enrollment_progress_temp`).                        | Indexes, FK `ALTER TABLE`, functions                                                 |
| `04_constraints.sql`    | `ALTER TABLE` constraints: `PRIMARY KEY`, `UNIQUE`, `FOREIGN KEY`, `CHECK`, `EXCLUDE`; constraint-related `DO` blocks                                            | `CREATE INDEX` (indexes belong in `05`)                                              |
| `05_indexes.sql`        | `CREATE INDEX`, `DROP INDEX`, index-related `DO` blocks                                                                                                          | Tables, FK constraints                                                               |
| `06_views.sql`          | `CREATE VIEW`, `CREATE MATERIALIZED VIEW`, `ALTER VIEW`                                                                                                          | Tables, functions                                                                    |
| `07_functions.sql`      | `CREATE FUNCTION`, `CREATE PROCEDURE`. **Hardened:** All `SECURITY DEFINER` functions use `SET search_path = public, pg_temp`.                                   | Triggers, tables                                                                     |
| `08_triggers.sql`       | `CREATE TRIGGER`, `DROP TRIGGER`                                                                                                                                 | Table/function definitions                                                           |
| `09_rls.sql`            | `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `CREATE/DROP/ALTER POLICY`                                                                              | Functions, tables, seed                                                              |
| `10_permissions.sql`    | `GRANT`, `REVOKE`, `ALTER DEFAULT PRIVILEGES`. **Hardened:** Access restricted based on reference-checked audit (Revoked `anon` access to internal/admin logic). | DDL objects                                                                          |
| `11_seed_reference.sql` | Seed script content from `Eduzone_seed_qa.sql` only                                                                                                              | `CREATE TABLE`, `CREATE POLICY`, `CREATE FUNCTION`, `CREATE INDEX`, `CREATE TRIGGER` |

### Dependency order (apply / read order)

```
01_extensions → 02_types → 03_tables → 04_constraints → 05_indexes
→ 07_functions → 06_views → 08_triggers → 09_rls → 10_permissions
```

## Security & Performance Hardening (June 2026)

The following database-level improvements were implemented and are maintained as the canonical development schema. They improve database security and consistency, but they do **not** by themselves establish whole-application production readiness.

1. **Seed Data Integrity (`11_seed_reference.sql`)**:
   - Added System Tenant creation (ID: `00000000-0000-0000-0000-000000000001`)
   - Ensures role lookups for QA users succeed without dependency issues
   - Fixes `[AuthProvider] check_dashboard_access RPC failed: {}` errors on auth hydration

2. **Function Hardening (`07_functions.sql`)**:
   - All `SECURITY DEFINER` functions audited and hardened
   - Applied `SET search_path = public, pg_temp` to prevent search-path hijacking vulnerabilities

3. **Permission Hardening (`10_permissions.sql`)**:
   - Performed codebase-wide reference audit (Frontend, Edge Functions, Workers)
   - Integrated security hardening patch: Revoked `EXECUTE` privileges from `anon` and `authenticated` roles for 120+ internal/admin functions
   - Follows principle of least privilege with explicit GRANT model
   - Cleaned redundant legacy `GRANT` statements to ensure zero schema drift

4. **Primary Key Enforcement (`03_tables.sql`)**:
   - Added Primary Keys to staging tables (e.g., `internal.enrollment_progress_temp`) to resolve Performance Advisor warnings

## Database Readiness Status

| Category                | Status       | Details                                                                                              |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| **Auth Hydration**      | ✅ Fixed     | System Tenant now created in seed data; `check_dashboard_access()` RPC succeeds                      |
| **Security Advisor**    | ✅ Hardened  | 0 errors, 1 info (pgcrypto in public schema—planned for next window)                                 |
| **Performance Advisor** | ✅ Optimized | 0 errors, 0 warnings, 304 info items                                                                 |
| **Modular Schema**      | ✅ Complete  | 11 canonical schema layers plus `VALIDATION.sql`, proper dependency ordering, single source of truth |

> **Release-gate note:** live Supabase execution, Security/Performance Advisor results, application integration tests, and release-build verification remain separate evidence requirements. This file must not be used as a blanket claim that EduZone is production-ready.

## Related Documentation

- Project overview: [`../../CLAUDE.md`](../../CLAUDE.md)
- Database refactor notes: [`../../project_documents/database_refactor_report_v13.md`](../../project_documents/database_refactor_report_v13.md)
- Historical SQL that is no longer active belongs only under `supabase/_archived_patches/`.
