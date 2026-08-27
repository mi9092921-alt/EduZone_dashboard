# EduZone — Supabase Project Guide for AI Agents

> **Version:** 13.9.0 | **Last Updated:** 2026-06-01 | **Status:** ✅ Production Ready

---

## 🎯 Project Overview

**EduZone** is a multi-tenant Learning Management System (LMS) built on Supabase (PostgreSQL + Auth + Edge Functions). It supports multiple tenants (schools/organizations), each with their own users, courses, and settings — all isolated via Row-Level Security (RLS).

### Key Characteristics
- **Multi-tenant**: Every table has `tenant_id`. RLS enforces isolation.
- **Schema version**: v13 (canonical). Migrations are incremental patches on top.
- **Auth**: Supabase Auth (`auth.users`) synced to `public.users` via triggers.
- **Edge Functions**: Deno-based serverless functions for bulk operations.
- **Region-aware**: Data residency per tenant (`region_id`).

---

## 📂 Directory Structure

```
supabase/
│
├── CLAUDE.md                    ← YOU ARE HERE — AI agent guide
├── FILE_GUIDE.md                ← Human-friendly file finder
├── QUICK_START.md               ← Daily developer workflow
├── SETUP_GUIDE.md               ← Full deployment guide
├── TROUBLESHOOTING.md           ← Error diagnosis
├── SOLUTION_SUMMARY.md          ← Overview of all fixes
│
├── deploy.ps1                   ← Deployment script (Windows/PowerShell)
├── deploy.sh                    ← Deployment script (Mac/Linux/Bash)
├── config.toml                  ← Supabase local config
│
├── schema/                      ← Canonical schema (deploy ORDER MATTERS)
│   ├── 01_extensions.sql        ← Extensions + schemas (public, private, auth)
│   ├── 02_types.sql             ← Custom ENUM types and domains
│   ├── 03_tables.sql            ← All table definitions (no FK constraints)
│   ├── 04_constraints.sql       ← FK, PK, UNIQUE, CHECK constraints
│   ├── 05_indexes.sql           ← All indexes
│   ├── 06_views.sql             ← Views and materialized views
│   ├── 07_functions.sql         ← Functions (SECURITY DEFINER + search_path)
│   ├── 08_triggers.sql          ← Trigger definitions
│   ├── 09_rls.sql               ← RLS policies (tenant isolation)
│   ├── 10_permissions.sql       ← GRANT/REVOKE (access control)
│   ├── 11_seed_reference.sql    ← ⚠️ REDIRECT ONLY — seeds moved to seed/
│   ├── VALIDATION.sql           ← Health check queries
│   └── README.md                ← Schema object reference
│
├── seed/                        ← 🌱 ALL SEED DATA IS HERE
│   └── 00_system_seed_helper.sql  ← System tenant, roles, permissions
│
├── migrations/                  ← Incremental patches (v12 → v13+)
│   ├── 20260517_create_enqueue_job.sql
│   ├── 20260518_fix_admin_cancel_job.sql
│   ├── 20260519_fix_admin_get_jobs.sql
│   ├── 20260520_fix_dequeue_job.sql
│   ├── 20260521_worker_update_bulk_job.sql
│   ├── 20260522_worker_bulk_user_actions.sql
│   └── 20260523_admin_get_job.sql
│
├── functions/                   ← Supabase Edge Functions (Deno)
│   ├── bulk-action/
│   ├── bulk-export/
│   ├── bulk-worker/
│   ├── create-user/
│   ├── export-report/
│   └── _shared/
│
├── _archived_patches/           ← Old/superseded migrations (do not apply)
└── .temp/                       ← Supabase temp files (ignore)
```

---

## 🌱 Seed Data — Single Source of Truth

> **RULE: ALL seed data lives in `seed/`. Do NOT add seeds anywhere else.**

### Seed Files (in execution order)

| File | Purpose | Environment |
|------|---------|-------------|
| `seed/00_system_seed_helper.sql` | System tenant, roles, permissions, system settings, rate limit rules, feature flags, audit chain state | ALL (required) |
| `seed/01_qa.sql` | QA test users (auth + public), tenants, courses, sections, lessons, enrollments, progress, warnings, devices, etc. | Local/Staging ONLY |

### ⚠️ Deprecated Seed Files (do NOT use or add to)
These files still exist but are deprecated — their content is fully captured in `seed/`:
- `Eduzone_seed_qa.sql` (root level) — superseded by `seed/01_qa.sql`
- `schema/11_seed_reference.sql` — now a redirect only; real data is in `seed/01_qa.sql`

### Seed Execution Order

```
1. Deploy schema (01→10)
2. seed/00_system_seed_helper.sql   ← System tenant + roles + permissions + settings
3. seed/01_qa.sql                   ← Test users + tenants + content (local/staging only)
```

