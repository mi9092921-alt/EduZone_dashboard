# Supabase Directory Structure & File Guide

> **⚠️ STALE — this file describes a `seed/00_system_seed_helper.sql` and
> a root-level `Eduzone_seed_qa.sql` as live files.** Neither exists in
> this repository. The current, accurate directory guide is
> `supabase/schema/README.md`; all active SQL lives under
> `supabase/schema/`, with legacy/superseded files preserved for reference
> under `supabase/_archived_patches/`.

## 📂 Complete File Organization

```
supabase/
├── SETUP_GUIDE.md              ⭐ START HERE: Complete deployment guide
├── QUICK_START.md              ⭐ Daily developer workflow
├── TROUBLESHOOTING.md          ⭐ Error diagnosis and solutions
├── SOLUTION_SUMMARY.md         📋 Overview of all fixes and improvements
│
├── README.md                   ⭐ Main README with development, deployment, and    
├── deploy.js                   🔧 Deployment script (Node.js)
├── deploy.sh                   🔧 Deployment script (Bash/Mac/Linux)
├── deploy.ps1                  🔧 Deployment script (PowerShell/Windows)
│
├── schema/                     📊 Modular schema decomposition
│   ├── README.md               📖 Schema object reference
│   ├── SETUP_GUIDE.md          (see parent)
│   ├── VALIDATION.sql          ✓ Health check queries
│   ├── 01_extensions.sql       Extensions, schemas, roles
│   ├── 02_types.sql            Custom types and domains
│   ├── 03_tables.sql           Table definitions (no FKs)
│   ├── 04_constraints.sql      FKs, PKs, unique, check
│   ├── 05_indexes.sql          All indexes
│   ├── 06_views.sql            Views and materialized views
│   ├── 07_functions.sql        ⚠️ SECURITY DEFINER with SET search_path
│   ├── 08_triggers.sql         Trigger definitions
│   ├── 09_rls.sql              ⚠️ RLS policies (security-audited)
│   ├── 10_permissions.sql      ⚠️ GRANT/REVOKE (hardened)
│   └── 11_seed_reference.sql   Reference seed data
│
├── seed/                       🌱 Seed scripts
│   ├── 00_system_seed_helper.sql  ⭐ CRITICAL: System tenant + roles + perms
│   └── (other seed files)
│
├── migrations/                 🚫 Not used for the development-stage canonical database
│   └── README.md               Documentation only; no active SQL
│
├── _archived_patches/          📦 Old migration versions
│
├── functions/                  ⚡ Edge Functions (Deno)
│   ├── bulk-action/
│   ├── bulk-export/
│   ├── bulk-worker/
│   ├── create-user/
│   ├── export-report/
│   └── get-lesson-content/
│
├── config.toml                 ⚙️ Local Supabase config
│
└── .temp/                      🗑️ Supabase temporary files (ignore)
```

---

## 🎯 Quick File Finder

### "I need to..."

#### Deploy the schema
1. First: Read `supabase/SETUP_GUIDE.md`
2. Then: Run `supabase/deploy.ps1` (Windows) or `supabase/deploy.sh` (Mac/Linux)
3. Verify: `supabase db execute < supabase/schema/VALIDATION.sql`

#### Understand the schema organization
1. Read: `supabase/schema/README.md` (object ownership & organization)
2. Reference: `supabase/schema/0X_*.sql` files in dependency order

#### Fix an error
1. Search: `supabase/TROUBLESHOOTING.md` for your error
2. Run: Diagnostic SQL queries provided
3. Apply: Solution SQL provided

#### Start development
1. Read: `supabase/QUICK_START.md`
2. Run: `supabase start`
3. Run: `supabase/deploy.ps1 local false`
4. Start: `cd apps/admin && pnpm dev`

#### Make schema changes
1. Edit the existing canonical file under `supabase/schema/`.
2. Do not create a migration or another active SQL source.
3. Move obsolete external SQL to `supabase/_archived_patches/` instead of deleting it.

#### Validate schema health
1. Run: `supabase db execute < supabase/schema/VALIDATION.sql`
2. Check: All results should be "PASS"
3. If fails: Check `TROUBLESHOOTING.md`

#### Update seed data
1. Edit: `supabase/seed/00_system_seed_helper.sql` (critical system data)
2. Edit: `Eduzone_seed_qa.sql` (QA data)
3. Reapply: `supabase db reset` (local only)

### Database change rule
The database is in development. Apply structural/security changes directly to the existing files under `supabase/schema/`. `supabase/migrations/` must not contain active SQL.

---

## 📖 Documentation Usage

| Document | When to Read | Purpose |
|----------|-------------|---------|
| **SOLUTION_SUMMARY.md** | First time setup | Overview of all fixes and improvements |
| **SETUP_GUIDE.md** | Before deploying | How to deploy in any environment |
| **QUICK_START.md** | Every development session | Daily workflow and common commands |
| **TROUBLESHOOTING.md** | When something breaks | Error diagnosis and solutions |
| **schema/README.md** | When modifying schema | Object reference and ownership rules |
| **VALIDATION.sql** | After deployment | Automated health checks |

