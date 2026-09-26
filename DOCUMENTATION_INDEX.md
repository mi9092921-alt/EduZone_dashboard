# EduZone Dashboard — Documentation Index

**Reviewed:** 2026-09-24
**Purpose:** identify the current source of truth and separate it from plans and historical reports.

## Current operational references

| Path                                                                                               | Purpose                                                    |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`README.md`](README.md)                                                                           | Repository orientation and verified local paths/commands   |
| [`CLAUDE.md`](CLAUDE.md)                                                                           | Engineering and agent constraints                          |
| [`agent_prompt_eduzone_db.md`](agent_prompt_eduzone_db.md)                                         | Database change-control rules                              |
| [`project_documents/PRODUCTION_READINESS_PLAN.md`](project_documents/PRODUCTION_READINESS_PLAN.md) | Release evidence ledger; no production approval is implied |
| [`supabase/README.md`](supabase/README.md)                                                         | Supabase operations and evidence boundary                  |
| [`supabase/schema/README.md`](supabase/schema/README.md)                                           | SQL ownership and configured order                         |
| [`supabase/QUICK_START.md`](supabase/QUICK_START.md)                                               | Local Supabase workflow                                    |
| [`supabase/SETUP_GUIDE.md`](supabase/SETUP_GUIDE.md)                                               | Schema deployment and QA-seed boundary                     |
| [`.github/BRANCH_PROTECTION.md`](.github/BRANCH_PROTECTION.md)                                     | Dated GitHub protection snapshot and re-check commands     |

## Plans and specifications

The following documents describe requirements, design targets, or proposed work. They are not evidence that the described feature, integration, route, command, or deployment exists:

- [Production Architecture Execution Plan](EduZone%20Dashboard%20%E2%80%94%20Production%20Architecture%20Execution%20Plan.md)
- [`project_documents/FOUR_FEATURES_EXECUTION_PLAN.md`](project_documents/FOUR_FEATURES_EXECUTION_PLAN.md)
- [`project_documents/GOOGLE_DRIVE_VIDEO_PLAN.md`](project_documents/GOOGLE_DRIVE_VIDEO_PLAN.md)
- [`project_documents/EduZone_Admin_Dashboard_PRD_v2.md`](project_documents/EduZone_Admin_Dashboard_PRD_v2.md)
- [`project_documents/EduZone_API_Design_v1.md`](project_documents/EduZone_API_Design_v1.md)
- [`project_documents/EduZone_Clean_Architecture_v1.md`](project_documents/EduZone_Clean_Architecture_v1.md)
- [`project_documents/EduZone_Design_Tokens_v1.md`](project_documents/EduZone_Design_Tokens_v1.md)
- [`project_documents/implementation_plan.md`](project_documents/implementation_plan.md)

## Historical reports

Milestone, go/no-go, closure, audit, and performance reports retain their original dates and evidence claims. They must be read as point-in-time records, not as the current release status. Current claims belong in the production-readiness plan and must be backed by a new executable result.

## Maintenance rules

1. Source code, configuration, tests, SQL, and observed runtime evidence outrank documentation.
2. Use `IMPLEMENTED`, `VERIFIED`, and `UNVERIFIED` precisely; do not use `PRODUCTION READY` for source inspection alone.
3. Keep one owner for current release status and link to it instead of copying claims.
4. Mark planned paths and integrations as planned; do not present them as existing files or services.
5. Update or remove broken local links when files move or are deleted.