### Adding New Seed Data
- **System data** (regions, settings, rate limits, feature flags): → `seed/00_system_seed_helper.sql`
- **QA test data** (users, courses, enrollments): → `seed/01_qa.sql`
- Always use `ON CONFLICT (...) DO NOTHING` for idempotency
- Never hardcode UUIDs that clash with existing ones (see UUID conventions below)

---

## 🔑 UUID Conventions

| Pattern | Used For |
|---------|---------|
| `00000000-0000-0000-0000-000000000001` | System Tenant (SACRED — never delete) |
| `aaaaaaaa-0000-0000-0000-00000000000X` | QA auth users (X = 1-5: super_admin, admin, teacher, student, student2) |
| `11111111-0000-0000-0000-000000000001` | EduZone QA Tenant |
| `11111111-0000-0000-0000-000000000002` | Demo School Tenant |
| `11111111-1111-1111-1111-111111111111` | Test Tenant 001 |
| `cccccccc-0000-0000-0000-00000000000X` | Sample courses (X = 1-5) |
| `55555555-0000-0000-0000-00000000000X` | Sample sections |
| `bbbbbbbb-0000-0000-0000-00000000000X` | Sample lessons |
| `22222222-2222-2222-2222-222222222222` | Test Admin user (test-tenant-001) |
| `33333333-3333-3333-3333-333333333333` | Test course (test-tenant-001) |

---

## 🏗️ Schema Architecture

### Database Schemas (PostgreSQL schemas, not files)
- `public` — Application tables (users, courses, enrollments, etc.)
- `private` — Internal tables (user_access_cache, etc.) — not exposed to API
- `auth` — Supabase Auth (managed by Supabase, we only seed it)

### Core Tables (dependency order)
```
regions → tenants → users (auth.users synced via trigger)
                  → roles → role_permissions → permissions
                  → user_roles
                  → courses → sections → lessons → lesson_contents
                  → enrollments → user_progress
                  → warnings
                  → devices
                  → notifications → user_notifications
                  → activity_logs
```

### System Tenant
- ID: `00000000-0000-0000-0000-000000000001`
- Slug: `system`
- Houses all system-level roles (`super_admin`, `admin`, `teacher`, `student`)
- **Never delete or modify this tenant**

### Multi-tenancy Pattern
Every table with tenant data has:
```sql
tenant_id uuid NOT NULL REFERENCES public.tenants(id)
```
RLS policies use `auth.jwt() ->> 'tenant_id'` or helper functions to enforce isolation.

---

## 🔒 Security Model

### RLS (Row-Level Security)
- **ALL public tables have RLS enabled** (`schema/09_rls.sql`)
- Policies use `SET search_path = ''` to prevent injection
- Three claim sources: `auth.jwt()`, `auth.uid()`, and `public.get_my_claim()`

### Functions Security
- **ALL functions use `SECURITY DEFINER` + `SET search_path = ''`** (`schema/07_functions.sql`)
- Never create functions without `SET search_path = ''`

### Permissions
- `anon` role: very limited read access
- `authenticated` role: tenant-scoped access via RLS
- `service_role`: full access (Edge Functions only)

### Critical Security Files
| File | What it does |
|------|-------------|
| `schema/07_functions.sql` | SECURITY DEFINER functions — do not modify without audit |
| `schema/09_rls.sql` | RLS policies — tenant isolation |
| `schema/10_permissions.sql` | GRANT/REVOKE — access control |
| `seed/00_system_seed_helper.sql` | System roles — auth requirement |

---

## ⚡ Edge Functions

Located in `functions/`. Written in Deno (TypeScript).

| Function | Purpose |
|---------|---------|
| `bulk-action` | Initiate bulk user operations (lock, unlock, etc.) |
| `bulk-export` | Export data in bulk |
| `bulk-worker` | Process bulk job queue |
| `create-user` | Create new users with tenant context |
| `export-report` | Generate and export reports |
| `_shared/` | Shared utilities and types |

### Calling Edge Functions
```typescript
const { data, error } = await supabase.functions.invoke('bulk-action', {
  body: { action: 'lock', user_ids: [...] }
})
```

---

## 🗃️ Key Database Patterns

### Idempotent Inserts
Always use `ON CONFLICT ... DO NOTHING` or `ON CONFLICT ... DO UPDATE`:
```sql
INSERT INTO public.settings_kv (key, value, ...)
VALUES (...)
ON CONFLICT (key) DO NOTHING;
```

### Checking System Tenant
```sql
SELECT public.system_tenant_id();
-- Returns: '00000000-0000-0000-0000-000000000001'
```

### Getting Current User's Claims
```sql
SELECT public.get_my_claim('tenant_id');
SELECT public.get_my_claim('role');
```

### Tenant-Scoped Queries
```sql
-- Always include tenant_id in queries
SELECT * FROM public.courses
WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid;
```

---