---

## 🚀 Common Workflows

### Initial Setup (First Time)
```
Read SETUP_GUIDE.md
    ↓
Run deploy.ps1 / deploy.sh
    ↓
Run VALIDATION.sql
    ↓
Read QUICK_START.md
    ↓
Start development
```

### Daily Development
```
supabase start
    ↓
Make code changes
    ↓
If schema needed: Create migration or use db execute
    ↓
Test in app
    ↓
Commit and push
```

### Schema Troubleshooting
```
Error occurs
    ↓
Search TROUBLESHOOTING.md
    ↓
Run diagnostic queries
    ↓
Apply solution SQL
    ↓
Run VALIDATION.sql to verify
```

### Production Deployment
```
Read SETUP_GUIDE.md (Production section)
    ↓
Prepare canonical schema
    ↓
Get DevOps approval
    ↓
Deploy to staging
    ↓
Run VALIDATION.sql
    ↓
Deploy to production
    ↓
Monitor via Supabase Dashboard
```

---

## 🔒 Security-Critical Files

⚠️ These files contain security hardening - don't modify without understanding impact:

| File | Criticality | What It Does |
|------|-----------|-------------|
| `schema/07_functions.sql` | 🔴 Critical | SECURITY DEFINER + SET search_path |
| `schema/09_rls.sql` | 🔴 Critical | RLS policies (tenant isolation) |
| `schema/10_permissions.sql` | 🔴 Critical | GRANT/REVOKE (access control) |
| `seed/00_system_seed_helper.sql` | 🟠 High | System tenant + roles (auth requirement) |

---

## ⭐ Start Here Flowchart

```
                    START
                      ↓
        ┌─────────────────────────┐
        │ What do you need to do? │
        └─────────────────────────┘
              ↙        ↓        ↘
        Deploy    Develop    Fix Bug
          ↓          ↓          ↓
    SETUP_GUIDE   QUICK_START  TROUBLESHOOTING
          ↓          ↓          ↓
      deploy.sh   pnpm dev    VALIDATION.sql
      VALIDATION     ↓          ↓
         ↓        code OK     Issue fixed?
       Ready!     test app      ↓
                                Ready!
```

---

## 📋 File Checklist for Common Tasks

### ✅ Before Merging Code
- [ ] Schema changes are applied to the existing canonical file under `supabase/schema/`
- [ ] No hard-coded connection strings
- [ ] VALIDATION.sql passes
- [ ] No direct seed data changes (use migrations instead)

### ✅ Before Deploying to Staging
- [ ] SETUP_GUIDE.md reviewed
- [ ] Canonical `supabase/schema/` files tested locally
- [ ] VALIDATION.sql passes
- [ ] Seed data verified

### ✅ Before Deploying to Production
- [ ] All staging tests pass
- [ ] DevOps approval obtained
- [ ] Backup verified
- [ ] Rollback plan documented
- [ ] Monitoring set up

---

## 🆘 Quick Help

### File Not Found
- Check: Is file in correct location? Use structure above
- Check: Run from correct directory (`cd supabase`)
- Check: Correct filename (case-sensitive on Mac/Linux)

### Script Won't Run
- Windows: Use `deploy.ps1` (requires PowerShell)
- Mac/Linux: Use `deploy.sh` (requires Bash)
- Either: Check file has execute permissions: `chmod +x deploy.sh`

### Schema Changes Not Applied
- Did you run `supabase db push`?
- Did you restart the app?
- Did you check `VALIDATION.sql`?

### Can't Find What I Need
- Check: TROUBLESHOOTING.md has 8+ common issues
- Check: QUICK_START.md has common commands
- Check: SETUP_GUIDE.md has full documentation
- Check: schema/README.md has object reference

---

## 📞 Support Resources

| Issue | Check | Document |
|-------|-------|----------|
| Deployment errors | Validation output | SETUP_GUIDE.md |
| Auth hydration failing | RPC grants | TROUBLESHOOTING.md |
| Schema questions | Object ownership | schema/README.md |
| Daily workflow | Commands list | QUICK_START.md |
| App architecture | System design | ../../CLAUDE.md |

---

## 🎁 Summary

**Files You'll Use Most:**
1. `QUICK_START.md` (daily)
2. `SETUP_GUIDE.md` (deployment)
3. `TROUBLESHOOTING.md` (errors)
4. `deploy.ps1` or `deploy.sh` (automation)
5. `schema/VALIDATION.sql` (verification)

**Start With:**
1. Read: SOLUTION_SUMMARY.md (5 min overview)
2. Read: SETUP_GUIDE.md (deployment instructions)
3. Run: `deploy.ps1 local false` (automated setup)
4. Read: QUICK_START.md (for future development)

---

**Last Updated:** June 1, 2026  
**Version:** 13.9.0  
**Status:** ✅ Production Ready
