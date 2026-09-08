# EduZone Admin & Management Dashboard

> **Multi-tenant Learning Management System (LMS) — Admin Control Plane**  
> Version: 2.0 | Stack: Next.js 15 · Supabase · TypeScript 5 · Turborepo  
> **Status: 🔴 In Active Development** (P0 stability issues — see [Launch Checklist](#-launch-readiness))

---

## 📋 Table of Contents

- [What Is EduZone?](#-what-is-eduzone)
- [Architecture](#-architecture-overview)
- [Quick Start](#-quick-start)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Development](#-development)
- [Testing](#-testing)
- [Security](#-security)
- [Database Schema Rules](#-database-schema-rules-critical)
- [Launch Readiness](#-launch-readiness)
- [Contributing](#-contributing)
- [Documentation](#-documentation)

---

## 🎯 What Is EduZone?

EduZone is an enterprise-grade, multi-tenant Learning Management System. This repository contains the **Admin & Management Dashboard** — the centralised control plane for:

- **Super Admins**: System-wide management, tenant lifecycle, feature flags
- **Tenant Admins**: User management, course administration, enrollment control
- **Teachers**: Course management, student progress tracking, limited analytics

### Core Capabilities

| Feature | Details |
|---------|---------|
| 👥 **User Management** | Real-time CRUD with role-based access control (RBAC) |
| 📚 **Course Management** | Curriculum design, lesson content, video hosting (YouTube) |
| 📊 **Analytics** | Real-time dashboards, custom reports, audit trails |
| ⚡ **Bulk Operations** | Async job queue with status tracking (warn, suspend, export) |
| 🔐 **Multi-Tenant Isolation** | Row-Level Security (RLS) + tenant-scoped permissions |
| 🔔 **Notifications** | Push notifications, email, real-time subscriptions |
| 🎛️ **Feature Flags** | System-wide toggles, tenant-level overrides |

---

## 🏗️ Architecture Overview

### Layered Clean Architecture

```
┌─────────────────────────────────────┐
│    UI Layer (Next.js 15)            │
│  ├── Pages / Components             │
│  ├── Server Components              │
│  └── Server Actions                 │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Adapter Layer (React Hooks)        │
│  ├── React Query (server state)     │
│  ├── Zustand (client state)         │
│  └── Form adapters (React Hook Form)│
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Application Layer (Use Cases)      │
│  ├── Port interfaces (Repositories) │
│  ├── Authorization service         │
│  └── Domain event handlers          │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Infrastructure Layer (Persistence)│
│  ├── Supabase repositories          │
│  ├── RPC client                     │
│  └── Event bus                      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Database Layer (Supabase)          │
│  ├── PostgreSQL 17 (RLS policies)   │
│  ├── SECURITY DEFINER RPCs          │
│  ├── Deno Edge Functions            │
│  └── Real-time subscriptions        │
└─────────────────────────────────────┘
```

### Security Model

- **Authentication**: JWT via Supabase Auth
- **Authorization**: Centralized `IAuthorizationService` (⚠️ currently scattered)
- **Data Isolation**: RLS on all tables + tenant context validation
- **Service Role**: Restricted to Edge Functions only (no UI access)
- **Token Rotation**: `token_version` mismatch detection → forced logout

> ⚠️ **Current Issue**: Authorization is fragmented across UI, hooks, routes, and actions. See [Launch Checklist](#-launch-readiness).

---

## 🚀 Quick Start

### Prerequisites

```bash
Node.js 20+
pnpm 9+
Supabase CLI
Docker (for local Supabase)
```

### Setup (5 minutes)

```bash
# 1. Clone repo
git clone https://github.com/mi9092921-alt/EduZone_dashboard.git
cd EduZone_dashboard

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Start local Supabase
supabase start

# 4. Apply schema
supabase db reset

# 5. Configure environment
cp apps/admin/.env.example apps/admin/.env.local
# Edit with your Supabase credentials from step 3

# 6. Start dev server
pnpm dev
```

App runs at `http://localhost:3000`

### Environment Variables

```env
# .env.local (apps/admin)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-start>
NEXT_PUBLIC_APP_ENV=development
```

See `apps/admin/.env.example` for all options.

---

## 📦 Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 15 |
| **Language** | TypeScript | 5 (strict) |
| **UI** | Material-UI + Tailwind | MUI v5 |
| **State** | React Query + Zustand | v5 + v5 |
| **Forms** | React Hook Form + Zod | v7 + v3 |
| **Monorepo** | Turborepo | latest |
| **Database** | Supabase (PostgreSQL) | 17 |
| **Edge** | Deno | latest |
| **Testing** | Vitest + Playwright | v4 + v1 |
| **CI/CD** | GitHub Actions | native |
| **Error Tracking** | Sentry | v10 |

---

## 📁 Project Structure

```
EduZone_dashboard/
├── apps/
│   └── admin/
│       ├── src/
│       │   ├── domain/              # Types, schemas, events
│       │   ├── application/         # Use cases, ports, authorization
│       │   │   ├── authorization/   # Permission checks (FRAGMENTED ⚠️)
│       │   │   └── ports/           # Repository interfaces
│       │   ├── infrastructure/      # Supabase, RPC client, event bus
│       │   │   └── repos/           # Concrete repository implementations
│       │   ├── adapters/            # React hooks, form adapters
│       │   │   └── hooks/           # React Query custom hooks
│       │   ├── features/            # Feature slices (users, courses, etc.)
│       │   │   └── */               # domain → application → adapter flow
│       │   ├── app/                 # Next.js App Router pages
│       │   └── container.ts         # Dependency injection (⚠️ mutable state)
│       ├── playwright.config.ts     # E2E test configuration
│       ├── vitest.config.ts         # Unit test configuration
│       └── next.config.ts           # Next.js configuration
│
├── packages/
│   ├── ui/                          # Shared component library
│   ├── types/                       # Shared TypeScript types
│   ├── config/                      # ESLint, TypeScript, Tailwind configs
│   └── utils/                       # Shared utilities
│
├── supabase/
│   ├── schema/                      # SQL schema (11 modular files)
│   │   ├── 03_tables.sql            # Table definitions + RLS setup
│   │   ├── 07_functions.sql         # RPC functions (SECURITY DEFINER)
│   │   ├── 09_rls.sql               # Row-level security policies
│   │   └── ...
│   ├── functions/                   # Deno Edge Functions
│   │   ├── bulk-worker/             # Async bulk operation processor
│   │   ├── bulk-action/             # Enqueue bulk operations
│   │   ├── send-push-notification/  # FCM push dispatcher
│   │   └── ...
│   ├── migrations/                  # ⚠️ SQL patches (minimize usage)
│   ├── seed/                        # Seed data scripts
│   ├── deploy.ps1 / deploy.sh       # Schema deployment automation
│   └── README.md                    # Comprehensive Supabase guide
│
├── .github/
│   └── workflows/                   # GitHub Actions (currently failing ⚠️)
│
├── scripts/
│   ├── security/                    # Security testing harness
│   ├── perf/                        # Performance testing
│   └── ...
│
├── docs/
│   ├── SYSTEM_DESIGN.md             # Architecture deep-dive
│   ├── SECURITY_DESIGN.md           # Auth flows, threat model
│   └── ...
│
└── Root Documentation
    ├── README.md                    # ← You are here
    ├── CLAUDE.md                    # AI-friendly architecture summary
    ├── EduZone Dashboard — Production Architecture Execution Plan.md  # P0 roadmap
    ├── Performance_Reliability_Execution_Plan.md  # P1-P7 performance fixes
    └── issues.txt                   # Project constraints & requirements
```

---

## 👥 User Personas & Roles

| Persona | Role | Key Permissions |
|---------|------|-----------------|
| **Ahmed** | `super_admin` | All tenants, regions, system health, feature flags, audit logs |
| **Layla** | `tenant_admin` | Within tenant: users, courses, enrollments, reports, warnings |
| **Omar** | `teacher` | Own courses, student progress, limited analytics |
| **Fatima** | `student` | Enrollments, lessons, submissions (not in admin dashboard) |

---

## 🛠️ Development

### Available Commands

```bash
# Development
pnpm dev                  # Start dev server (port 3000)
pnpm build               # Production build
pnpm start               # Run production build locally

# Quality
pnpm typecheck           # TypeScript strict mode check
pnpm lint                # ESLint (must have 0 warnings)
pnpm test                # Unit tests (Vitest)
pnpm test:coverage       # Unit tests + coverage report

# E2E & Storybook
pnpm test:e2e            # End-to-end tests (Playwright)
pnpm test:e2e:ui         # E2E with UI debugger
pnpm storybook           # Component library (port 6006)
```

### Code Style

- **Commits**: Conventional (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`)
- **Branches**: `feature/P2-USER-007-suspend-user`
- **PR Requirements**:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅ (0 warnings)
  - `pnpm test` ✅ (≥80% coverage)

---

## 🧪 Testing

### Unit Tests

```bash
pnpm test                    # Run all unit tests
pnpm test:coverage           # Generate coverage report
pnpm test -- --watch         # Watch mode
```

Tests use **Vitest** + **MSW** (mock service worker) for isolated, fast tests.

Example: `apps/admin/src/features/bulk/bulk.service.test.ts`

### E2E Tests

```bash
pnpm test:e2e               # Run Playwright tests
pnpm test:e2e:ui            # Interactive debugger
```

Tests run against real Supabase (local or staging) to verify:
- Auth flow
- Tenant isolation
- Bulk operations
- RLS enforcement

### Component Tests (Storybook)

```bash
pnpm storybook              # Interactive component gallery
pnpm build-storybook        # Build static site
```

> ⚠️ **Current Issue**: Tests have **network calls** in unit suite, **Vitest worker timeouts**, and **inconsistent lint**.
> See [Launch Checklist → P0-2](#-launch-readiness).

---

## 🔐 Security

### Key Principles

✅ **Implemented**
- JWT-based authentication via Supabase Auth
- Row-Level Security (RLS) on all tables
- SECURITY DEFINER RPCs with permission re-validation
- Token version mismatch detection (stale logout)
- Idempotency keys on mutations
- Cryptographic audit log hash-chain
- MFA enforced for `super_admin` and `admin` roles
- Rate limiting on Edge Functions

⚠️ **Current Issues**
- Authorization logic scattered across UI/routes/actions (no centralized gate)
- Service role creation in Server Actions without Admin Gateway
- Request context uses mutable global state (concurrency risk)
- Tenant isolation not tested end-to-end
- No executable security test matrix

### See Also
- [docs/SECURITY_DESIGN.md](docs/SECURITY_DESIGN.md) — Full threat model
- [supabase/schema/README.md](supabase/schema/README.md) — RLS audit
- [EduZone Dashboard — Production Architecture Execution Plan.md](EduZone%20Dashboard%20%E2%80%94%20Production%20Architecture%20Execution%20Plan.md) — P0-10 security fixes

---

## ⚠️ Database Schema Rules (CRITICAL)

### 🚨 Shared Database — Two Repositories

**This project shares a single Supabase instance with another repository:**

- 📱 **[EduZone_App](https://github.com/mi9092921-alt/EduZone_App)** — Student app (Dart/Flutter)
- 📊 **[EduZone_dashboard](https://github.com/mi9092921-alt/EduZone_dashboard)** — Admin dashboard (this repo, TypeScript/Next.js)

**Any database change impacts both applications immediately.**

### 🛑 Database Modification Rules

**DO NOT** (these will break the project):

```
❌ Create new migration files or patches
❌ Create new files inside supabase/schema/
❌ Delete or archive active SQL files
❌ Use SQL migrations workflow at all
```

**DO** (follow exactly):

```
✅ Modify existing files in supabase/schema/ directly (in-place edits)
✅ Add new columns using ALTER TABLE ... ADD COLUMN IF NOT EXISTS (inline)
✅ Example: See autovacuum modification in 03_tables.sql:1384
✅ Archive external SQL files by numbering + moving to supabase/_archived_patches/
✅ Prefer fixing application code (TypeScript/Dart) instead of database schema
✅ Minimize any changes to supabase/schema/
```

### 📋 Pre-Modification Checklist

Before modifying ANY database object (table, function, RPC, policy):

- [ ] **Search both repositories** for all usages:
  ```bash
  # In EduZone_dashboard/
  grep -r "function_name\|table_name\|rpc_name" apps/ supabase/ --include="*.ts" --include="*.tsx" --include="*.sql"
  
  # In EduZone_App (checkout separately if needed)
  grep -r "function_name\|table_name\|rpc_name" lib/ android/ ios/ web/ --include="*.dart" --include="*.swift" --include="*.kt"
  ```

- [ ] **Check all call sites**:
  - Direct RPC calls (`.rpc('name')` in Dart/TypeScript)
  - SQL references (in other functions, RLS policies, triggers)
  - Test files (unit/widget/e2e mocks that reference the name)
  - Helper scripts and CI checks
  - Documentation files

- [ ] **Verify no existing validation scripts** depend on current behavior
  - Some "tests" might actually be auditing incorrect security assumptions
  - Don't assume test pass = behavior is correct

- [ ] **Rename consistently** across both repos:
  - Function name, parameter names, return type names
  - All internal references and documentation
  - Test file references and mock setups

- [ ] **Run final grep** after changes to confirm zero dangling references:
  ```bash
  git grep "old_name" -- '*.ts' '*.tsx' '*.sql' '*.dart'
  ```

### 📝 Post-Modification Delivery

After completing database changes, provide:

1. **List of all modified files** (with reason for each)
2. **Any ambiguous call sites** that couldn't be verified
3. **Security findings** discovered during modification
4. **Manual steps** required after applying changes
5. **Separate patches for each repository** (never combine)

### ⛔ Absolute Rules (Non-Negotiable)

> These are repeated intentionally because they are critical:

```
Absolutely no migrations or patches!
Only modify the original files, no discussion allowed.
Prefer fixing application code instead of supabase/schema.
Minimal intervention in supabase/schema files.
```

---

## 📚 Documentation

### Quick Reference

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| [README.md](README.md) | Project overview | Everyone | 10 min |
| [CLAUDE.md](CLAUDE.md) | Architecture summary (AI-friendly) | Developers | 15 min |
| [agent_prompt_eduzone_db.md](agent_prompt_eduzone_db.md) | Database modification rules (for agents) | Agents/AI | 15 min |
| [supabase/README.md](supabase/README.md) | Database setup & operations | Everyone | 20 min |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Full architecture | Architects | 30 min |
| [docs/SECURITY_DESIGN.md](docs/SECURITY_DESIGN.md) | Auth flows & threat model | Security | 25 min |
| [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) | Code conventions | Developers | 15 min |

### Execution Plans (Current Focus)

| Plan | Scope | Status |
|------|-------|--------|
| [EduZone Dashboard — Production Architecture Execution Plan.md](EduZone%20Dashboard%20%E2%80%94%20Production%20Architecture%20Execution%20Plan.md) | P0-10: Architecture refactoring | 🔴 In Progress |
| [Performance_Reliability_Execution_Plan.md](Performance_Reliability_Execution_Plan.md) | P1-P7: Performance & reliability | 🔴 Blocked by P0 |

---

## 🚀 Launch Readiness

### Current Status: 🔴 NOT READY

**126 GitHub Actions runs** → Multiple failures (P0 critical, P1 performance issues)

### 🛑 P0 Blockers (Must Fix Before Launch)

#### P0-1: CI/CD Stability
- **Issue**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` **fail intermittently**
- **Impact**: Cannot guarantee production readiness
- **Fix**: Fix all workflow failures (see action logs)
- **Timeline**: 1–2 days

#### P0-2: Request Context Isolation
- **Issue**: `container.ts` has mutable global state for `actorId` and `tenantId`
- **Risk**: Concurrent requests may leak data across tenants
- **Fix**: Make context request-scoped, not global
- **Timeline**: 2–3 days

#### P0-3: Service Role Isolation
- **Issue**: `service_role` key created directly in Server Actions (`admin.actions.ts`)
- **Risk**: No centralized authorization gate, security scattered
- **Fix**: Create Admin Gateway; route all service_role ops through it
- **Timeline**: 2–3 days

#### P0-4: Authorization Consolidation
- **Issue**: Permission checks in UI, hooks, routes, actions, RPC (no single source of truth)
- **Risk**: Inconsistent enforcement, permission bypasses
- **Fix**: Create `IAuthorizationService` with deny-by-default; all checks routed through it
- **Timeline**: 3–4 days

#### P0-5: Tenant Isolation Verification
- **Issue**: RLS exists but **no executable attack matrix** proves isolation
- **Risk**: Cannot guarantee multi-tenant safety
- **Fix**: Write end-to-end tests verifying negative cases (A cannot read/modify B)
- **Timeline**: 2–3 days

### 🟡 P1 Performance Blockers (Launch Window)

| Issue | Impact | Fix | Timeline |
|-------|--------|-----|----------|
| **N+1 in tenants list** | 100 queries/page | RPC with aggregation | 1 day |
| **YouTube API fails entire batch** | All lessons fail if 1 video fails | Batch API + allSettled | 1 day |
| **Job queue has no per-tenant ceiling** | Tenant A starves tenant B | Add tenant-scoped WHERE | 1 day |
| **Stale job locks never released** | Jobs hang forever | Schedule pg_cron task | 1 day |
| **No load testing** | Unknown real-world perf | Build k6 tests | 2 days |

### ✅ P0 Launch Readiness Checklist

- [ ] `pnpm typecheck` ✅ PASS
- [ ] `pnpm lint` ✅ PASS (0 warnings)
- [ ] `pnpm test` ✅ PASS
- [ ] `pnpm build` ✅ PASS
- [ ] `supabase db reset` ✅ Works without errors
- [ ] Request context is request-scoped (not mutable global)
- [ ] All service_role operations routed through Admin Gateway
- [ ] `IAuthorizationService` enforces all permission checks (centralized)
- [ ] Tenant isolation matrix: A ≠ B (SELECT, INSERT, UPDATE, DELETE, RPC, API)
- [ ] Production deployment playbook documented
- [ ] Security audit passed
- [ ] Performance baseline established

**Estimated Timeline to Launch Ready**: **2–3 weeks** (P0 + P1)

---

## 🤝 Contributing

### Setup Your Development Environment

1. **Read**: [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)
2. **Read**: [Database Schema Rules](#-database-schema-rules-critical) (if modifying `supabase/`)
3. **Clone**: `git clone https://github.com/mi9092921-alt/EduZone_dashboard.git`
4. **Install**: `pnpm install --frozen-lockfile`
5. **Start**: `supabase start && pnpm dev`

### Pull Request Checklist

- [ ] Branch named `feature/P2-TASK-NNN-description`
- [ ] Commit messages follow conventional commits
- [ ] `pnpm typecheck` ✅
- [ ] `pnpm lint` ✅ (0 warnings)
- [ ] `pnpm test` ✅ (coverage ≥80%)
- [ ] Tests added for new logic
- [ ] Database changes: **modify schema files only** (no migrations, see [Database Schema Rules](#-database-schema-rules-critical))
- [ ] Updated documentation if relevant
- [ ] For database changes: included pre-mod grep report from both repos

### Key Rules

- ✅ Clean architecture layers respected (domain → app → infra → adapters)
- ✅ No business logic in routes or Server Actions
- ✅ Database: modify `supabase/schema/` in-place only (no migrations/patches)
- ✅ For any DB change: verify impact on both EduZone_App and EduZone_dashboard
- ❌ No `any` types (except unavoidable)
- ❌ No hardcoded credentials
- ❌ No SQL migrations or patches

---

## 📄 License

**Proprietary** — EduZone Platform © 2026. All rights reserved.

---

## 🆘 Need Help?

### Quick Links

- 📖 [Architecture Overview](#-architecture-overview)
- 🚀 [Quick Start](#-quick-start)
- 🧪 [Testing Guide](#-testing)
- 🔐 [Security Principles](#-security)
- ⚠️ [Database Rules](#-database-schema-rules-critical)
- ⚠️ [Known Issues](#-launch-readiness)

### Database Issues?

See [supabase/README.md](supabase/README.md) → Emergency Help

### Making Database Changes?

See [Database Schema Rules](#-database-schema-rules-critical) or [agent_prompt_eduzone_db.md](agent_prompt_eduzone_db.md)

### Architecture Questions?

See [CLAUDE.md](CLAUDE.md) or [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)

### Security Concerns?

See [docs/SECURITY_DESIGN.md](docs/SECURITY_DESIGN.md) or [Security section](#-security)

---

**Last Updated**: September 2026  
**Status**: 🔴 Active Development (P0 stability issues)  
**Maintainers**: [@mi9092921-alt](https://github.com/mi9092921-alt)