## 🚀 Common Commands

### Local Development
```powershell
# Start Supabase locally
supabase start

# Deploy schema (Windows)
.\deploy.ps1 local false

# Deploy schema only (no seed)
.\deploy.ps1 local true

# Apply seed data manually
supabase db execute < seed/00_system_seed_helper.sql
supabase db execute < seed/01_qa.sql

# Reset local DB (re-applies everything)
supabase db reset

# Validate schema health
supabase db execute < schema/VALIDATION.sql

# Open local Studio
supabase studio
```

### Migrations
```powershell
# Create new migration
supabase migration new <descriptive_name>

# Push migrations to remote
supabase db push

# List applied migrations
supabase migration list
```

### Edge Functions
```powershell
# Serve locally
supabase functions serve

# Deploy specific function
supabase functions deploy bulk-action

# Deploy all functions
supabase functions deploy
```

---

## 📋 Rules for AI Agents

### ALWAYS
- ✅ Use `ON CONFLICT ... DO NOTHING` for all seed inserts
- ✅ Include `tenant_id` in every new table
- ✅ Add `SET search_path = ''` to every new function
- ✅ Use `SECURITY DEFINER` for functions that bypass RLS
- ✅ Add both `created_at` and `updated_at` to new tables
- ✅ Put all seed data in `seed/` directory only
- ✅ Use numbered file format (`01_name.sql`) for new schema files
- ✅ Use timestamped format (`YYYYMMDD_name.sql`) for migrations
- ✅ Run `schema/VALIDATION.sql` after schema changes

### NEVER
- ❌ Add seed data to `schema/` files (except `11_seed_reference.sql` which is deprecated)
- ❌ Add seed data to root-level `.sql` files
- ❌ Modify the System Tenant (`00000000-0000-0000-0000-000000000001`)
- ❌ Create functions without `SET search_path = ''`
- ❌ Disable RLS on any table
- ❌ Use `SELECT *` in production functions (always specify columns)
- ❌ Apply `_archived_patches/` files (they are superseded)
- ❌ Hardcode passwords or secrets in SQL files
- ❌ Use `TRUNCATE` on production data

---

## 🔄 Deployment Flow

### Fresh Deploy (new environment)
```
1. supabase db push (schema files 01→10 in order)
2. supabase db execute < seed/00_system_seed_helper.sql
3. [STAGING ONLY] supabase db execute < seed/01_qa.sql
4. supabase db execute < schema/VALIDATION.sql
```

### Schema Change Flow
```
1. For table/column changes: Create migration in migrations/
2. For function/policy changes: Use supabase db execute directly
3. Never modify schema/ files in place after initial deploy (use migrations)
```

### Seed Update Flow
```
1. Edit seed/00_system_seed_helper.sql OR seed/01_qa.sql
2. Local: supabase db reset (re-applies all)
3. Remote: supabase db execute < seed/00_system_seed_helper.sql (idempotent)
```

---

## 🐛 Common Issues & Quick Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `RLS policy violation` | Missing `tenant_id` claim in JWT | Check user has role in `user_roles` |
| `FK violation on user insert` | Auth user not synced to public.users | Check trigger `on_auth_user_created` |
| `Function not found` | Search path issue | Add `SET search_path = ''` |
| `Seed fails with FK error` | Wrong execution order | Apply system seed first, then QA seed |
| `Duplicate key on seed` | Seed applied twice | Use `ON CONFLICT DO NOTHING` (already in files) |

See `TROUBLESHOOTING.md` for detailed diagnosis and solutions.

---

## 📊 QA Test Accounts

| Email | Password | Role | Tenant |
|-------|---------|------|--------|
| `super_admin@eduzone-test.com` | `Admin@12345` | super_admin | EduZone QA |
| `admin@eduzone-test.com` | `Admin@12345` | admin | EduZone QA |
| `teacher@eduzone-test.com` | `Admin@12345` | teacher | EduZone QA |
| `student@eduzone-test.com` | `Admin@12345` | student | EduZone QA |
| `student2@eduzone-test.com` | `Admin@12345` | student (locked) | EduZone QA |
| `admin@test.eduzone.local` | `Admin@12345` | admin | Test Tenant 001 |

---

## 📚 Related Documentation

| Document | Purpose |
|----------|---------|
| [SETUP_GUIDE.md](./SETUP_GUIDE.md) | Full deployment instructions for all environments |
| [QUICK_START.md](./QUICK_START.md) | Daily development workflow |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Error diagnosis and solutions |
| [FILE_GUIDE.md](./FILE_GUIDE.md) | File finder for common tasks |
| [schema/README.md](./schema/README.md) | Schema object ownership and organization |
| [schema/VALIDATION.sql](./schema/VALIDATION.sql) | Automated health checks |

---

*This file is the authoritative guide for AI agents working on this codebase. Keep it updated when making architectural changes.*
