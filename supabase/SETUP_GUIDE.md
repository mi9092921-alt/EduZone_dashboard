# Supabase Setup Guide - EduZone v13

> **⚠️ STALE — commands below reference `Eduzone_schema_v13.sql` /
> `Eduzone_seed_qa.sql`, which do not exist in this repository.** The
> canonical schema is `supabase/schema/*.sql` (apply order + seed data are
> defined in `supabase/config.toml`'s `db.migrations.schema_paths` and in
> `supabase/schema/README.md`). For an actually up-to-date deploy flow, use
> `supabase/deploy.ps1` or `supabase db push` directly instead of the
> step-by-step commands below.

> **Last Updated:** June 2026  
> **Status:** Production Ready with Modular Schema Structure

## Quick Start

### Local Development Setup

```bash
# 1. Start local Supabase stack
supabase start

# 2. Apply canonical schema (once only)
supabase db push

# 3. Seed development data
supabase db execute Eduzone_seed_qa.sql

# 4. Verify installation
supabase status
```

### Production Deployment

```bash
# 1. Connect to remote database
export SUPABASE_DB_URL="postgresql://..."

# 2. Apply schema using canonical source
psql $SUPABASE_DB_URL < Eduzone_schema_v13.sql

# 3. Apply incremental migrations (if needed)
for file in supabase/migrations/*.sql; do
  psql $SUPABASE_DB_URL < "$file"
done

# 4. Apply seed data
psql $SUPABASE_DB_URL < Eduzone_seed_qa.sql
```

---

## Schema Organization

### Canonical Source (Single Source of Truth)

- **File:** `Eduzone_schema_v13.sql` (~436 KB)
- **Contents:** Complete DDL + DML (bootstrap, schema, objects, seed)
- **Purpose:** Production deployments, version control reference
- **Apply once:** `supabase db push` or direct `psql`

### Modular Decomposition (Navigation + Supabase CLI Alignment)

Directory: `supabase/schema/` (11 files, READ-ONLY)

| File | Objects | Status |
|------|---------|--------|
| `01_extensions.sql` | Schema, extensions, roles | ✅ Stable |
| `02_types.sql` | Domain types, custom types | ✅ Stable |
| `03_tables.sql` | All tables, PKs (excluding FKs) | ✅ Stable |
| `04_constraints.sql` | FKs, unique, check, exclude | ✅ Stable |
| `05_indexes.sql` | All indexes, index metadata | ✅ Stable |
| `06_views.sql` | Views, materialized views | ✅ Stable |
| `07_functions.sql` | Functions, procedures, helpers | ✅ Hardened |
| `08_triggers.sql` | Triggers, trigger functions | ✅ Stable |
| `09_rls.sql` | RLS policies, policy grants | ✅ Security-Audited |
| `10_permissions.sql` | GRANT/REVOKE, default privileges | ✅ Hardened |
| `11_seed_reference.sql` | Reference seed data only | ✅ Fixed |

**Dependency Order (Apply in sequence):**
```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11
```

### Incremental Patches (Migrations)

Directory: `supabase/migrations/` (patch files from v12→v13)

- Applied automatically by Supabase CLI after canonical schema
- **Do not apply manually** if using canonical schema
- Used for version upgrades and hotfixes post-deployment

---

## Seed Data Strategy

### System Tenant (REQUIRED)

```sql
-- Must exist before roles/users are created
INSERT INTO public.tenants (id, slug, name, plan, status, region_id, data_residency, max_users, max_courses)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'system', 'System Tenant', 'enterprise', 'active', 'me-south-1', 'me-south-1', 99999, 99999)
ON CONFLICT (id) DO NOTHING;
```

### Role Creation (DEPENDS ON: System Tenant)

```sql
-- Roles are created with system_tenant_id() reference
INSERT INTO public.roles (tenant_id, name, label, is_system, priority) VALUES
  (public.system_tenant_id(), 'super_admin', 'Super admin', true, 100),
  (public.system_tenant_id(), 'admin', 'Admin', true, 80),
  (public.system_tenant_id(), 'teacher', 'Teacher', true, 50),
  (public.system_tenant_id(), 'student', 'Student', true, 10)
ON CONFLICT (tenant_id, name) DO NOTHING;
```

### User Roles Assignment (DEPENDS ON: Roles)

```sql
-- Links users to roles via system_tenant_id() lookup
INSERT INTO public.user_roles (user_id, role_id, tenant_id)
SELECT u.id, r.id, u.tenant_id
FROM public.users u
JOIN public.roles r ON r.name = u.primary_role AND r.tenant_id = public.system_tenant_id()
ON CONFLICT DO NOTHING;
```

### Auth Hydration (Ensures check_user_access() RPC works)

The `check_user_access()` RPC verifies:
1. User exists and is not deleted
2. Account status is 'active'
3. JWT tenant_id matches user's tenant_id (or user is admin in that tenant)
4. Returns: `{ allowed: bool, tenant_id: uuid, role: string, token_version: int }`

**If this RPC fails:**
- ❌ Ensure system tenant exists
- ❌ Ensure user record exists in public.users
- ❌ Verify account_status = 'active'
- ❌ Check token_version matches JWT

---

## Deployment Checklist

### Before First Deploy

- [ ] Backup existing database (if upgrading)
- [ ] Review breaking changes in CHANGELOG
- [ ] Test in staging environment first

### Apply Schema

