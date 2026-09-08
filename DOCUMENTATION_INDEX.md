# EduZone Dashboard — Documentation Index

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-08  
**Purpose:** define documentation ownership and prevent competing sources of truth

## Current operational documents 

| Path | Owner | Use for |
|---|---|---|
| `README.md` | Repository | project orientation and current release status |
| `CLAUDE.md` | Engineering | AI/developer constraints and architecture rules |
| `agent_prompt_eduzone_db.md` | Database | strict DB change-control instructions |
| `project_documents/PRODUCTION_READINESS_PLAN.md` | Release | production gate and evidence ledger |
| `Performance_Reliability_Execution_Plan.md` | Performance | performance/reliability execution and verification |
| `supabase/README.md` | Database ops | current Supabase layout, operations, and release boundaries |
| `supabase/CLAUDE.md` | Database agents | Supabase-specific agent rules |
| `supabase/AGENTS.md` | Database agents | Supabase-specific agent rules |
| `supabase/FILE_GUIDE.md` | Database ops | file/command navigation |
| `supabase/QUICK_START.md` | Database ops | local development quick start |
| `supabase/SETUP_GUIDE.md` | Database ops | setup/deployment procedure |
| `supabase/schema/README.md` | Database schema | canonical SQL ownership and verification rules |
| `supabase/migrations/README.md` | Database governance | explains why the migrations directory contains no active migration chain |
| `.github/BRANCH_PROTECTION.md` | Release governance | expected and observed `main` protection state |

## Reference documents

`project_documents/` also contains architecture, API, design, testing, monitoring, DevOps, PRD, RFC, security, and other historical/reference documents.

Reference documents must not silently override the evidence ledger in `project_documents/PRODUCTION_READINESS_PLAN.md`.

## Maintenance rules

1. Avoid duplicating the same current status across documents.
2. Use exact dates and commit SHAs for point-in-time assessments.
3. Distinguish `IMPLEMENTED`, `VERIFIED`, `UNVERIFIED`, and `PRODUCTION READY`.
4. Update operational documentation when source/configuration changes invalidate a claim.
5. Do not document files, commands, or workflows that do not exist in the current repository.
6. Temporary planning notes must not become competing sources of truth.

## Known cleanup target

` `  .
