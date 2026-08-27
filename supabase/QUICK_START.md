# Supabase Schema Quick Start Checklist

> **⚠️ STALE — commands below reference `seed/00_system_seed_helper.sql`
> and `Eduzone_seed_qa.sql`, which do not exist in this repository.** Use
> `supabase/deploy.ps1` or `supabase db push` (applies
> `supabase/schema/*.sql`, including seed data in
> `11_seed_reference.sql`, in one step) instead of the commands below.

## ✅ One-Time Setup (Development)

### Step 1: Start Supabase
```bash
cd d:\projects\EduZone
supabase start
```
- This starts PostgreSQL, Auth, Realtime, and other Supabase services locally
- Wait 30-60 seconds for full initialization
- Verify: `supabase status`

### Step 2: Deploy Schema
```bash
cd supabase

# Option A: Using deploy script (Recommended)
./deploy.ps1 local false    # PowerShell (Windows)
# OR
bash deploy.sh local false  # Bash (Mac/Linux)

# Option B: Manual deployment
supabase db push
supabase db execute < seed/00_system_seed_helper.sql
```

### Step 3: Seed with QA Data (Optional)
```bash
supabase db execute < ../Eduzone_seed_qa.sql
```
- Creates test users, courses, and sample data
- Emails: `super_admin@eduzone-test.com`, `admin@eduzone-test.com`, etc.
- Password: Check Eduzone_seed_qa.sql for hashed password or use "Reset Password" flow

### Step 4: Validate Setup
```bash
supabase db execute < schema/VALIDATION.sql
```
- Should show all "PASS" results
- If any "FAIL", check TROUBLESHOOTING.md

---

## ✅ Before Starting Development

### Check Auth Works
```typescript
// In browser console (after login)
const { data: result } = await supabase.rpc('check_user_access');
console.log(result);
// Should return: { allowed: true, tenant_id: '...', role: 'admin', token_version: 1 }
```

### Check Database Connection
```bash
supabase db execute << EOF
SELECT 'Connection OK' as status;
EOF
```

### Check RLS is Enforced
```bash
supabase db execute << EOF
SELECT * FROM public.users LIMIT 1;
EOF
# Should return 0 rows (unauthenticated user can't see data)
```

---

## 📋 Daily Development Workflow

### Start Session
```bash
# Terminal 1: Start Supabase (if not already running)
supabase start

# Terminal 2: Start admin app
cd apps/admin
pnpm dev

# Visit http://localhost:3000
```

### Make Schema Changes

**IMPORTANT:** Never edit `Eduzone_schema_v13.sql` directly!

1. **For structural changes** (new tables/columns):
   ```bash
   # Create a new migration
   supabase migration new <descriptive_name>
   # Edit: supabase/migrations/{timestamp}_{descriptive_name}.sql
   # Deploy: supabase db push
   ```

2. **For small fixes** (RLS policies, function tweaks):
   ```bash
   # Use supabase db execute
   supabase db execute << EOF
   CREATE OR REPLACE FUNCTION public.my_function() ...
   EOF
   ```

3. **For seed data**:
   ```bash
   # Add to Eduzone_seed_qa.sql or new seed file
   supabase db reset  # Applies everything fresh
   ```

### Check Schema Status
```bash
# List pending migrations
supabase migration list

# Show current version
supabase db execute << EOF
SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;
EOF

# Full validation
supabase db execute < schema/VALIDATION.sql
```

---

## 🚨 Emergency Recovery

### Reset Everything (Local Only)
```bash
supabase db reset
```
- ⚠️ **WARNING: Drops all data**
- ✅ Re-applies canonical schema + all migrations + seed data
- Use when you've made mistakes or want a clean state

### Stop Supabase
```bash
supabase stop
```

### Check Supabase Logs
```bash
supabase logs
# Real-time logs for debugging
```

---

## 🔍 Common Commands

| Task | Command |
|------|---------|
| View Supabase status | `supabase status` |
| Execute SQL query | `supabase db execute < query.sql` |
| List migrations | `supabase migration list` |
| Create migration | `supabase migration new <name>` |
| Push schema changes | `supabase db push` |
| Pull schema changes | `supabase db pull` |
| Reset database | `supabase db reset` |
| View logs | `supabase logs` |
| Start services | `supabase start` |
| Stop services | `supabase stop` |

---

## ❓ Quick Troubleshooting

**Q: Auth hydration fails with "check_user_access RPC failed"**
- A: System tenant missing. Run `supabase db execute < seed/00_system_seed_helper.sql`

**Q: Can't see my seed data**
- A: Apply seed: `supabase db execute < ../Eduzone_seed_qa.sql`

**Q: Supabase services not starting**
- A: Check Docker is running, then `supabase start`

**Q: Schema changes not applied**
- A: Run `supabase db push` after creating migration

**Q: RLS is blocking everything**
- A: See TROUBLESHOOTING.md → RLS Policies section

---

## 📚 Documentation Map

| Document | Purpose |
|----------|---------|
| **SETUP_GUIDE.md** | Complete deployment guide for all environments |
| **TROUBLESHOOTING.md** | Debug errors and fix issues |
| **schema/README.md** | Schema object reference and organization |
| **../CLAUDE.md** | Project overview and architecture |

---

## 👥 Key Contacts

- **Schema Questions:** Review schema/README.md
- **Deployment Questions:** See SETUP_GUIDE.md
- **Performance Issues:** Check Supabase Dashboard → Performance Advisor
- **Security Issues:** Check Supabase Dashboard → Security Advisor

---

**Last Updated:** June 2026  
**Version:** 13.9.0