- [ ] Run `supabase db push` (canonical schema)
  - OR `psql < Eduzone_schema_v13.sql`
- [ ] Verify no errors: `SELECT version FROM schema_migrations WHERE version = 'v13.0.0'`

### Verify Security

```sql
-- Check RLS is enabled on all mutable tables
SELECT tablename FROM pg_tables WHERE tablename LIKE 'users' OR tablename LIKE 'courses' 
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE table_name = pg_tables.tablename);

-- Verify no anon access to sensitive functions
SELECT grantee, privilege_type 
FROM role_table_grants 
WHERE table_schema = 'public' AND grantee = 'anon';
```

### Verify Permissions

```sql
-- Check that authenticated users can execute check_user_access()
SELECT grantee, privilege_type 
FROM information_schema.role_routine_grants
WHERE routine_name = 'check_user_access';
-- Expected: authenticated=EXECUTE, service_role=EXECUTE, anon=NONE
```

### Load Seed Data

```bash
# QA seed (if not already in canonical schema)
supabase db execute Eduzone_seed_qa.sql

# Verify seed was applied
SELECT COUNT(*) FROM public.users;
SELECT COUNT(*) FROM public.tenants;
```

### Test Auth Hydration

```typescript
// In browser console (authenticated session required)
const { data: result, error } = await supabase.rpc('check_user_access');
if (error) {
  console.error('Auth check failed:', error);
} else {
  console.log('Auth hydration successful:', result);
}
```

---

## Troubleshooting

### Issue: `[AuthProvider] check_user_access RPC failed: {}`

**Diagnosis:**
```sql
-- Check if system tenant exists
SELECT COUNT(*) FROM public.tenants WHERE id = '00000000-0000-0000-0000-000000000001';

-- Check if roles exist
SELECT COUNT(*) FROM public.roles WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- Check current user
SELECT * FROM public.users WHERE id = current_user_id();
```

**Solution:**
1. Verify system tenant: If count = 0, manually insert it (see above)
2. Verify roles: If count = 0, re-run role INSERT
3. Re-run seed: `supabase db execute Eduzone_seed_qa.sql`

### Issue: Permission Denied on RPC

**Check grants:**
```sql
SELECT grantee, privilege_type 
FROM information_schema.role_routine_grants
WHERE routine_name = 'check_user_access'
AND grantee IN ('authenticated', 'anon');
```

**Fix (if missing):**
```sql
REVOKE EXECUTE ON FUNCTION public.check_user_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_user_access() TO authenticated, service_role;
```

### Issue: Roles Not Found on User Insert

**Check query:**
```sql
SELECT u.id, u.primary_role, r.id
FROM public.users u
LEFT JOIN public.roles r ON r.name = u.primary_role AND r.tenant_id = public.system_tenant_id()
WHERE u.id IN ('aaaaaaaa-0000-0000-0000-000000000001');
```

**If r.id IS NULL:**
- System tenant may not exist
- Roles may not be created
- Solution: Re-run system tenant + role creation

---

## Maintenance

### Monitor Schema Health

```bash
# Weekly: Check for orphaned objects
psql -c "SELECT * FROM pg_stat_user_tables WHERE n_live_tup = 0 AND last_vacuum < now() - interval '7 days';"

# Monthly: Reanalyze statistics
ANALYZE;

# Quarterly: VACUUM FULL on large tables
VACUUM FULL public.audit_logs;
```

### Version Upgrades

1. Tag current schema version: `git tag v13.8`
2. Create new canonical version: `Eduzone_schema_v13.10.sql`
3. Merge all pending migrations into new canonical
4. Deploy canonical to staging → production
5. Archive old migrations to `_archived_patches/`

---

## File Structure Summary

```
supabase/
├── schema/                          # Modular decomposition (READ-ONLY)
│   ├── 01_extensions.sql
│   ├── 02_types.sql
│   ├── 03_tables.sql
│   ├── 04_constraints.sql
│   ├── 05_indexes.sql
│   ├── 06_views.sql
│   ├── 07_functions.sql             # Hardened
│   ├── 08_triggers.sql
│   ├── 09_rls.sql                   # Security-audited
│   ├── 10_permissions.sql           # Hardened
│   ├── 11_seed_reference.sql        # Reference seed only
│   ├── README.md                    # Detailed schema docs
│   └── SETUP_GUIDE.md               # THIS FILE
├── migrations/                      # Incremental patches (v12→v13)
│   ├── 20260517_create_enqueue_job.sql
│   ├── 20260518_fix_admin_cancel_job.sql
│   └── ... (more patches)
├── seed/                            # Seed scripts (managed separately)
└── config.toml                      # Local Supabase config
```

---

## Related Documentation

- **CLAUDE.md**: Full project context and architecture
- **database_refactor_report_v13.md**: Schema design decisions and rationale
- **EduZone_Clean_Architecture_v1.md**: Application layer patterns
- **README.md** (in schema/): Detailed schema object reference

---

## Key Contacts & Support

- **Schema Issues:** Review `schema/README.md` first, then check `_archived_patches/` for historical fixes
- **Auth Hydration:** See troubleshooting section above
- **Performance:** Check `supabase dashboard` → Performance Advisor
- **Security:** Check `supabase dashboard` → Security Advisor

---

**Version:** 13.9.0  
**Date:** 2026-06-01  
**Maintainer:** EduZone Dev Team
