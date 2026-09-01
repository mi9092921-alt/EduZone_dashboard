# 🗺️ EduZone Admin Dashboard — Implementation Plan

> **Version:** 2.1  
> **Date:** 2026-04-05  
> **Schema:** EduZone v10.0 (PostgreSQL 16 / Supabase Pro)  
> **Stack:** Next.js 15 · React 18 · TypeScript 5 · Supabase · MUI v5 · Tailwind · React Query v5 · Zustand · Zod  
> **Total Estimated Duration:** ~20 weeks (5 months)

---

## 📋 Table of Contents

1. [Methodology & Conventions](#1-methodology--conventions)
2. [Phase 0 — Foundation & DevOps](#2-phase-0--foundation--devops)
3. [Phase 1 — Auth, Shell & Core Infrastructure](#3-phase-1--auth-shell--core-infrastructure)
4. [Phase 2 — User Management](#4-phase-2--user-management)
5. [Phase 3 — Course & Enrollment Management](#5-phase-3--course--enrollment-management)
6. [Phase 4 — Teacher Dashboard](#6-phase-4--teacher-dashboard)
7. [Phase 5 — System Settings & Feature Flags](#7-phase-5--system-settings--feature-flags)
8. [Phase 6 — Monitoring, Audit & Job Queue](#8-phase-6--monitoring-audit--job-queue)
9. [Phase 7 — Bulk Operations](#9-phase-7--bulk-operations)
10. [Phase 8 — Analytics & Reporting](#10-phase-8--analytics--reporting)
11. [Phase 9 — Tenant Management (Super-Admin)](#11-phase-9--tenant-management-super-admin)
12. [Phase 10 — QA, Hardening & Launch](#12-phase-10--qa-hardening--launch)
13. [Task Reference Index](#13-task-reference-index)
14. [Risk Register](#14-risk-register)
15. [Dependencies Map](#15-dependencies-map)
16. [Notification System Tasks](#16-notification-system-tasks)

---

## 1. Methodology & Conventions

### 1.1 Task ID Format

```
PHASE-DOMAIN-NNN
│     │       └── Sequential number (001..999)
│     └────────── Domain: INFRA | AUTH | USER | COURSE | TEACHER |
│                          SETTINGS | MONITOR | BULK | ANALYTICS | TENANT | QA
└──────────────── Phase number (P0..P10)
```

**Examples:** `P0-INFRA-001`, `P2-USER-007`, `P7-BULK-003`

### 1.2 Priority Levels

| Symbol | Priority | Description                                        |
| ------ | -------- | -------------------------------------------------- |
| 🔴     | Critical | Blocks other tasks or phases; must complete first  |
| 🟠     | High     | Core feature; scheduled in current phase           |
| 🟡     | Medium   | Important but has workarounds; can slip one sprint |
| 🟢     | Low      | Enhancement; can defer to next phase               |

### 1.3 Effort Estimation

| Size | Points | Typical Duration |
| ---- | ------ | ---------------- |
| XS   | 1      | < 2 hours        |
| S    | 2      | 2–4 hours        |
| M    | 3      | 0.5–1 day        |
| L    | 5      | 1–2 days         |
| XL   | 8      | 3–5 days         |
| XXL  | 13     | 1–2 weeks        |

### 1.4 Definition of Done (DoD)

A task is **Done** when:

- [ ] Code written and self-reviewed
- [ ] TypeScript strict mode passes (`tsc --noEmit`)
- [ ] ESLint + Prettier pass with zero warnings
- [ ] Unit tests written (Vitest) — coverage ≥ 80% for services layer
- [ ] Component renders correctly in Storybook
- [ ] Functionality verified against Supabase local dev
- [ ] PR reviewed by at least one team member
- [ ] Merged to `main` with passing CI

### 1.5 Sprint Cadence

- **Sprint length:** 2 weeks
- **Phases P0–P2:** Weeks 1–6
- **Phases P3–P6:** Weeks 7–12
- **Phases P7–P10:** Weeks 13–18
- **Daily standups:** 15 min async (Slack thread)
- **Sprint review:** Every 2 weeks with PM sign-off

---

## 2. Phase 0 — Foundation & DevOps

> **Goal:** Project skeleton, toolchain, CI/CD, and local Supabase ready.  
> **Duration:** Week 1 (5 days)  
> **Owner:** Lead Engineer + DevOps

---

### P0-INFRA-001 · Monorepo Initialisation 🔴 `XL`

**Description:**  
Bootstrap the Turborepo monorepo with all workspace packages defined.

**Acceptance Criteria:**

- `apps/web` (Next.js 15 App Router) initialised with `--typescript --tailwind --app`
- `packages/types`, `packages/design-system`, `packages/utils` created as empty workspaces
- `edge-functions/` directory with Deno config
- `turbo.json` with `build`, `lint`, `test`, `typecheck` pipelines
- `pnpm-workspace.yaml` listing all packages
- Root `.eslintrc.json` with `@typescript-eslint/strict` + `import/order` rules
- Root `prettier.config.js` with consistent formatting
- `tsconfig.base.json` with `strict: true`, `exactOptionalPropertyTypes: true`

**Files Created:**

```
/
├── apps/web/
├── packages/types/
├── packages/design-system/
├── packages/utils/
├── edge-functions/
├── turbo.json
├── pnpm-workspace.yaml
├── .eslintrc.json
├── prettier.config.js
└── tsconfig.base.json
```

**Blockers:** None  
**Unblocks:** All subsequent tasks

---

### P0-INFRA-002 · Supabase Local Dev Setup 🔴 `L`

**Description:**  
Configure Supabase CLI for local development with the full Schema v5.0.

**Acceptance Criteria:**

- `supabase/` directory with `config.toml` targeting local instance
- Schema v5.0 SQL (`migrations/2026-03-01-init.sql`) applied cleanly via `supabase db reset`
- Seed file (`migrations/2026-03-08-seed.sql`) inserts default settings_kv + feature_flags
- `supabase/seed.sql` creates 3 test users: `super_admin@test.com`, `admin@test.com`, `teacher@test.com`
- All extensions enabled: `pgcrypto`, `pg_trgm`, `btree_gin`, `unaccent`
- Realtime enabled for: `users`, `activity_log_queue`, `cache_invalidation_queue`, `job_queue`
- Local Studio accessible at `http://localhost:54323`

**Commands Verified:**

```bash
supabase start
supabase db reset
supabase gen types typescript --local > packages/types/src/database.types.ts
```

**Blockers:** P0-INFRA-001  
**Unblocks:** P0-INFRA-004, P1-AUTH-001

---

### P0-INFRA-003 · CI/CD Pipeline 🔴 `XL`

**Description:**  
GitHub Actions pipeline with quality gates, type checking, and deployment.

**Acceptance Criteria:**

- `.github/workflows/ci.yml`: runs on PR to `main`
  - `pnpm install --frozen-lockfile`
  - `turbo typecheck` (must pass)
  - `turbo lint` (zero warnings)
  - `turbo test` (Vitest, coverage threshold 80%)
  - `supabase db lint` (no schema issues)
  - Secret scan: `gitleaks detect` — fails on any `service_role` key outside `edge-functions/`
- `.github/workflows/deploy.yml`: runs on merge to `main`
  - Deploy `apps/web` to Vercel
  - Deploy `edge-functions/` via `supabase functions deploy`
  - Run `supabase db push` for pending migrations
- Branch protection: require 1 review + CI pass before merge

**Secrets Required (GitHub):**

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (edge-functions only)
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
```

**Blockers:** P0-INFRA-001  
**Unblocks:** All deployment tasks

---

### P0-INFRA-004 · Type Generation & Shared Types Package 🔴 `M`

**Description:**  
Generate TypeScript types from DB schema and define domain types.

**Acceptance Criteria:**

- `packages/types/src/database.types.ts` — auto-generated via `supabase gen types`
- `packages/types/src/rpc.types.ts` — typed wrappers for every RPC:
  ```typescript
  export type CheckDashboardAccessResult = {
    allowed: boolean;
    reason?:
      | 'app_locked'
      | 'unauthenticated'
      | 'account_banned'
      | 'account_locked'
      | 'account_suspended'
      | 'user_not_found'
      | 'maintenance_mode';
    message?: string;
    role?: string;
    tenant_id?: string;
    until?: string;
    maintenance_bypass?: boolean;
  };
  ```
- `packages/types/src/domain.types.ts` — User, Course, Enrollment, Warning, Session, Device, Tenant, FeatureFlag
- `packages/types/src/permissions.types.ts` — `PermissionName` union type from all permission names in schema
- `packages/types/src/errors.types.ts` — `RpcErrorCode` union from error catalogue (Section 5 of PRD)
- Script `scripts/gen-types.sh` automates regeneration

**Blockers:** P0-INFRA-002  
**Unblocks:** P1-AUTH-001, P1-AUTH-002

---

### P0-INFRA-005 · Design System & Theme 🟠 `L`

**Description:**  
MUI theme + Tailwind tokens + Storybook setup.

**Acceptance Criteria:**

- `packages/design-system/src/theme.ts`:
  - Primary `#1B4F8A`, Secondary `#2E86C1`, Error `#E74C3C`, Warning `#D4AC0D`, Success `#1E8449`
  - Typography: `Inter` for body, `JetBrains Mono` for code/hash values
  - Dark mode variant ready (toggled via `dark_mode` feature flag)
  - MUI `direction` prop responds to `i18next` language (`ar` → RTL)
- `packages/design-system/src/tokens.ts` — spacing, breakpoints, shadows as JS constants
- `tailwind.config.js` extends with `design-system` tokens (synced via CSS variables)
- Storybook 8 configured in `packages/design-system`
- Base component stories: Button, StatusBadge, RiskChip, ConfirmDialog

**Blockers:** P0-INFRA-001  
**Unblocks:** P1-SHELL-001

---

### P0-INFRA-006 · Environment Configuration 🟠 `S`

**Description:**  
`.env` structure, validation, and documentation.

**Acceptance Criteria:**

- `.env.local.example` with all required variables and descriptions:
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  NEXT_PUBLIC_APP_ENV=development|staging|production
  SENTRY_DSN=
  NEXT_PUBLIC_SENTRY_DSN=
  ```
- `apps/web/src/lib/env.ts` — Zod schema validating all env vars on startup, throws on missing
- `edge-functions/_shared/config.ts` — validates Deno env vars for edge functions
- `.gitignore` explicitly lists all `.env*` variants
- `README.md` section: "Environment Setup" with step-by-step instructions

**Blockers:** P0-INFRA-001  
**Unblocks:** P1-AUTH-001

---

### P0-INFRA-007 · pg_cron Job Configuration 🔴 `M`

**Description:**  
Create migration files and verification scripts for all 9 pg_cron scheduled jobs defined in Schema v10.0. These jobs are currently commented out in the schema and must be explicitly deployed.

**Acceptance Criteria:**

- `supabase/migrations/YYYYMMDD_configure_pg_cron.sql`:

  ```sql
  -- Enable pg_cron extension
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  SELECT cron.schedule('flush_logs',        '* * * * *',      'SELECT flush_activity_logs(200)');
  SELECT cron.schedule('release_locks',     '* * * * *',      'SELECT release_stale_job_locks()');
  SELECT cron.schedule('auto_unsuspend',    '*/5 * * * *',    $$UPDATE users SET account_status='active', suspension_until=NULL WHERE account_status='suspended' AND suspension_until < NOW()$$);
  SELECT cron.schedule('cleanup_sessions',  '*/30 * * * *',   $$UPDATE sessions SET is_active=false WHERE is_active AND last_activity < NOW() - INTERVAL '24 hours'$$);
  SELECT cron.schedule('refresh_mv_user',   '0 * * * *',      'REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_user_stats');
  SELECT cron.schedule('refresh_mv_course', '5 * * * *',      'REFRESH MATERIALIZED VIEW CONCURRENTLY private.mv_course_stats');
  SELECT cron.schedule('cleanup_rl',        '0 2 * * *',      $$DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '7 days'$$);
  SELECT cron.schedule('cleanup_alq',       '0 4 * * *',      $$DELETE FROM activity_log_queue WHERE flushed AND flushed_at < NOW() - INTERVAL '30 days'$$);
  SELECT cron.schedule('expire_enrollments','0 0 * * *',      $$UPDATE enrollments SET status='expired' WHERE status='active' AND expires_at < NOW()$$);
  ```

- Verification script `scripts/verify-cron-jobs.sh`: connects to staging and confirms `SELECT count(*) FROM cron.job` returns 9
- Rollback SQL: `SELECT cron.unschedule(jobname)` for all 9 jobs
- **⚠️ Local dev workaround:** pg_cron is **not available** in `supabase start` (local Docker). Provide:
  - `scripts/run-cron-locally.sh` — shell script that calls each SQL job function manually via `psql`
  - `packages/utils/src/dev-cron-runner.ts` — Node.js script with `node-cron` that replicates scheduling in dev
  - CI step: runs each cron function once against test DB to verify SQL is valid

**Blockers:** P0-INFRA-002  
**Unblocks:** P10-LAUNCH-002, P10-SECURITY-002

---

### P0-INFRA-008 · Idempotency Key Infrastructure 🔴 `M`

**Description:**  
Implement idempotency key support for all mutation operations, as mandated by RFC-007 (ACCEPTED). Prevents double-submission from button double-clicks, network retries, and Edge Function timeout re-runs.

**Acceptance Criteria:**

- `supabase/migrations/YYYYMMDD_idempotency_store.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS idempotency_store (
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint   TEXT        NOT NULL,  -- e.g. 'bulk_action', 'issue_warning', 'update_user'
    key        TEXT        NOT NULL,  -- client-generated UUID v4
    response   JSONB       NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','done','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    PRIMARY KEY (user_id, endpoint, key)
  );
  CREATE INDEX idx_idempotency_expires ON idempotency_store(expires_at);
  -- RLS: users can only see their own idempotency records
  ALTER TABLE idempotency_store ENABLE ROW LEVEL SECURITY;
  CREATE POLICY idempotency_own ON idempotency_store
    FOR ALL USING (user_id = auth.uid());
  ```
- `packages/utils/src/idempotency.ts`:
  ```typescript
  export function generateIdempotencyKey(): string; // UUID v4
  export function buildIdempotencyHeader(endpoint: string): {
    'X-Idempotency-Key': string;
    'X-Idempotency-Endpoint': string;
  };
  export function withIdempotencyKey<T>(
    endpoint: string,
    fn: (key: string) => Promise<T>,
  ): Promise<T>;
  ```
- `edge-functions/_shared/idempotency.ts`:
  ```typescript
  export async function checkIdempotency(
    userId: string,
    endpoint: string,
    key: string,
    sb: SupabaseClient,
  ): Promise<CachedResponse | null>;
  export async function storeIdempotency(
    userId: string,
    endpoint: string,
    key: string,
    response: unknown,
    sb: SupabaseClient,
  ): Promise<void>;
  // Returns cached response if key already processed; throws ConflictError if status='processing'
  ```
- pg_cron job: `SELECT cron.schedule('cleanup_idempotency', '0 3 * * *', $$DELETE FROM idempotency_store WHERE expires_at < NOW()$$)` — added to P0-INFRA-007 migration
- All mutation React Query hooks in `useMutation` must pass `idempotencyKey` + `endpoint` in request headers
- **Conflict handling:** If same key submitted while `status='processing'`, return 409 with `{ retry_after: 5 }`

**Blockers:** P0-INFRA-001, P0-INFRA-002  
**Unblocks:** P2-USER-001, P7-BULK-001

---

### P0-INFRA-009 · Security Headers Configuration 🔴 `S`

**Description:**  
Configure CSP, HSTS, X-Frame-Options, and CORS headers as mandated by SECURITY_DESIGN §9.1 and §10 checklist.

**Acceptance Criteria:**

- `apps/web/src/middleware.ts` — Next.js middleware sets security headers on all responses:
  ```typescript
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io",
  );
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Request-ID', crypto.randomUUID()); // Correlation ID for observability
  ```
- `edge-functions/_shared/headers.ts` — shared CORS + security header utility for all Edge Functions:
  ```typescript
  export function corsHeaders(origin: string): HeadersInit;
  export function securityHeaders(): HeadersInit;
  ```
- Helmet-style scan passes: verify all headers present via `curl -I` against staging

**Blockers:** P0-INFRA-001  
**Unblocks:** P1-SHELL-004

---

**Phase 0 Summary**

| Task ID      | Title                          | Priority | Size | Days |
| ------------ | ------------------------------ | -------- | ---- | ---- |
| P0-INFRA-001 | Monorepo Initialisation        | 🔴       | XL   | 3    |
| P0-INFRA-002 | Supabase Local Dev Setup       | 🔴       | L    | 1.5  |
| P0-INFRA-003 | CI/CD Pipeline                 | 🔴       | XL   | 3    |
| P0-INFRA-004 | Type Generation & Shared Types | 🔴       | M    | 1    |
| P0-INFRA-005 | Design System & Theme          | 🔴       | L    | 1.5  |
| P0-INFRA-006 | Environment Configuration      | 🟠       | S    | 0.5  |
| P0-INFRA-007 | pg_cron Job Configuration      | 🔴       | M    | 1    |
| P0-INFRA-008 | Idempotency Key Infrastructure | 🔴       | M    | 1    |
| P0-INFRA-009 | Security Headers Configuration | 🔴       | S    | 0.5  |

**Phase 0 Total:** ~13 days

---

## 3. Phase 1 — Auth, Shell & Core Infrastructure

> **Goal:** Working login, AdminShell layout, token-version handling, and global RPC client.  
> **Duration:** Weeks 2–3 (10 days)  
> **Owner:** Lead Engineer + Frontend Engineer

---

### P1-AUTH-001 · Supabase Client Setup 🔴 `M`

**Description:**  
Singleton Supabase client with proper SSR/client split.

**Acceptance Criteria:**

- `apps/web/src/lib/supabase/client.ts` — `createBrowserClient` (singleton pattern)
- `apps/web/src/lib/supabase/server.ts` — `createServerClient` for Server Components and Route Handlers
- `apps/web/src/lib/supabase/middleware.ts` — session refresh in Next.js middleware
- `apps/web/src/middleware.ts` — calls Supabase middleware + redirects unauthenticated requests to `/login`
- Cookie strategy: `HttpOnly` for refresh token, memory-only for access token
- No `localStorage` usage anywhere (verified by ESLint rule `no-restricted-globals`)

**Files:**

```
apps/web/src/lib/supabase/
├── client.ts
├── server.ts
└── middleware.ts
apps/web/src/middleware.ts
```

**Blockers:** P0-INFRA-004, P0-INFRA-006  
**Unblocks:** P1-AUTH-002, P1-AUTH-003

---

### P1-AUTH-002 · Login Page 🔴 `L`

**Description:**  
Login UI with error handling and post-login routing.

**Acceptance Criteria:**

- Route: `app/(auth)/login/page.tsx`
- Email + password form using React Hook Form + Zod schema
- `supabase.auth.signInWithPassword()` on submit
- On success: calls `check_dashboard_access()` RPC immediately
  - If `allowed: false` → show reason-specific error (see Section 5.1 of PRD) and call `supabase.auth.signOut()`
  - If `allowed: true` → redirect to `/(dashboard)`
- Query param `?reason=session_invalidated` → shows banner: "Your session was ended by an administrator."
- Query param `?reason=maintenance` → shows maintenance message from `get_setting('maintenance_message')`
- Forgot password link → `app/(auth)/forgot-password/page.tsx` (calls `supabase.auth.resetPasswordForEmail`)
- RTL support: Arabic labels when `lang=ar`
- Loading state on submit button; no double-submit

**Blockers:** P1-AUTH-001  
**Unblocks:** P1-AUTH-004, P1-SHELL-001

---

### P1-AUTH-003 · Auth Store (Zustand) 🔴 `M`

**Description:**  
Global auth state with token_version tracking.

**Acceptance Criteria:**

- `apps/web/src/store/auth.store.ts`:
  ```typescript
  interface AuthState {
    user: AuthUser | null; // { id, email, primary_role, tenant_id, token_version }
    isLoading: boolean;
    setUser: (user: AuthUser | null) => void;
    clearUser: () => void;
    updateTokenVersion: (v: number) => void;
  }
  ```
- Hydrated from `supabase.auth.getUser()` on app mount via `useEffect` in root layout
- `token_version` fetched from `users` table after every successful auth
- Store is NOT persisted to localStorage or sessionStorage
- Exported `useAuthUser()` and `useIsAdmin()` hooks

**Blockers:** P1-AUTH-001  
**Unblocks:** P1-AUTH-004, P1-SHELL-002

---

### P1-AUTH-004 · Token-Version Mismatch Handler 🔴 `L`

**Description:**  
Global detection and response to stale JWT / forced logout.

**Acceptance Criteria:**

- `apps/web/src/lib/rpc/errorHandler.ts`:
  - `parseRpcError(error: unknown): RpcErrorCode` — maps PostgreSQL exception messages to typed error codes
  - `isSessionInvalidated(error: unknown): boolean` — returns true for auth-invalidating errors
- `apps/web/src/lib/rpc/globalQueryClient.ts`:
  - React Query `QueryClient` with global `onError` handler:
    - Calls `isSessionInvalidated(error)`
    - If true: clears Zustand auth store, calls `supabase.auth.signOut()`, redirects to `/login?reason=session_invalidated`
    - Logs to Sentry with `{ user_id, tenant_id, error_code }` context
- `apps/web/src/hooks/useCheckDashboardAccess.ts`:
  - Polls `check_dashboard_access()` every 5 minutes (React Query `refetchInterval`)
  - On `allowed: false` → triggers mismatch handler
  - On `maintenance_mode` without bypass → shows `MaintenanceBanner` component (does NOT logout)
- Tested: mock `check_dashboard_access` returning each reason code; assert correct navigation

**Test Cases:**

```
✓ account_locked → hard logout + /login?reason=session_invalidated
✓ account_banned → hard logout + /login?reason=session_invalidated
✓ account_suspended → hard logout + /login?reason=session_invalidated
✓ maintenance_mode (no bypass) → show MaintenanceBanner, stay authenticated
✓ maintenance_bypass: true → render dashboard normally
✓ JWT expired → attempt silent refresh; if fails → hard logout
✓ network error → show persistent "Connection lost" banner, NO logout
```

**Blockers:** P1-AUTH-002, P1-AUTH-003  
**Unblocks:** P1-SHELL-002, P2-USER-001

---

### P1-SHELL-001 · AdminShell Layout 🔴 `XL`

**Description:**  
Main dashboard layout: collapsible sidebar + topbar + content area.

**Acceptance Criteria:**

- `app/(dashboard)/layout.tsx` — wraps all dashboard routes
  - Server Component: reads auth session; redirects to `/login` if unauthenticated
  - Renders `AdminShell` client component
- `components/layout/AdminShell.tsx`:
  - Sidebar (collapsible, 240px expanded / 64px collapsed)
  - Topbar (user avatar, tenant name, notifications bell, language toggle AR/EN)
  - Main content area with scroll
  - Responsive: sidebar auto-collapses below 1024px breakpoint
- `components/layout/Sidebar.tsx`:
  - Nav items filtered by `primary_role` from auth store
  - Super-admin sees: Dashboard, Users, Courses, Enrollments, Sessions, Devices, Warnings, Roles, Feature Flags, Settings, Audit, Jobs, Tenants
  - Admin sees all except: Tenants, Audit, Feature Flags (read-only)
  - Teacher sees: My Courses, Analytics, Student Progress, Warnings, My Profile
  - Active route highlighted
  - Arabic labels with RTL icon placement
- `components/layout/Topbar.tsx`:
  - User info (avatar + name + role badge)
  - Notification bell (badge count from `realtime.store`)
  - Language toggle (AR ↔ EN)
  - Logout button → calls `logout_current_user()` RPC then `supabase.auth.signOut()`
- `components/layout/RealtimeToast.tsx`:
  - Subscribes to Supabase Realtime `security_alert` channel
  - Shows MUI Snackbar for each high/critical event with "View" link to audit log
  - Also subscribes to `cache_invalidation` channel → triggers React Query cache invalidation

**Blockers:** P0-INFRA-005, P1-AUTH-003  
**Unblocks:** All page tasks

---

### P1-SHELL-002 · Permission Gate Component 🔴 `M`

**Description:**  
Declarative permission-based UI gating.

**Acceptance Criteria:**

- `components/ui/PermissionGate.tsx`:
  ```typescript
  <PermissionGate permission="users.lock" fallback={<DisabledButton />}>
    <LockUserButton />
  </PermissionGate>
  ```
- Uses `usePermission(permissionName)` hook:
  - Checks `auth.store` for cached permissions (from `user_permission_cache` fetched at login)
  - Falls back to RPC `user_has_permission()` if not in cache
  - Returns `{ allowed: boolean, isLoading: boolean }`
- Role-based variant: `<RoleGate roles={['super_admin', 'admin']}>`
- Used in: every action button, every sensitive nav item, every form section

**Blockers:** P1-AUTH-003  
**Unblocks:** P2-USER-003, P3-COURSE-003

---

### P1-SHELL-003 · Global UI State (Zustand) 🟠 `M`

**Description:**  
UI state store for modals, drawers, and filter persistence.

**Acceptance Criteria:**

- `apps/web/src/store/ui.store.ts`:
  ```typescript
  interface UiState {
    sidebarOpen: boolean;
    activeModal: string | null;
    openModal: (id: string) => void;
    closeModal: () => void;
    // table filters (persisted to URL via nuqs)
    userFilters: UserFilters;
    setUserFilters: (f: Partial<UserFilters>) => void;
  }
  ```
- `apps/web/src/store/realtime.store.ts`:
  ```typescript
  interface RealtimeState {
    alerts: SecurityAlert[];
    unreadCount: number;
    addAlert: (alert: SecurityAlert) => void;
    markAllRead: () => void;
  }
  ```
- Filter state synced to URL using `nuqs` library (`useQueryState`)

**Blockers:** P1-AUTH-003  
**Unblocks:** P1-SHELL-001, P2-USER-001

---

### P1-SHELL-004 · Global Error Boundary & Sentry 🟠 `M`

**Description:**  
Production error tracking and graceful error UI.

**Acceptance Criteria:**

- Sentry initialised in `apps/web/src/instrumentation.ts` (Next.js instrumentation hook)
- `components/ui/ErrorBoundary.tsx` — React error boundary wrapping each page route
- Every Sentry capture includes: `{ user_id, tenant_id, primary_role, url, request_id }`
- Network error detection: `navigator.onLine` listener → dispatches to `ui.store.setNetworkError`
- `components/ui/NetworkBanner.tsx` — persistent top banner when offline
- `apps/web/src/lib/rpc/client.ts` — central RPC wrapper that attaches `request_id` header and catches errors

**Blockers:** P0-INFRA-006, P1-AUTH-003  
**Unblocks:** P1-AUTH-004

---

### P1-SHELL-005 · React Query Setup 🔴 `M`

**Description:**  
QueryClient configuration with global defaults.

**Acceptance Criteria:**

- `apps/web/src/lib/rpc/globalQueryClient.ts`:
  - `staleTime: 30_000` (30s default)
  - `retry: (count, error) => count < 2 && !isSessionInvalidated(error)`
  - `onError` → calls `parseRpcError` and routes to error handler
- `QueryClientProvider` in root layout with `ReactQueryDevtools` (dev only)
- `apps/web/src/lib/rpc/keys.ts` — all query key factories:
  ```typescript
  export const queryKeys = {
    users: {
      all: ['users'] as const,
      list: (filters: UserFilters) => ['users', 'list', filters] as const,
      detail: (id: string) => ['users', 'detail', id] as const,
    },
    // ... courses, settings, audit, jobs, etc.
  };
  ```

**Blockers:** P0-INFRA-004  
**Unblocks:** P2-USER-001, P3-COURSE-001

---

### P1-CORE-001 · DI Container & Port Registration 🔴 `L`

**Description:**  
Bootstrap the Clean Architecture dependency injection container with all port interfaces and their implementations. This is the glue layer mandated by RFC-001, SYSTEM_DESIGN §5.2, and CODING_STANDARDS §5.1.

**Acceptance Criteria:**

- `apps/web/src/application/ports/` — port interfaces:
  ```typescript
  (IUserRepo,
    ICourseRepo,
    IEnrollmentRepo,
    ISettingsRepo,
    ITenantRepo,
    IAuditRepo,
    IJobQueueRepo,
    INotificationRepo);
  ```
- `apps/web/src/application/ports/IEventBus.ts` — see P1-CORE-002
- `apps/web/src/application/ports/ILogger.ts`, `IMetrics.ts`, `ITracer.ts` — see P1-CORE-003
- `apps/web/src/infrastructure/container.ts`:
  ```typescript
  export const container = {
    userRepo: new SupabaseUserRepo(supabase),
    eventBus: new InMemoryEventBus(),
    logger: isProduction ? new DatadogLogger() : new ConsoleLogger(),
    metrics: isProduction ? new DatadogMetrics() : new ConsoleMetrics(),
    tracer: isProduction ? new OtelTracer() : new NoopTracer(),
    // ... all repos
  };
  ```
- `apps/web/src/infrastructure/repos/` — Supabase implementations for each port
- Dependency-cruiser rule: `application/` cannot import from `infrastructure/` (only ports)
- Layer boundary test: ESLint plugin verifies no direct Supabase imports in `application/`

**Blockers:** P0-INFRA-001, P0-INFRA-004  
**Unblocks:** P2-USER-001, P3-COURSE-001, P1-CORE-002, P1-CORE-003

---

### P1-CORE-002 · Domain Events & Event Bus 🔴 `M`

**Description:**  
Typed domain event system as mandated by RFC-004 (ACCEPTED). Use cases emit events; handlers process side-effects (audit logging, session revocation, email queueing).

**Acceptance Criteria:**

- `apps/web/src/application/ports/IEventBus.ts`:
  ```typescript
  export interface IDomainEvent {
    name: string;
    payload: Record<string, unknown>;
    actorId: string;
    tenantId: string;
    correlationId: string;
    timestamp: string;
  }
  export interface IEventBus {
    publish(event: IDomainEvent): Promise<void>;
    subscribe(eventName: string, handler: (event: IDomainEvent) => Promise<void>): void;
  }
  ```
- `apps/web/src/application/events/registry.ts` — typed event definitions:
  ```typescript
  (UserSuspendedEvent,
    UserBannedEvent,
    UserLockedEvent,
    UserUnlockedEvent,
    CoursePublishedEvent,
    CourseArchivedEvent,
    EnrollmentCreatedEvent,
    EnrollmentRevokedEvent,
    WarningIssuedEvent,
    BulkActionCompletedEvent,
    SettingChangedEvent,
    MaintenanceModeToggledEvent);
  ```
- `apps/web/src/infrastructure/events/InMemoryEventBus.ts` — synchronous in-process handler dispatch
- `apps/web/src/application/events/handlers/`:
  - `onUserSuspended.ts` → queues `revoke-user-sessions` + `log_activity_async`
  - `onWarningIssued.ts` → checks auto-suspend threshold
  - `onSettingChanged.ts` → triggers cache invalidation
- Unit tests for each handler with mocked dependencies

**Blockers:** P1-CORE-001  
**Unblocks:** P2-USER-001

---

### P1-CORE-003 · Observability Ports & Implementations 🟠 `M`

**Description:**  
Implement the three pillars of observability (ILogger, IMetrics, ITracer) as defined in MONITORING_LOGGING §2.1, §3.1, §4.1.

**Acceptance Criteria:**

- `apps/web/src/application/ports/ILogger.ts` — `info`, `warn`, `error`, `debug` with structured context
- `apps/web/src/application/ports/IMetrics.ts` — `increment`, `gauge`, `histogram`, `timing`
- `apps/web/src/application/ports/ITracer.ts` — `startSpan` returning `ISpan` with `traceId`, `spanId`, `end()`
- Development implementations:
  - `ConsoleLogger` — JSON-structured console output (MONITORING_LOGGING §2.6)
  - `ConsoleMetrics` — logs metrics to console in dev
  - `NoopTracer` — no-op in development
- Production implementations (stubs for now, wired in P10):
  - `DatadogLogger` — wraps `@datadog/browser-logs`
  - `DatadogMetrics` — wraps `@datadog/browser-rum`
  - `OtelTracer` — wraps `@opentelemetry/api`
- Every log line includes: `level`, `message`, `timestamp`, `traceId`, `service: 'admin-dashboard'`
- PII scrubbing: email addresses masked as `a***@***.com` in error logs

**Blockers:** P1-CORE-001  
**Unblocks:** P1-SHELL-004, P2-USER-001

---

**Phase 1 Summary**

| Task ID      | Title                            | Priority | Size | Days |
| ------------ | -------------------------------- | -------- | ---- | ---- |
| P1-AUTH-001  | Supabase Client Setup            | 🔴       | M    | 1    |
| P1-AUTH-002  | Login Page                       | 🔴       | L    | 1.5  |
| P1-AUTH-003  | Auth Store (Zustand)             | 🔴       | M    | 1    |
| P1-AUTH-004  | Token-Version Mismatch Handler   | 🔴       | L    | 2    |
| P1-SHELL-001 | AdminShell Layout                | 🔴       | XL   | 3    |
| P1-SHELL-002 | Permission Gate Component        | 🔴       | M    | 1    |
| P1-SHELL-003 | Global UI State (Zustand)        | 🟠       | M    | 0.5  |
| P1-SHELL-004 | Global Error Boundary & Sentry   | 🟠       | M    | 1    |
| P1-SHELL-005 | React Query Setup                | 🔴       | M    | 0.5  |
| P1-CORE-001  | DI Container & Port Registration | 🔴       | L    | 1.5  |
| P1-CORE-002  | Domain Events & Event Bus        | 🔴       | M    | 1    |
| P1-CORE-003  | Observability Ports & Impls      | 🟠       | M    | 1    |

**Phase 1 Total:** ~15.5 days

---

## 4. Phase 2 — User Management

> **Goal:** Full user list, profile drawer, and all single-user admin actions.  
> **Duration:** Weeks 4–5 (10 days)  
> **Owner:** Frontend Engineer  
> **DB Calls:** `users`, `user_roles`, `devices`, `sessions`, `warnings`, `user_permission_cache`

---

### P2-USER-001 · Users Service Layer 🔴 `L`

**Description:**  
All Supabase queries for the users domain. No UI — service functions only.

**Acceptance Criteria:**

- `apps/web/src/services/users.service.ts`:
  ```typescript
  getUsers(filters: UserFilters, page: number, pageSize: number): Promise<PaginatedResult<User>>
  getUserById(id: string): Promise<User>
  controlUserAccount(id: string, action: AccountAction, reason?: string, suspendHours?: number): Promise<ControlResult>
  terminateUserSessions(id: string, reason?: string): Promise<number>  // returns count
  resetUserDevice(id: string): Promise<void>
  issueWarning(id: string, reason: string, severity: 1|2|3, action?: string): Promise<string>  // returns warning id
  getDevices(userId: string): Promise<Device[]>
  getSessions(userId: string): Promise<Session[]>
  getWarnings(userId: string): Promise<Warning[]>
  getEffectivePermissions(userId: string): Promise<PermissionCacheEntry[]>
  rebuildPermissionCache(userId: string): Promise<void>
  exportUserData(userId: string): Promise<string>  // returns job_id
  ```
- All functions use the typed RPC wrappers from `packages/types/rpc.types.ts`
- Each function maps RPC error codes to typed `RpcError` objects
- `getUsers` supports: `tenant_id`, `primary_role`, `account_status`, `region_id`, `warning_count_gte`, `last_login_from`, `last_login_to`, `search` (email/name full-text)

**Blockers:** P1-SHELL-005  
**Unblocks:** P2-USER-002

---

### P2-USER-002 · User Queries (React Query) 🔴 `M`

**Description:**  
React Query hooks for all user data.

**Acceptance Criteria:**

- `apps/web/src/queries/users.queries.ts`:
  ```typescript
  useUsers(filters, page, pageSize)   → { data, isLoading, isFetching }
  useUserById(id)                     → { data, isLoading }
  useUserDevices(userId)              → { data, isLoading }
  useUserSessions(userId)             → { data, isLoading }
  useUserWarnings(userId)             → { data, isLoading }
  useUserPermissions(userId)          → { data, isLoading }
  useMutateUserAccount()              → { mutate, isPending, error }  // calls controlUserAccount
  useMutateWarning()                  → { mutate, isPending, error }
  ```
- Mutations use optimistic updates:
  - `controlUserAccount` → immediately updates `account_status` in cache; rolls back on error
  - `issueWarning` → immediately increments `warning_count` in cache; rolls back on error
- Realtime: `useEffect` subscribes to `users` table changes for the current page's user_ids → invalidates affected queries

**Blockers:** P2-USER-001  
**Unblocks:** P2-USER-003, P2-USER-007

---

### P2-USER-003 · Users List Page 🔴 `XL`

**Description:**  
Main user management page with DataGrid and filter bar.

**Acceptance Criteria:**

- Route: `app/(dashboard)/users/page.tsx`
- `components/domain/users/UsersPage.tsx`:
  - Toolbar: search input (debounced 300ms), filter panel (tenant, role, status, region, last-seen range, warning count range)
  - Filter state synced to URL via `nuqs`
  - Quick stats row: Total / Active / Locked / Suspended / Banned (from `mv_user_stats` for current tenant)
- MUI DataGrid (server-side):
  - Columns: Checkbox, Email, Full Name, Role badge, Tenant, Status badge, Last Login, Warning Count, Shard Key, Actions
  - Status badge colours: active=green, locked=orange, suspended=yellow, banned=red
  - Server-side pagination (50/page), sorting, column visibility toggle
  - Row virtualisation enabled
- `components/domain/users/UserRowActions.tsx`:
  - Kebab menu per row: View Profile, Lock, Unlock, Suspend, Ban, Terminate Sessions, Reset Device, Issue Warning, View Activity
  - Each destructive action opens `ConfirmDialog` (see P2-USER-005)
  - Actions hidden based on `PermissionGate`
- `components/domain/users/BulkActionBar.tsx`:
  - Appears when ≥1 rows selected (floating bottom bar)
  - Actions: Lock, Suspend, Warn, Export, Terminate Sessions, Reset Devices
  - Disabled with tooltip if selection > 500 rows
- Export button → triggers `bulk_export` job, shows download link when done

**Blockers:** P2-USER-002, P1-SHELL-002  
**Unblocks:** P2-USER-004

---

### P2-USER-004 · User Profile Drawer 🔴 `XL`

**Description:**  
Right-side slide-in drawer with 5 tabs for a selected user.

**Acceptance Criteria:**

- `components/domain/users/UserProfileDrawer.tsx`:
  - Opens when user row is clicked or "View Profile" action selected
  - Width: 520px; slides in from right; focus-trapped for accessibility
  - Header: avatar (initials fallback), full name, email, role badge, account status badge, tenant badge
  - **Tab 1 — Overview:**
    - Basic info: first_name, last_name, email, phone, region, shard_key, login_count, last_login, last_seen_at
    - Account flags: warning_count, lock_reason (if locked), suspension_until (if suspended)
    - Device count badge + session count badge (active only)
  - **Tab 2 — Activity:**
    - Last 50 events from `activity_logs` for this user
    - Timeline component: timestamp, activity_type, risk_level chip, details JSON (collapsed by default)
    - Refresh button; "View All" link to Audit page filtered by user
  - **Tab 3 — Enrollments:**
    - Active/expired/revoked courses list from `enrollments` JOIN `courses`
    - Columns: Course Title, Status, Enrolled At, Expires At, Progress %
    - Enroll button (if admin with courses.manage) → opens EnrollmentDialog
  - **Tab 4 — Security:**
    - Devices table: device_name, platform badge, last_seen, trust_score bar, is_active toggle
    - Active sessions table: started_at, last_activity, ip_address, ip_country, risk_score bar, logout button
    - "Terminate All Sessions" button (calls `terminate_user_sessions`)
    - "Reset All Devices" button (calls `reset_user_device`)
  - **Tab 5 — Permissions:**
    - Effective permissions from `user_permission_cache`: permission_name, expires_at, cached_at
    - Assigned roles list from `user_roles`: role name, granted_by, granted_at, expires_at, is_active toggle
    - "Rebuild Cache" button → calls `rebuild_permission_cache` → shows job queue status

**Blockers:** P2-USER-002  
**Unblocks:** P2-USER-005

---

### P2-USER-005 · Action Dialogs & Error Handling 🔴 `L`

**Description:**  
ConfirmDialog variants for each user action with proper error display.

**Acceptance Criteria:**

- `components/ui/ConfirmDialog.tsx` — base dialog with:
  - `title`, `description`, `confirmLabel`, `cancelLabel`
  - Optional `confirmText` field (user must type text to confirm — used for "BAN")
  - Optional `reasonField` (textarea — required for lock/suspend/ban)
  - Optional `durationField` (number input — used for suspend, in hours, min 1 max 720)
  - Loading state on confirm button; disabled during mutation
  - Error display area: shows error message from `parseRpcError(error)` below confirm button

- Action-specific dialogs built on ConfirmDialog:
  - `LockUserDialog` — reason required, description explains consequences
  - `SuspendUserDialog` — reason required, duration required (hours), shows "Until: [calculated datetime]"
  - `BanUserDialog` — reason required, confirmText = "BAN"
  - `IssueWarningDialog` — reason required (min 20 chars), severity selector, action selector
  - `TerminateSessionsDialog` — shows "N active sessions will be terminated"
  - `ResetDeviceDialog` — shows "N active devices will be deactivated"

- Error states wired per PRD Section 5.1:
  - `ADMIN_ONLY` → "Permission denied."
  - `AUTO_SUSPEND` → success toast + info banner about auto-suspension
  - `RPC_TIMEOUT` → "Action timed out. Check job queue for status."
  - All others → "Unexpected error (ref: [request_id])" + Sentry log

**Blockers:** P2-USER-003  
**Unblocks:** P2-USER-006

---

### P2-USER-006 · User Realtime Updates 🟠 `M`

**Description:**  
Live account_status updates without page refresh.

**Acceptance Criteria:**

- `hooks/useUserRealtime.ts`:
  - Subscribes to `users` table UPDATE events via Supabase Realtime
  - Filters: `tenant_id = current_tenant_id` (or all for super_admin)
  - On receive: calls `queryClient.setQueryData` to update the affected user row in the DataGrid
  - Updates `account_status` badge colour in real time
  - Also subscribes to `security_alert` channel → if event references a user on current page, highlights that row briefly
- Subscription cleaned up on unmount
- Test: trigger `control_user_account` from a second browser tab; assert DataGrid updates without refresh

**Blockers:** P2-USER-003  
**Unblocks:** P2-USER-007

---

### P2-USER-007 · User Zod Schemas & Forms 🟠 `M`

**Description:**  
Validation schemas that mirror DB CHECK constraints.

**Acceptance Criteria:**

- `apps/web/src/forms/schemas/user.schema.ts`:
  ```typescript
  export const accountActionSchema = z.enum(['lock', 'unlock', 'suspend', 'ban']);
  export const lockUserSchema = z.object({ reason: z.string().min(5).max(500) });
  export const suspendUserSchema = z.object({
    reason: z.string().min(5).max(500),
    suspend_hours: z.number().int().min(1).max(720),
  });
  export const banUserSchema = z.object({
    reason: z.string().min(5).max(500),
    confirm_text: z.literal('BAN'),
  });
  export const issueWarningSchema = z.object({
    reason: z.string().min(20).max(1000),
    severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    action: z.string().default('none'),
  });
  ```
- All `ConfirmDialog` forms use these schemas via React Hook Form `zodResolver`
- Error messages localised: English and Arabic variants in `i18n/en.json` and `i18n/ar.json`

**Blockers:** P2-USER-005  
**Unblocks:** P7-BULK-002

---

**Phase 2 Summary**

| Task ID     | Title                           | Priority | Size | Days |
| ----------- | ------------------------------- | -------- | ---- | ---- |
| P2-USER-001 | Users Service Layer             | 🔴       | L    | 1.5  |
| P2-USER-002 | User Queries (React Query)      | 🔴       | M    | 1    |
| P2-USER-003 | Users List Page                 | 🔴       | XL   | 2.5  |
| P2-USER-004 | User Profile Drawer             | 🔴       | XL   | 2.5  |
| P2-USER-005 | Action Dialogs & Error Handling | 🔴       | L    | 1.5  |
| P2-USER-006 | User Realtime Updates           | 🟠       | M    | 0.5  |
| P2-USER-007 | User Zod Schemas & Forms        | 🟠       | M    | 0.5  |

**Phase 2 Total:** ~10 days

---

## 5. Phase 3 — Course & Enrollment Management

> **Goal:** Course CRUD, section/lesson editor, enrollment management, course analytics.  
> **Duration:** Weeks 5–6 (8 days)  
> **Owner:** Frontend Engineer  
> **DB Calls:** `courses`, `sections`, `lessons`, `enrollments`, `user_progress`, `video_views`, `mv_course_stats`

---

### P3-COURSE-001 · Courses Service Layer 🔴 `L`

**Acceptance Criteria:**

- `apps/web/src/services/courses.service.ts`:
  ```typescript
  getCourses(filters: CourseFilters, page: number): Promise<PaginatedResult<Course>>
  getCourseById(id: string): Promise<CourseDetail>   // includes sections + lessons
  createCourse(data: CreateCourseInput): Promise<Course>
  updateCourse(id: string, data: UpdateCourseInput): Promise<Course>
  deleteCourse(id: string): Promise<void>            // soft delete
  getCourseSections(courseId: string): Promise<Section[]>
  reorderSections(courseId: string, orderedIds: string[]): Promise<void>
  reorderLessons(sectionId: string, orderedIds: string[]): Promise<void>
  enrollStudent(userId: string, courseId: string, expiresAt?: Date): Promise<string>
  revokeEnrollment(userId: string, courseId: string, reason?: string): Promise<void>
  getCourseEnrollments(courseId: string): Promise<Enrollment[]>
  getCourseAnalytics(courseId: string): Promise<CourseAnalytics>
  ```
- Full-text search on `title` uses `immutable_tsvector` index:
  ```typescript
  // Service constructs RPC call:
  // SELECT * FROM courses
  // WHERE immutable_tsvector(title) @@ plainto_tsquery('simple', immutable_unaccent(query))
  ```
- Error mapping: `PERMISSION_DENIED`, `DUPLICATE` (re-enroll), `ALREADY_REVOKED`, `NOT_FOUND`

**Blockers:** P1-SHELL-005  
**Unblocks:** P3-COURSE-002

---

### P3-COURSE-002 · Courses List Page 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/courses/page.tsx`
- DataGrid: Title, Status badge, Teacher name, Tenant (super_admin only), Category, Level, Price/Free badge, Enrollment count, Created At
- Filters: tenant, status, category, level, is_free, teacher search
- Search bar: full-text search via `immutable_tsvector`
- Row actions: View Detail, Edit, Publish/Archive, Delete (with ConfirmDialog)
- Create Course FAB → opens CourseForm sheet

**Blockers:** P3-COURSE-001  
**Unblocks:** P3-COURSE-003

---

### P3-COURSE-003 · Course Detail & Editor 🔴 `XL`

**Acceptance Criteria:**

- Route: `app/(dashboard)/courses/[id]/page.tsx`
- Two-panel layout: left (course info + settings), right (sections/lessons accordion)
- Course info form (React Hook Form + Zod):
  - title, description, category (select), level (select), is_free toggle, price (shown when not free), thumbnail_url, teacher_id (searchable user select)
  - Save button calls `updateCourse`; only users with `courses.write` can edit
- Sections accordion (drag-to-reorder via `@dnd-kit/core`):
  - Each section: title, description, order_index, is_published toggle, delete button
  - Drag handle updates `order_index` via `reorderSections` service call (debounced 1s)
  - Add Section button at bottom
- Lessons list per section:
  - lesson title, youtube_url, duration_sec, is_published toggle, delete button
  - Drag-to-reorder within section
  - Add Lesson button
- Publish Course button (validates ≥1 published section with ≥1 published lesson before calling API)
- Archive Course button (ConfirmDialog)

**Blockers:** P3-COURSE-002  
**Unblocks:** P3-COURSE-004

---

### P3-COURSE-004 · Enrollment Management 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/enrollments/page.tsx`
- DataGrid: Student email, Course title, Status badge, Enrolled At, Expires At (with "EXPIRED" chip if past), Progress %, Enrolled By, Actions
- Filters: tenant, course, status, expiry range
- Enroll Student dialog: user search (by email/name), course select, expires_at datetime picker. Calls `enroll_student`
- Revoke button → ConfirmDialog with reason field. Calls `revoke_enrollment`
- Error handling: `DUPLICATE` (re-enroll info), `ALREADY_REVOKED` (info toast), `PERMISSION_DENIED`

**Blockers:** P3-COURSE-001  
**Unblocks:** P3-COURSE-005

---

### P3-COURSE-005 · Course Analytics Tab 🟠 `L`

**Acceptance Criteria:**

- Tab within `app/(dashboard)/courses/[id]/page.tsx`
- KPI row: Total Enrolled, Completed, Average Progress %, Total Video Views — from `mv_course_stats`
- Progress distribution histogram (Recharts BarChart): buckets 0–25%, 25–50%, 50–75%, 75–100%, Completed
- Lesson watch-time table: lesson title, total watch_time sum from `video_views`, unique viewer count
- Enrollment trend (Recharts LineChart): last 30 days of `enrollments.enrolled_at` grouped by day
- "Refresh Stats" button → calls `get_course_stats(p_course_id)` RPC (Schema v10 SECURITY DEFINER wrapper for `private.mv_course_stats`) — shows age of last refresh

**Blockers:** P3-COURSE-003  
**Unblocks:** P8-ANALYTICS-001

---

**Phase 3 Summary**

| Task ID       | Title                  | Priority | Size | Days |
| ------------- | ---------------------- | -------- | ---- | ---- |
| P3-COURSE-001 | Courses Service Layer  | 🔴       | L    | 1.5  |
| P3-COURSE-002 | Courses List Page      | 🔴       | L    | 1.5  |
| P3-COURSE-003 | Course Detail & Editor | 🔴       | XL   | 4    |
| P3-COURSE-004 | Enrollment Management  | 🔴       | L    | 1.5  |
| P3-COURSE-005 | Course Analytics Tab   | 🟠       | L    | 1.5  |

**Phase 3 Total:** ~10 days

---

## 6. Phase 4 — Teacher Dashboard

> **Goal:** Dedicated restricted view for teacher role with own courses, student progress, and warnings.  
> **Duration:** Week 7 (5 days)  
> **Owner:** Frontend Engineer  
> **Note:** Teachers reuse services from Phase 3 with scoped filters (`teacher_id = auth.uid()`).

---

### P4-TEACHER-001 · Teacher Route Guard 🟠 `M`

**Acceptance Criteria:**

- `app/(dashboard)/layout.tsx` checks `primary_role`
- Teachers redirected away from: `/users`, `/tenants`, `/audit`, `/jobs`, `/feature-flags`, `/settings`
- Attempting direct URL navigation to forbidden routes → redirects to `/my-courses` with toast: "Access denied."
- Sidebar renders teacher-only nav (Section 6.2 of PRD)

**Blockers:** P1-SHELL-001, P1-SHELL-002  
**Unblocks:** P4-TEACHER-002

---

### P4-TEACHER-002 · My Courses Page (Teacher) 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/my-courses/page.tsx`
- Fetches courses WHERE `teacher_id = auth.uid()` using `courses.service.getCourses({ teacher_id: user.id })`
- Course card grid (3 columns): thumbnail, title, status badge, lesson count, enrolled student count
- Create Course button → CourseForm sheet (same as P3-COURSE-003 editor, but limited fields)
- Full course editor accessible from card (same component as P3-COURSE-003)
- Teachers cannot see enrollment management tab or RBAC sections

**Blockers:** P4-TEACHER-001, P3-COURSE-003  
**Unblocks:** P4-TEACHER-003

---

### P4-TEACHER-003 · Student Progress Page (Teacher) 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/my-courses/[id]/students/page.tsx`
- Lists enrolled students for teacher's course: first_name + last_name, progress_pct bar, last_watched, completed badge
- Email shown only if tenant setting `data_sharing_teachers = true`; otherwise masked as `u***@***.com`
- Row expand → lesson-level progress table
- Export CSV button → client-side generation (Papa Parse), columns: student_id, display_name, progress_pct, completed, last_watched
- Error: `EMPTY_RESULT` → "No student data available for this course."

**Blockers:** P4-TEACHER-002  
**Unblocks:** P4-TEACHER-004

---

### P4-TEACHER-004 · Teacher Analytics Page 🟠 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/my-courses/[id]/analytics/page.tsx`
- KPI row from `mv_course_stats` WHERE `course_id` in teacher's courses
- Progress distribution chart (Recharts BarChart)
- Lesson watch-time table: sortable by total watch_time
- Enrollment trend chart (30 days)
- "All My Courses" aggregate view: one row per course with enrolled/completed/progress

**Blockers:** P4-TEACHER-002, P3-COURSE-005  
**Unblocks:** None

---

### P4-TEACHER-005 · Teacher Warnings Page 🔴 `M`

**Acceptance Criteria:**

- Route: `app/(dashboard)/warnings/page.tsx` (shared route, scoped by role)
- Teacher view:
  - Issue warning form: student selector (enrolled in teacher's courses only), reason (min 20 chars), severity, action
  - Calls `issue_warning(userId, reason, severity, action)`
  - On `AUTO_SUSPEND` → info banner: "Student automatically suspended after [N] warnings."
  - Warnings list: shows only WHERE `issued_by = auth.uid()` — enforced by RLS policy (see P4-TEACHER-006)
- Admin view (same page, different query): all warnings in tenant, with issuer column

**Blockers:** P4-TEACHER-002, P4-TEACHER-006  
**Unblocks:** None

---

### P4-TEACHER-006 · Warnings RLS Policy Fix 🔴 `S`

**Description:**  
Fix the known RLS gap on the `warnings` table. Currently teachers can potentially access all warnings in their tenant. The correct policy should scope teacher access to only warnings they issued.

**Acceptance Criteria:**

- Migration file `supabase/migrations/YYYYMMDD_fix_warnings_rls.sql`:

  ```sql
  -- Drop existing overly-permissive policy if any
  DROP POLICY IF EXISTS warnings_tenant_isolation ON warnings;

  -- SELECT: Teacher sees own warnings; Admin/Super-admin sees all in tenant
  CREATE POLICY warnings_select ON warnings
    FOR SELECT USING (
      tenant_id = current_setting('app.tenant_id')::UUID
      AND (
        issued_by = auth.uid()
        OR is_current_user_admin()
      )
    );

  -- INSERT: Teacher can only insert warnings they authored
  CREATE POLICY warnings_insert ON warnings
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.tenant_id')::UUID
      AND issued_by = auth.uid()
    );

  -- UPDATE: Only admins can update warnings (e.g. resolve/dismiss)
  CREATE POLICY warnings_update ON warnings
    FOR UPDATE USING (
      tenant_id = current_setting('app.tenant_id')::UUID
      AND is_current_user_admin()
    ) WITH CHECK (
      tenant_id = current_setting('app.tenant_id')::UUID
      AND is_current_user_admin()
    );

  -- DELETE: Only super-admins can delete warnings
  CREATE POLICY warnings_delete ON warnings
    FOR DELETE USING (
      tenant_id = current_setting('app.tenant_id')::UUID
      AND is_current_user_super_admin()
    );
  ```

- Vitest unit test: mock Supabase client as teacher → confirm cannot query other teachers' warnings
- Vitest unit test: mock Supabase client as teacher → confirm cannot UPDATE or DELETE any warning
- Integration test against local Supabase: teacher A cannot see teacher B's warnings in same tenant

**Blockers:** P0-INFRA-002  
**Unblocks:** P4-TEACHER-005

---

**Phase 4 Summary**

| Task ID        | Title                     | Priority | Size | Days |
| -------------- | ------------------------- | -------- | ---- | ---- |
| P4-TEACHER-001 | Teacher Route Guard       | 🟠       | M    | 0.5  |
| P4-TEACHER-002 | My Courses Page (Teacher) | 🔴       | L    | 1.5  |
| P4-TEACHER-003 | Student Progress Page     | 🔴       | L    | 1.5  |
| P4-TEACHER-004 | Teacher Analytics Page    | 🟠       | L    | 0.5  |
| P4-TEACHER-005 | Teacher Warnings Page     | 🔴       | M    | 0.5  |
| P4-TEACHER-006 | Warnings RLS Policy Fix   | 🔴       | S    | 0.5  |

**Phase 4 Total:** ~5 days

---

## 7. Phase 5 — System Settings & Feature Flags

> **Goal:** KV settings editor, maintenance wizard, app lock, feature flag management.  
> **Duration:** Week 8 (5 days)  
> **Owner:** Frontend Engineer

---

### P5-SETTINGS-001 · Settings Service & Cache Invalidation 🔴 `M`

**Acceptance Criteria:**

- `apps/web/src/services/settings.service.ts`:
  ```typescript
  getAllSettings(): Promise<SettingKv[]>
  getSetting(key: string): Promise<string>
  setSetting(key: string, value: string): Promise<void>
  enableMaintenanceMode(params: MaintenanceModeParams): Promise<void>
  disableMaintenanceMode(): Promise<void>
  lockApp(message: string): Promise<void>
  unlockApp(): Promise<void>
  ```
- React Query hook `useSettings()` — fetches all settings, grouped by category
- `useRealtimeSettingsSync()` hook: subscribes to `cache_invalidation` channel → invalidates `queryKeys.settings.all` on receive
- `setSetting` error mapping: `SETTING_NOT_FOUND`, `ADMIN_ONLY`, `INVALID_TYPE`

**Blockers:** P1-SHELL-005  
**Unblocks:** P5-SETTINGS-002

---

### P5-SETTINGS-002 · Settings Page 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/settings/page.tsx`
- Tabs by category: Security, Maintenance, Limits, General
- Each setting row: label (Arabic), key (monospace), current value, value_type badge, is_public badge, version, "Edit" button
- Inline editing with type-aware inputs:
  - `boolean` → MUI Switch (saves "true"/"false")
  - `integer` → number input with min/max from Zod schema
  - `json` → Monaco editor (lite) or textarea with JSON validation
  - `string` → text field
- Save via `set_setting` RPC; optimistic update on cache
- Unsaved changes indicator; "Revert" button
- Admin-only: wraps entire edit form in `PermissionGate permission="settings.write"`

**Blockers:** P5-SETTINGS-001  
**Unblocks:** P5-SETTINGS-003

---

### P5-SETTINGS-003 · Maintenance Mode Wizard 🟠 `L`

**Acceptance Criteria:**

- `components/domain/settings/MaintenanceWizard.tsx` — 5-step wizard:
  1. Enable/Disable toggle
  2. Message textarea (Arabic + English)
  3. Ends-at datetime picker (client validates: must be future)
  4. Excluded roles multi-select (fetches from `roles` table)
  5. Excluded users search (user search dialog)
- Preview panel: shows what end-users will see
- Submit → calls `enable_maintenance_mode(message, endsAt, excludeRoles, excludeUsers)`
- Disable button → calls `disable_maintenance_mode()` with ConfirmDialog
- Error: `ENDS_AT_PAST` → inline validation error

**Blockers:** P5-SETTINGS-002  
**Unblocks:** None

---

### P5-SETTINGS-004 · App Lock Controls 🟠 `M`

**Acceptance Criteria:**

- `components/domain/settings/AppLockControl.tsx`:
  - Prominent banner in Settings page when `app_locked = true`: "Application is currently locked for all users"
  - Lock button → ConfirmDialog with message textarea, calls `lock_app_for_all(message)`
  - Unlock button → simple ConfirmDialog, calls `unlock_app()`
- `components/layout/AdminShell.tsx` shows persistent warning banner at top when app is locked (fetched via `useCheckDashboardAccess`)

**Blockers:** P5-SETTINGS-001  
**Unblocks:** None

---

### P5-SETTINGS-005 · Feature Flags Page 🟠 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/feature-flags/page.tsx`
- List all flags: key, label (Arabic), is_enabled toggle, rollout_pct slider (0–100), starts_at, ends_at, metadata
- Expandable row: per-flag role overrides table (feature_flag_roles: role, include/exclude)
- Per-flag user overrides table (feature_flag_users: email, include/exclude)
- Add override buttons → role selector / user search dialog
- Toggle changes call `set_setting` pattern via direct `feature_flags` table UPDATE (admin only, RLS enforced)
- Error states: `PERMISSION_DENIED` (non-super_admin tries to manage global flags)

**Blockers:** P5-SETTINGS-001  
**Unblocks:** None

---

**Phase 5 Summary**

| Task ID         | Title                    | Priority | Size | Days |
| --------------- | ------------------------ | -------- | ---- | ---- |
| P5-SETTINGS-001 | Settings Service & Cache | 🔴       | M    | 1    |
| P5-SETTINGS-002 | Settings Page            | 🔴       | L    | 1.5  |
| P5-SETTINGS-003 | Maintenance Mode Wizard  | 🟠       | L    | 1    |
| P5-SETTINGS-004 | App Lock Controls        | 🟠       | M    | 0.5  |
| P5-SETTINGS-005 | Feature Flags Page       | 🟠       | L    | 1.5  |

**Phase 5 Total:** ~5.5 days

---

## 8. Phase 6 — Monitoring, Audit & Job Queue

> **Goal:** Audit log viewer with hash-chain verification, rate limits dashboard, live activity stream, job queue management.  
> **Duration:** Weeks 9–10 (8 days)  
> **Owner:** Senior Frontend Engineer

---

### P6-MONITOR-001 · Audit Service Layer 🔴 `M`

**Acceptance Criteria:**

- `apps/web/src/services/audit.service.ts`:
  ```typescript
  getActivityLogs(filters: AuditFilters, page: number): Promise<PaginatedResult<ActivityLog>>
  getAuditChainState(): Promise<{ last_seq: number; last_hash: string }>
  flushActivityLogs(batchSize: number): Promise<number>
  verifyHashChain(logs: ActivityLog[], genesisHash: string): Promise<VerificationResult>
  ```
- `verifyHashChain` — pure client-side SHA-256 recomputation using Web Crypto API:
  ```typescript
  const computed = await sha256(seq + id + userId + activityType + details + prevHash);
  return computed === entry_hash;
  ```
- Filters: user_id (email search), activity_type (multi-select), risk_level (multi-select), created_at range, tenant_id

**Blockers:** P1-SHELL-005  
**Unblocks:** P6-MONITOR-002

---

### P6-MONITOR-002 · Audit Log Viewer 🔴 `XL`

**Acceptance Criteria:**

- Route: `app/(dashboard)/audit/page.tsx` (super_admin only)
- DataGrid: seq, created_at, user email, activity_type, risk_level chip, entry_hash (truncated 12 chars), details (JSON tooltip)
- Row expand → full details JSON (prettified), prev_hash (with "Chain Link" arrow to previous entry)
- Filter panel: user search, activity_type multi-select, risk_level filter, date range
- `components/domain/audit/ChainVerifier.tsx`:
  - "Verify Chain" button: fetches all logs for visible time range, runs `verifyHashChain` client-side
  - Progress bar during verification
  - Result: green "Chain Intact (N entries verified)" or red "TAMPER DETECTED at seq [N]"
- Manual flush: "Flush Queue" button → calls `flush_activity_logs(200)` → shows count flushed
- Error: `LOCK_CONTENTION` → "Another flush is in progress. Try again in 60 seconds."
- `components/domain/audit/LiveActivityStream.tsx`:
  - Sidebar panel (toggle) — Realtime subscription to `activity_log_queue` WHERE `flushed = false`
  - Events displayed as feed; risk_level highlight colours
  - Auto-pause at 200 events with "Paused — [N] events queued" indicator

**Blockers:** P6-MONITOR-001  
**Unblocks:** P6-MONITOR-003

---

### P6-MONITOR-003 · Rate Limits Dashboard 🟠 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/audit/page.tsx` — "Rate Limits" tab
- Active blocks table: user_id/email, ip_address, action, hit_count, blocked_until countdown timer
- Top offenders: GROUP BY user_id/ip ORDER BY hit_count DESC LIMIT 20 (last 24h)
- Rate Limit Rules table: action, max_hits, window_seconds, block_seconds, is_active toggle
- "Clear Block" action per row (DELETE from rate_limits WHERE blocked_until)
- Live refresh every 30 seconds (React Query `refetchInterval: 30_000`)

**Blockers:** P6-MONITOR-001  
**Unblocks:** None

---

### P6-MONITOR-004 · Job Queue Management 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/jobs/page.tsx`
- `apps/web/src/services/jobs.service.ts`:
  ```typescript
  getJobs(filters: JobFilters, page: number): Promise<PaginatedResult<Job>>
  retryJob(id: string): Promise<void>      // sets status = 'pending', increments max_attempts
  cancelJob(id: string): Promise<void>     // sets status = 'dead'
  releaseStaleJobs(): Promise<number>
  ```
- Tabbed view: Pending, Processing, Done, Failed, Dead — count badge per tab
- Columns: job_type, status chip, priority, attempts/max_attempts, run_at, locked_by, error_msg (truncated)
- Failed tab: Retry button per row, "Retry All Failed" bulk button
- Processing tab: "Release Stale Locks" button → calls `release_stale_job_locks()` → shows count
- Realtime badge count: subscribes to `job_queue` changes for status column

**Blockers:** P1-SHELL-005  
**Unblocks:** P7-BULK-001

---

**Phase 6 Summary**

| Task ID        | Title                 | Priority | Size | Days |
| -------------- | --------------------- | -------- | ---- | ---- |
| P6-MONITOR-001 | Audit Service Layer   | 🔴       | M    | 1    |
| P6-MONITOR-002 | Audit Log Viewer      | 🔴       | XL   | 3    |
| P6-MONITOR-003 | Rate Limits Dashboard | 🟠       | L    | 1.5  |
| P6-MONITOR-004 | Job Queue Management  | 🔴       | L    | 1.5  |

**Phase 6 Total:** ~7 days

---

## 9. Phase 7 — Bulk Operations

> **Goal:** Edge Function for bulk actions + full UI for progress tracking, cancellation, and partial failure handling.  
> **Duration:** Weeks 10–11 (8 days)  
> **Owner:** Senior Engineer + Backend Engineer

---

### P7-BULK-001 · Bulk Action Edge Function 🔴 `XXL`

**Description:**  
Supabase Edge Function that validates, queues, and manages bulk jobs.

**Acceptance Criteria:**

- `edge-functions/bulk-action/index.ts`:
  - Validates JWT (`_shared/auth.ts`): extracts user_id + role, verifies permission for requested action
  - Validates request body against Zod schema (see PRD Section 7.2)
  - `dry_run: true` → runs COUNT(\*) from filters, returns `{ estimated_count }` without inserting
  - `dry_run: false` → validates estimated_count ≤ 500, checks job_queue pending < 10,000
  - Inserts job record into `job_queue` with `job_type = action`, `payload = { filters, params, initiator_id }`
  - Returns `202 Accepted` with `{ job_id, estimated_count, status: 'pending', created_at }`
  - Logs via `log_activity_async(userId, 'bulk_action_queued', { action, estimated_count }, ...)`

- `edge-functions/_shared/auth.ts`:

  ```typescript
  async function requirePermission(jwt: string, permission: PermissionName): Promise<User>;
  // throws 403 if permission missing; extracts user from JWT + validates token_version
  ```

- `edge-functions/_shared/supabaseAdmin.ts`:

  ```typescript
  // createClient with SUPABASE_SERVICE_ROLE_KEY — Deno env only
  // Never exposed to browser
  ```

- Error responses (JSON):
  ```json
  { "error": "PAYLOAD_TOO_LARGE", "message": "...", "max": 500 }
  { "error": "PERMISSION_DENIED", "message": "..." }
  { "error": "INVALID_FILTERS", "message": "...", "count": 0 }
  { "error": "JOB_QUEUE_FULL",   "message": "...", "pending": 10123 }
  ```

**Blockers:** P0-INFRA-003, P6-MONITOR-004  
**Unblocks:** P7-BULK-002

---

### P7-BULK-002 · Bulk Worker Edge Function 🔴 `XL`

**Description:**  
Worker that dequeues and processes bulk jobs in batches.

**Acceptance Criteria:**

- `edge-functions/bulk-worker/index.ts`:
  - Triggered by Supabase cron (every 60 seconds) or HTTP trigger
  - Calls `dequeue_job('bulk-worker', BULK_JOB_TYPES, 1800)` to claim a job
  - Processes 50 records per batch iteration
  - Per action: calls the appropriate RPC per user (with service_role client, bypassing RLS for admin operations)
  - After each batch: broadcasts progress via `pg_notify('job_progress', { job_id, processed, total, failed_ids })`
  - On completion: updates `job_queue.status = 'done'`, stores `{ processed, failed_ids }` in `error_msg`
  - On partial failure: logs failed user IDs, continues processing rest, marks `status = 'done'` with failure details
  - On exception: increments `attempts`, resets `status = 'pending'` if `attempts < max_attempts`, else `'dead'`

**Blockers:** P7-BULK-001  
**Unblocks:** P7-BULK-003

---

### P7-BULK-003 · Bulk Action UI (BulkActionBar) 🔴 `L`

**Acceptance Criteria:**

- `components/domain/users/BulkActionBar.tsx` (extends P2-USER-003):
  - Shows when ≥1 users selected in DataGrid
  - Action buttons: Lock, Suspend, Warn, Terminate Sessions, Reset Devices, Export
  - Dry-run preview: on action click, first calls Edge Function with `dry_run: true`; shows "This will affect N users" in ConfirmDialog before submitting
  - Submit → calls Edge Function with `dry_run: false`; receives `job_id`

- `components/domain/users/BulkProgressPanel.tsx`:
  - Replaces BulkActionBar after submission
  - Shows: action name, estimated_count, processed/total progress bar, elapsed time
  - Realtime updates via Supabase Realtime on `job_queue` WHERE `id = job_id`
  - Cancel button → PATCH to Edge Function; disabled if status = 'processing'
  - On `status = 'done'`: shows summary toast: "N users [action] successfully."
  - On partial failure: warning toast: "N succeeded, M failed. [View Failed Users]" link

**Blockers:** P7-BULK-002, P2-USER-003  
**Unblocks:** P7-BULK-004

---

### P7-BULK-004 · Bulk Export Edge Function 🟠 `L`

**Description:**  
Export user data as JSON or CSV with signed download URL.

**Acceptance Criteria:**

- `edge-functions/bulk-export/index.ts`:
  - Triggered by bulk worker when `job_type = 'bulk_export'`
  - Collects all data for filtered users across: users, user_roles, enrollments, warnings, devices, activity_logs (last 30 days)
  - Generates JSON or CSV (based on `export_format` param)
  - Uploads to Supabase Storage bucket `exports/` with path `exports/{tenant_id}/{job_id}.{ext}`
  - Creates signed URL with 1-hour TTL
  - Updates `job_queue.error_msg` with `{ download_url, expires_at }`

- UI: `BulkProgressPanel` shows "Download Ready" button when export job completes; opens signed URL in new tab

**Blockers:** P7-BULK-002  
**Unblocks:** None

---

**Phase 7 Summary**

| Task ID     | Title                     | Priority | Size | Days |
| ----------- | ------------------------- | -------- | ---- | ---- |
| P7-BULK-001 | Bulk Action Edge Function | 🔴       | XXL  | 3    |
| P7-BULK-002 | Bulk Worker Edge Function | 🔴       | XL   | 2.5  |
| P7-BULK-003 | Bulk Action UI            | 🔴       | L    | 1.5  |
| P7-BULK-004 | Bulk Export Edge Function | 🟠       | L    | 1    |

**Phase 7 Total:** ~8 days

---

## 10. Phase 8 — Analytics & Reporting

> **Goal:** Global analytics dashboard, materialised view charts, CSV/PDF export.  
> **Duration:** Week 12 (5 days)  
> **Owner:** Frontend Engineer

---

### P8-ANALYTICS-001 · Analytics Service & MV Queries 🔴 `M`

**Acceptance Criteria:**

- `apps/web/src/services/analytics.service.ts`:
  ```typescript
  getUserStats(tenantId?: string): Promise<MvUserStats>
  getCourseStats(courseId?: string): Promise<MvCourseStats[]>
  getDailyActivity(tenantId?: string, hours?: number): Promise<MvDailyActivity[]>
  getUserRegistrationTrend(days: number): Promise<DailyCount[]>
  getGeographicDistribution(tenantId?: string): Promise<GeoPoint[]>
  ```
- React Query hooks with `staleTime: 60_000` (1 minute for MV data)
- `refreshed_at` field shown below each chart: "Last updated: 5 minutes ago"

**Blockers:** P1-SHELL-005  
**Unblocks:** P8-ANALYTICS-002

---

### P8-ANALYTICS-002 · Analytics Dashboard Page 🔴 `XL`

**Acceptance Criteria:**

- Route: `app/(dashboard)/analytics/page.tsx`
- Super-admin: global view (no tenant filter); Admin: tenant-scoped
- **Section 1 — User Metrics:**
  - KPI cards: Total Users, Active Users, DAU/WAU/MAU (from `mv_user_stats`)
  - User registration trend line chart (last 90 days, Recharts)
  - User status distribution pie chart (active/locked/suspended/banned)
- **Section 2 — Course Metrics:**
  - Top 10 courses by enrollment (bar chart)
  - Average progress distribution (stacked bar)
  - Total video views trend (line chart, last 30 days from `video_views`)
- **Section 3 — Activity Heatmap:**
  - From `mv_daily_activity`: 48-hour heatmap, colour by event_count, tooltip with activity_type breakdown
  - Risk level filter: show only high/critical events
- **Section 4 — Geographic Distribution:**
  - From `user_location_logs`: placeholder world map (react-simple-maps) with dot density
  - Table fallback: country code + user count
- Export all section data as CSV → client-side generation; PDF → calls `edge-functions/export-report`

**Blockers:** P8-ANALYTICS-001  
**Unblocks:** P8-ANALYTICS-003

---

### P8-ANALYTICS-003 · Report Export Edge Function 🟠 `L`

**Acceptance Criteria:**

- `edge-functions/export-report/index.ts`:
  - Accepts: `{ report_type: 'user_stats' | 'course_stats' | 'activity', tenant_id, date_range, format: 'csv' | 'pdf' }`
  - CSV: streams data from MV queries, generates CSV via Deno CSV library
  - PDF: uses `jsPDF` Deno-compatible library; includes EduZone header, generated timestamp, page numbers
  - Returns signed Storage URL (1-hour TTL) or streams response directly

**Blockers:** P7-BULK-001 (auth pattern)  
**Unblocks:** None

---

**Phase 8 Summary**

| Task ID          | Title                          | Priority | Size | Days |
| ---------------- | ------------------------------ | -------- | ---- | ---- |
| P8-ANALYTICS-001 | Analytics Service & MV Queries | 🔴       | M    | 1    |
| P8-ANALYTICS-002 | Analytics Dashboard Page       | 🔴       | XL   | 3    |
| P8-ANALYTICS-003 | Report Export Edge Function    | 🟠       | L    | 1.5  |

**Phase 8 Total:** ~5.5 days

---

## 11. Phase 9 — Tenant Management (Super-Admin)

> **Goal:** Full tenant CRUD, resource monitoring, and tenant-scoped audit for super_admin.  
> **Duration:** Week 13 (5 days)  
> **Owner:** Frontend Engineer

---

### P9-TENANT-001 · Tenant Service Layer 🔴 `M`

**Acceptance Criteria:**

- `apps/web/src/services/tenants.service.ts`:
  ```typescript
  getTenants(filters: TenantFilters): Promise<PaginatedResult<Tenant>>
  getTenantById(id: string): Promise<TenantDetail>
  createTenant(data: CreateTenantInput): Promise<Tenant>
  updateTenant(id: string, data: UpdateTenantInput): Promise<Tenant>
  suspendTenant(id: string, reason: string): Promise<void>
  deleteTenant(id: string): Promise<void>  // soft delete
  getTenantAuditLogs(tenantId: string, filters: AuditFilters): Promise<PaginatedResult<ActivityLog>>
  ```
- Validation: slug uniqueness pre-check before create (SELECT from `tenants WHERE slug = ?`)
- `createTenant` inserts directly (admin RLS allows) or via Edge Function for slug validation

**Blockers:** P1-SHELL-005  
**Unblocks:** P9-TENANT-002

---

### P9-TENANT-002 · Tenants List Page 🔴 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/tenants/page.tsx` (super_admin only — route guard)
- DataGrid: name, slug, plan badge, region badge, shard_id, status, current_users/max_users bar, current_courses/max_courses bar, created_at
- Filters: region, plan, status
- Actions: View Detail, Edit, Suspend, Delete
- Create Tenant FAB → TenantForm sheet

**Blockers:** P9-TENANT-001  
**Unblocks:** P9-TENANT-003

---

### P9-TENANT-003 · Tenant Detail Page 🟠 `L`

**Acceptance Criteria:**

- Route: `app/(dashboard)/tenants/[id]/page.tsx`
- Overview tab: all tenant fields, resource usage bars (users, courses, storage)
- Users tab: users list scoped to this tenant (reuses P2-USER-003 component with `tenant_id` filter)
- Courses tab: courses scoped to tenant
- Audit tab: activity_logs filtered by `tenant_id`
- Edit form: update plan, max_users, max_courses, max_storage_bytes, region
- Suspend button → ConfirmDialog with reason → triggers `bulk_terminate_sessions` for all tenant users via job_queue + sets tenant `status = 'suspended'`

**Blockers:** P9-TENANT-002  
**Unblocks:** None

---

**Phase 9 Summary**

| Task ID       | Title                | Priority | Size | Days |
| ------------- | -------------------- | -------- | ---- | ---- |
| P9-TENANT-001 | Tenant Service Layer | 🔴       | M    | 1    |
| P9-TENANT-002 | Tenants List Page    | 🔴       | L    | 1.5  |
| P9-TENANT-003 | Tenant Detail Page   | 🟠       | L    | 2    |

**Phase 9 Total:** ~4.5 days

---

## 12. Phase 10 — QA, Hardening & Launch

> **Goal:** Full E2E test suite, security audit, performance tuning, i18n completion, production deploy.  
> **Duration:** Weeks 14–18 (18 days)  
> **Owner:** Full Team

---

### P10-QA-001 · Unit Test Suite 🔴 `XL`

**Acceptance Criteria:**

- Vitest tests for all service functions (mock Supabase client)
- Coverage ≥ 80% for: `services/`, `hooks/`, `store/`, `forms/schemas/`
- `parseRpcError` — tests for every error code in the catalogue
- `verifyHashChain` — tests with tampered and valid chains
- `bind_device_for_current_user` rate limit logic mocked and tested

**Blockers:** All Phase 1–9 tasks  
**Unblocks:** P10-QA-003

---

### P10-QA-002 · Storybook Component Library 🟡 `XL`

**Acceptance Criteria:**

- Stories for every component in `components/ui/` and `components/domain/`
- Interaction tests (Storybook play functions) for:
  - ConfirmDialog — all variants (lock, ban, suspend)
  - UserProfileDrawer — all 5 tabs
  - BulkProgressPanel — pending → processing → done → partial failure states
  - ChainVerifier — intact and tampered scenarios
- Published to Chromatic for visual regression tracking

**Blockers:** All UI tasks  
**Unblocks:** P10-QA-003

---

### P10-QA-003 · Playwright E2E Tests 🔴 `XXL`

**Description:**  
End-to-end tests using Playwright (per RFC-012 binding decision) against Supabase staging environment. Playwright chosen over Cypress for superior multi-tab support (critical for token-version testing), cross-browser coverage, and CI reliability.

**Acceptance Criteria:**
Critical flows tested against Supabase staging environment:

- `e2e/auth/login.spec.ts` — login, MFA, wrong credentials, session_invalidated banner
- `e2e/auth/token-version.spec.ts` — force logout from second tab; assert first tab redirects
- `e2e/users/lock-user.spec.ts` — lock a user; assert account_status changes; unlock
- `e2e/users/suspend-user.spec.ts` — suspend with duration; verify auto-unsuspend
- `e2e/users/ban-user.spec.ts` — requires "BAN" typed; verify permanent
- `e2e/users/bulk-lock.spec.ts` — select 5 users; dry-run; confirm; progress panel
- `e2e/courses/enroll-student.spec.ts` — enroll; verify in enrollments table
- `e2e/courses/revoke-enrollment.spec.ts` — revoke; verify status change
- `e2e/warnings/issue-warning.spec.ts` — issue 3 warnings; verify auto-suspend
- `e2e/settings/maintenance-mode.spec.ts` — enable; verify end-user blocked; disable
- `e2e/settings/app-lock.spec.ts` — lock app; verify check_dashboard_access returns app_locked; unlock
- `e2e/audit/verify-chain.spec.ts` — flush logs; verify chain; assert "Chain Intact"
- `e2e/rtl/arabic-layout.spec.ts` — all pages render correctly in RTL (Arabic locale); verify sidebar, data grids, dialogs
- Test factories using `@faker-js/faker` for seed data generation (per Testing Strategy §7.2)
- Playwright config: `chromium`, `firefox`, `webkit` browsers; CI parallelisation with sharding

**Blockers:** P10-QA-001  
**Unblocks:** P10-LAUNCH-002

---

### P10-SECURITY-001 · Security Audit 🔴 `L`

**Acceptance Criteria:**

- Manual OWASP Top 10 review against all Edge Functions
- Verify `service_role` key only present in edge functions (gitleaks scan passes)
- RLS smoke test: login as teacher; attempt direct Supabase query to `users` → assert 0 rows returned
- `user_has_permission` exhaustive test: teacher attempting every admin permission → assert false
- Verify all forms have CSRF protection (Supabase JWT is stateless; verify no cookie-based session exploits)
- Dependency audit: `pnpm audit` — fix all critical CVEs

**Blockers:** P10-QA-001  
**Unblocks:** P10-LAUNCH-001

---

### P10-SECURITY-002 · GDPR Data Erasure Job 🔴 `M`

**Description:**  
Implement GDPR Article 17 (Right to Erasure) compliance. Soft-deleted user records must be hard-deleted after 30 days. Data export on request must complete within 72 hours (SECURITY_DESIGN §10).

**Acceptance Criteria:**

- `supabase/migrations/YYYYMMDD_gdpr_hard_delete.sql`:
  ```sql
  CREATE OR REPLACE FUNCTION gdpr_hard_delete_expired_users()
  RETURNS INT
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    deleted_count INT;
    orphan_count  INT;
  BEGIN
    -- PRE-CHECK: Verify all FK relationships have ON DELETE CASCADE/SET NULL
    -- If any FK lacks cascade, this function will fail safely (FK violation)

    -- Step 1: Delete users (cascade handles: devices, sessions, enrollments, warnings)
    -- activity_log uses ON DELETE SET NULL (preserves audit trail with NULL actor)
    WITH deleted AS (
      DELETE FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '30 days'
      RETURNING id
    )
    SELECT count(*) INTO deleted_count FROM deleted;

    -- Step 2: Verify no orphan records remain (safety net)
    SELECT count(*) INTO orphan_count
    FROM devices d
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.user_id);

    IF orphan_count > 0 THEN
      RAISE WARNING 'GDPR erasure left % orphan device records', orphan_count;
    END IF;

    -- Step 3: Log the erasure action
    PERFORM log_activity_async(
      NULL, system_tenant_id(), 'gdpr_hard_delete',
      jsonb_build_object('deleted_count', deleted_count, 'orphans_detected', orphan_count),
      NULL, NULL, NULL, 'low'
    );
    RETURN deleted_count;
  END;
  $$;
  ```
- **CASCADE verification checklist** (must pass before deploying):
  | Child Table | FK Column | ON DELETE | Status |
  |-------------|-----------|-----------|--------|
  | devices | user_id | CASCADE | ✅ |
  | sessions | user_id | CASCADE | ✅ |
  | enrollments | student_id | CASCADE | ✅ |
  | warnings | user_id | SET NULL | ✅ |
  | activity_log_queue | actor_id | SET NULL | ✅ |
  | user_roles | user_id | CASCADE | ✅ |
  | user_permission_cache | user_id | CASCADE | ✅ |
- pg_cron job added to P0-INFRA-007: `SELECT cron.schedule('gdpr_hard_delete', '0 5 * * *', 'SELECT gdpr_hard_delete_expired_users()')`
- Data export Edge Function: `supabase/functions/export-user-data/index.ts`
  - Accepts `user_id`, packages all user data (profile, enrollments, progress, warnings, sessions) as JSON
  - Rate limited: 1 export per user per 24 hours
  - Returns signed URL with 48-hour expiry
- Integration test: soft-delete a user, advance clock 31 days, run function, verify user AND all child records are fully gone

**Blockers:** P0-INFRA-007, P10-SECURITY-001  
**Unblocks:** P10-LAUNCH-001

---

### P10-PERF-001 · Performance Tuning 🟠 `L`

**Acceptance Criteria:**

- Lighthouse score ≥ 90 for Performance on dashboard home (with Recharts lazy loaded)
- React Query prefetching: prefetch `mv_user_stats` in layout Server Component
- DataGrid virtualisation verified with 10,000 row mock dataset (no jank)
- Bundle analysis: `@next/bundle-analyzer` — identify and eliminate large client-side imports
- MUI tree-shaking verified: no full MUI import (`import * as MUI`)
- Image optimisation: Next.js `<Image>` for all thumbnails with proper `sizes` prop

**Blockers:** P10-QA-001  
**Unblocks:** P10-LAUNCH-001

---

### P10-I18N-001 · i18n Completion 🟠 `L`

**Acceptance Criteria:**

- `next-intl` configured for `en` and `ar` locales
- All hardcoded English strings extracted to `i18n/en.json`
- Arabic translations complete in `i18n/ar.json` (all keys present — no fallback to English)
- RTL layout tested: Sidebar items, DataGrid headers, form labels all mirror correctly
- Arabic number formatting (Intl.NumberFormat with `ar` locale) for stats and counts
- Date formatting: `dd/MM/yyyy` for AR, `MM/dd/yyyy` for EN

**Blockers:** All UI tasks  
**Unblocks:** P10-LAUNCH-001

---

### P10-LAUNCH-001 · Staging Deployment & Smoke Test 🔴 `M`

**Acceptance Criteria:**

- `apps/web` deployed to Vercel staging (branch: `staging`)
- All Edge Functions deployed to Supabase staging project
- Schema v10.0 migrations applied to staging DB
- Seed data: 3 test accounts, sample courses, enrollments, warnings
- Full smoke test checklist executed by QA (manual):
  - Login as each of the 3 roles
  - Navigate to every page — assert no 404/500 errors
  - Execute one action per page (lock a user, create a course, issue a warning, etc.)
  - Verify Sentry receives errors from intentional test error trigger

**Blockers:** P10-QA-003, P10-SECURITY-001, P10-PERF-001, P10-I18N-001  
**Unblocks:** P10-LAUNCH-002

---

### P10-LAUNCH-002 · Production Launch 🔴 `M`

**Acceptance Criteria:**

- Production Supabase project provisioned in `me-south-1` (primary region) + `eu-west-1` read replica
- `pg_cron` jobs configured (from PRD Section R):
  - `flush_logs` (every minute)
  - `release_locks` (every minute)
  - `auto_unsuspend` (every 5 minutes)
  - `cleanup_sessions` (every 30 minutes)
  - `refresh_mv` (every hour)
  - `cleanup_rl` (daily 2 AM)
  - `cleanup_alq` (daily 4 AM)
  - `expire_enrollments` (daily midnight)
- DNS configured; SSL certificates active
- Monitoring dashboards active in Supabase + Sentry
- Rollback plan documented: previous Vercel deployment one-click rollback; DB: snapshot before migration
- Go/No-go checklist signed by PM and Tech Lead

**Blockers:** P10-LAUNCH-001  
**Unblocks:** —

---

**Phase 10 Summary**

| Task ID          | Title                       | Priority | Size | Days |
| ---------------- | --------------------------- | -------- | ---- | ---- |
| P10-QA-001       | Unit Test Suite             | 🔴       | XL   | 4    |
| P10-QA-002       | Storybook Component Library | 🟡       | XL   | 3    |
| P10-QA-003       | Playwright E2E Tests        | 🔴       | XXL  | 7    |
| P10-SECURITY-001 | Security Audit              | 🔴       | L    | 2    |
| P10-SECURITY-002 | GDPR Data Erasure Job       | 🔴       | M    | 1    |
| P10-PERF-001     | Performance Tuning          | 🟠       | L    | 1.5  |
| P10-I18N-001     | i18n Completion             | 🟠       | XL   | 3    |
| P10-LAUNCH-001   | Staging Deploy & Smoke Test | 🔴       | M    | 1    |
| P10-LAUNCH-002   | Production Launch           | 🔴       | M    | 1    |

**Phase 10 Total:** ~23.5 days

---

## 13. Task Reference Index

> **Legend — Priority:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low  
> **Legend — Size:** S ≤ 0.5d · M ≤ 1d · L ≤ 2d · XL ≤ 4d · XXL > 4d  
> **Total Estimated Duration:** ~100 days across 20 weeks

| Task ID          | Title                                 | Phase | Priority | Size | Est. Days |
| ---------------- | ------------------------------------- | ----- | -------- | ---- | --------- |
| P0-INFRA-001     | Monorepo Initialisation               | 0     | 🔴       | XL   | 3         |
| P0-INFRA-002     | Supabase Local Dev Setup              | 0     | 🔴       | L    | 1.5       |
| P0-INFRA-003     | CI/CD Pipeline                        | 0     | 🔴       | XL   | 3         |
| P0-INFRA-004     | Type Generation & Shared Types        | 0     | 🔴       | M    | 1         |
| P0-INFRA-005     | Design System & Theme                 | 0     | 🔴       | L    | 1.5       |
| P0-INFRA-006     | Environment Configuration             | 0     | 🟠       | S    | 0.5       |
| P0-INFRA-007     | pg_cron Job Configuration             | 0     | 🔴       | M    | 1         |
| P0-INFRA-008     | Idempotency Key Infrastructure        | 0     | 🔴       | M    | 1         |
| P0-INFRA-009     | Security Headers Configuration        | 0     | 🔴       | S    | 0.5       |
| P1-AUTH-001      | Supabase Client Setup                 | 1     | 🔴       | M    | 1         |
| P1-AUTH-002      | Login Page                            | 1     | 🔴       | L    | 1.5       |
| P1-AUTH-003      | Auth Store (Zustand)                  | 1     | 🔴       | M    | 1         |
| P1-AUTH-004      | Token-Version Mismatch Handler        | 1     | 🔴       | L    | 2         |
| P1-SHELL-001     | AdminShell Layout                     | 1     | 🔴       | XL   | 3         |
| P1-SHELL-002     | Permission Gate Component             | 1     | 🔴       | M    | 1         |
| P1-SHELL-003     | Global UI State (Zustand)             | 1     | 🟠       | M    | 0.5       |
| P1-SHELL-004     | Global Error Boundary & Sentry        | 1     | 🟠       | M    | 1         |
| P1-SHELL-005     | React Query Setup                     | 1     | 🔴       | M    | 0.5       |
| P1-CORE-001      | DI Container & Port Registration      | 1     | 🔴       | L    | 1.5       |
| P1-CORE-002      | Domain Events & Event Bus             | 1     | 🔴       | M    | 1         |
| P1-CORE-003      | Observability Ports & Implementations | 1     | 🟠       | M    | 1         |
| P2-USER-001      | Users Service Layer                   | 2     | 🔴       | L    | 1.5       |
| P2-USER-002      | User Queries (React Query)            | 2     | 🔴       | M    | 1         |
| P2-USER-003      | Users List Page                       | 2     | 🔴       | XL   | 3         |
| P2-USER-004      | User Profile Drawer                   | 2     | 🔴       | XL   | 3         |
| P2-USER-005      | Action Dialogs & Error Handling       | 2     | 🔴       | L    | 1.5       |
| P2-USER-006      | User Realtime Updates                 | 2     | 🟠       | M    | 1         |
| P2-USER-007      | User Zod Schemas & Forms              | 2     | 🟠       | M    | 1         |
| P3-COURSE-001    | Courses Service Layer                 | 3     | 🔴       | L    | 1.5       |
| P3-COURSE-002    | Courses List Page                     | 3     | 🔴       | L    | 1.5       |
| P3-COURSE-003    | Course Detail & Editor                | 3     | 🔴       | XL   | 4         |
| P3-COURSE-004    | Enrollment Management                 | 3     | 🔴       | L    | 1.5       |
| P3-COURSE-005    | Course Analytics Tab                  | 3     | 🟠       | L    | 1.5       |
| P4-TEACHER-001   | Teacher Route Guard                   | 4     | 🟠       | M    | 0.5       |
| P4-TEACHER-002   | My Courses Page (Teacher)             | 4     | 🔴       | L    | 1.5       |
| P4-TEACHER-003   | Student Progress Page                 | 4     | 🔴       | L    | 1.5       |
| P4-TEACHER-004   | Teacher Analytics Page                | 4     | 🟠       | L    | 0.5       |
| P4-TEACHER-005   | Teacher Warnings Page                 | 4     | 🔴       | M    | 0.5       |
| P4-TEACHER-006   | Warnings RLS Policy Fix               | 4     | 🔴       | S    | 0.5       |
| P5-SETTINGS-001  | Settings Service & Cache              | 5     | 🔴       | M    | 1         |
| P5-SETTINGS-002  | Settings Page                         | 5     | 🔴       | L    | 1.5       |
| P5-SETTINGS-003  | Maintenance Mode Wizard               | 5     | 🟠       | L    | 1         |
| P5-SETTINGS-004  | App Lock Controls                     | 5     | 🟠       | M    | 0.5       |
| P5-SETTINGS-005  | Feature Flags Page                    | 5     | 🟠       | L    | 1.5       |
| P6-MONITOR-001   | Audit Service Layer                   | 6     | 🔴       | M    | 1         |
| P6-MONITOR-002   | Audit Log Viewer                      | 6     | 🔴       | XL   | 3         |
| P6-MONITOR-003   | Rate Limits Dashboard                 | 6     | 🟠       | L    | 1.5       |
| P6-MONITOR-004   | Job Queue Management                  | 6     | 🔴       | L    | 1.5       |
| P7-BULK-001      | Bulk Action Edge Function             | 7     | 🔴       | XXL  | 4         |
| P7-BULK-002      | Bulk Worker Edge Function             | 7     | 🔴       | XL   | 2.5       |
| P7-BULK-003      | Bulk Action UI                        | 7     | 🔴       | L    | 1.5       |
| P7-BULK-004      | Bulk Export Edge Function             | 7     | 🟠       | L    | 1         |
| P8-ANALYTICS-001 | Analytics Service & MV Queries        | 8     | 🔴       | M    | 1         |
| P8-ANALYTICS-002 | Analytics Dashboard Page              | 8     | 🔴       | XL   | 3         |
| P8-ANALYTICS-003 | Report Export Edge Function           | 8     | 🟠       | L    | 1.5       |
| P9-TENANT-001    | Tenant Service Layer                  | 9     | 🔴       | M    | 1         |
| P9-TENANT-002    | Tenants List Page                     | 9     | 🔴       | L    | 1.5       |
| P9-TENANT-003    | Tenant Detail Page                    | 9     | 🔴       | L    | 2         |
| P10-QA-001       | Unit Test Suite                       | 10    | 🔴       | XL   | 4         |
| P10-QA-002       | Storybook Component Library           | 10    | 🟡       | XL   | 3         |
| P10-QA-003       | Playwright E2E Tests                  | 10    | 🔴       | XXL  | 7         |
| P10-SECURITY-001 | Security Audit                        | 10    | 🔴       | L    | 2         |
| P10-SECURITY-002 | GDPR Data Erasure Job                 | 10    | 🔴       | M    | 1         |
| P10-PERF-001     | Performance Tuning                    | 10    | 🟠       | L    | 1.5       |
| P10-I18N-001     | i18n Completion                       | 10    | 🟠       | XL   | 3         |
| P10-LAUNCH-001   | Staging Deploy & Smoke Test           | 10    | 🔴       | M    | 1         |
| P10-LAUNCH-002   | Production Launch                     | 10    | 🔴       | M    | 1         |

**Total Tasks:** 66 _(+2 Notification tasks in Section 16)_  
**Total Critical (🔴):** 41 · **Total High (🟠):** 21 · **Total Medium (🟡):** 3 · **Total Low (🟢):** 1  
**Priority Ratio — Critical:** 62% _(target ≤ 65%)_ ✅

> **Priority changes from v1.0 → v2.1:**  
> • `P0-INFRA-005` promoted 🟠 → 🔴 (Design System blocks all UI phases)  
> • `P4-TEACHER-001` demoted 🔴 → 🟠 (Route guard has workaround; not phase-blocking)  
> • `P9-TENANT-003` promoted 🟠 → 🔴 (Tenant detail is core for multi-tenant operations)  
> • Added P0-INFRA-007/008/009, P1-CORE-001/002/003, P4-TEACHER-006, P10-SECURITY-002 (🔴)  
> • Cypress replaced with Playwright per RFC-012 binding decision

---

## 14. Risk Register

| ID    | Risk                                                      | Probability | Impact   | Mitigation                                                                                                           |
| ----- | --------------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| R-001 | Supabase Realtime instability under load                  | Medium      | High     | Implement polling fallback (30s interval) when WS disconnected; exponential reconnect                                |
| R-002 | MV refresh blocking during peak hours                     | Low         | Medium   | Use `CONCURRENTLY` flag; schedule during off-peak (2–4 AM); alert if refresh > 10 min                                |
| R-003 | token_version check adding latency to every call          | Medium      | Medium   | Cache token_version in Zustand; only re-fetch on session refresh, not per-request                                    |
| R-004 | Bulk worker overwhelms DB with 500 RPCs in series         | Medium      | High     | Batch in chunks of 50; use `pg_advisory_xact_lock` to prevent duplicate workers                                      |
| R-005 | Arabic RTL layout breaking in MUI DataGrid                | High        | **High** | Test RTL in dedicated Storybook story per component; use `dir="rtl"` on MUI ThemeProvider; RTL smoke test in CI      |
| R-006 | service_role key accidentally committed                   | Low         | Critical | gitleaks in CI blocks merge; rotate key immediately if detected; weekly secret scan                                  |
| R-007 | hash-chain gap if flush_activity_logs fails               | Low         | High     | Advisory lock in function; idempotent retry; cron monitors gap between last_seq and queue                            |
| R-008 | Scope creep from super_admin feature requests             | High        | Medium   | Strict PRD change control; new features require PM sign-off + phase slot assignment                                  |
| R-009 | Next.js 15 App Router breaking changes                    | Low         | Medium   | Pin Next.js minor version; review changelog before upgrades; regression test on upgrade                              |
| R-010 | Supabase Edge Function cold start latency                 | Medium      | Low      | Keep functions lightweight; use `supabase functions serve` for local testing                                         |
| R-011 | RLS misconfiguration leaks data across tenants            | Low         | Critical | Automated RLS smoke tests in CI (login as Tenant A user, assert zero rows from Tenant B); reviewed per migration     |
| R-012 | Production migration without rollback plan causes outage  | Medium      | Critical | Every migration ships a `down.sql`; apply to staging first; snapshot DB before prod deploy; 15-min rollback window   |
| R-013 | Missing CORS/CSP headers on Edge Functions expose XSS     | Low         | High     | Shared `_shared/headers.ts` enforces `Content-Security-Policy`, `X-Frame-Options`, `CORS` on every Edge Function     |
| R-014 | Notification delivery failure silently drops user alerts  | Medium      | Medium   | Implement dead-letter queue for failed notifications; retry ×3 with exp. backoff; alert admin on 3 consecutive fails |
| R-015 | `warnings` RLS gap leaks cross-teacher data               | High        | High     | Fix RLS policy (P4-TEACHER-006); scope teacher SELECT to `issued_by = auth.uid() OR is_current_user_admin()`         |
| R-016 | i18n bolt-on in Phase 10 requires rework of all UI        | High        | Medium   | Require `t()` wrappers from Phase 1; add i18n extraction check to ESLint; track English-only tech debt               |
| R-017 | pg_cron not testable locally (Supabase Docker limitation) | Medium      | High     | Test cron SQL manually against staging; document workaround; verify via `SELECT * FROM cron.job` after deploy        |
| R-018 | Idempotency infrastructure missing despite RFC-007        | High        | Critical | Added P0-INFRA-008; idempotency store + client key gen + Edge Function guard; blocks all mutation service tasks      |
| R-019 | Schema v10 RPCs reimplemented in TypeScript service layer | Medium      | Medium   | Audit service tasks against schema function list; prefer calling existing RPCs over rewriting logic in application   |

**Risk Summary:** 19 risks · 4 Critical · 7 High · 6 Medium · 2 Low

---

## 15. Dependencies Map

```
P0-INFRA-001 (Monorepo)
    ├── P0-INFRA-002 (Supabase Local)
    │       ├── P0-INFRA-004 (Types)
    │       │       ├── P1-AUTH-001 (Supabase Client)
    │       │       │       ├── P1-AUTH-002 (Login Page)
    │       │       │       │       └── P1-AUTH-004 (Token-Version Handler)
    │       │       │       │               ├── P2-USER-001 (Users Service)
    │       │       │       │               │       └── (all subsequent service layers)
    │       │       │       │               └── P9-TENANT-001 (Tenant Service)
    │       │       │       └── P1-AUTH-003 (Auth Store)
    │       │       │               ├── P1-SHELL-001 (AdminShell)
    │       │       │               │       ├── P4-TEACHER-001 (Teacher Route Guard)
    │       │       │               │       └── All page tasks
    │       │       │               └── P1-SHELL-002 (PermissionGate)
    │       │       │                       └── P4-TEACHER-001 (Teacher Route Guard)
    │       │       ├── P1-CORE-001 (DI Container)  ← NEW: Clean Architecture foundation
    │       │       │       ├── P1-CORE-002 (Domain Events & Event Bus)
    │       │       │       │       └── P2-USER-001, P3-COURSE-001 (all mutations emit events)
    │       │       │       └── P1-CORE-003 (Observability Ports)
    │       │       │               └── P1-SHELL-004 (Error Boundary), all service layers
    │       │       └── P1-SHELL-005 (React Query)
    │       │               └── All service + query tasks
    │       ├── P0-INFRA-007 (pg_cron Jobs)  ← NEW: all 9 scheduled jobs
    │       │       └── P10-LAUNCH-002 (Production)
    │       └── P4-TEACHER-006 (Warnings RLS Fix)  ← NEW: security fix
    │               └── P4-TEACHER-005 (Warnings Page)
    ├── P0-INFRA-003 (CI/CD)
    │       ├── P7-BULK-001 (Bulk Edge Function)
    │       └── P10-LAUNCH-002 (Production)
    ├── P0-INFRA-005 (Design System)  ← blocks ALL UI phases
    │       ├── P1-SHELL-001 (AdminShell)
    │       ├── P2-USER-003 (Users List Page)
    │       ├── P3-COURSE-002 (Courses List Page)
    │       ├── P4-TEACHER-002 (My Courses Page)
    │       ├── P5-SETTINGS-002 (Settings Page)
    │       ├── P6-MONITOR-002 (Audit Log Viewer)
    │       ├── P8-ANALYTICS-002 (Analytics Dashboard)
    │       └── P9-TENANT-002 (Tenants List)
    ├── P0-INFRA-006 (Env Config)  ← implicit dep of ALL phases
    │       └── (every task that reads env vars)
    ├── P0-INFRA-008 (Idempotency)  ← NEW: blocks all mutation tasks
    │       ├── P2-USER-001 (Users Service — mutation hooks)
    │       ├── P7-BULK-001 (Bulk Edge Function)
    │       └── All mutation service layers
    └── P0-INFRA-009 (Security Headers)  ← NEW: CSP/CORS/HSTS
            └── P1-SHELL-004 (Error Boundary)

P7-BULK-001 (Edge Function) ──requires── P0-INFRA-003, P0-INFRA-008, P6-MONITOR-004
    └── P7-BULK-002 (Worker) ──requires── P7-BULK-001
            ├── P7-BULK-003 (UI) ──requires── P7-BULK-002, P2-USER-003
            └── P7-BULK-004 (Export) ──requires── P7-BULK-002

P9-TENANT-003 (Tenant Detail) ──requires── P9-TENANT-002, P2-USER-003, P3-COURSE-002

P10-SECURITY-002 (GDPR Erasure) ──requires── P0-INFRA-007, P10-SECURITY-001  ← NEW

P11-NOTIFY-001 (Notification Service) ──requires── P1-SHELL-005
    └── P11-NOTIFY-002 (Notification Bell UI) ──requires── P11-NOTIFY-001, P1-SHELL-001

P10-QA-001 (Unit Tests) ──requires── All Phase 0–9 tasks
    └── P10-QA-002 (Storybook) ──requires── All UI tasks
            └── P10-QA-003 (Playwright E2E) ──requires── P10-QA-001, P10-QA-002  ← Playwright per RFC-012
                    └── P10-LAUNCH-001 (Staging)
                            └── P10-LAUNCH-002 (Production)
```

---

## 16. Notification System Tasks

> **Rationale:** The EduZone schema (`Eduzone_schema_v10.sql`) includes a `notifications` table with full delivery infrastructure. These tasks were missing from the original plan and are added here as a tracked cross-cutting concern.

### P11-NOTIFY-001 · Notification Service Layer 🟠 `M`

**Acceptance Criteria:**

- `apps/web/src/services/notifications.service.ts`:
  ```typescript
  getNotifications(userId: string, unreadOnly?: boolean): Promise<PaginatedResult<Notification>>
  markAsRead(id: string): Promise<void>
  markAllAsRead(userId: string): Promise<void>
  deleteNotification(id: string): Promise<void>
  ```
- React Query hook `useNotifications()` with `staleTime: 30_000`
- `useRealtimeNotifications()` hook: subscribes to `notifications` table WHERE `user_id = auth.uid()` → auto-appends new rows to cache
- Notification types: `account_action`, `warning_issued`, `course_update`, `system_alert`

**Blockers:** P1-SHELL-005  
**Unblocks:** P11-NOTIFY-002

---

### P11-NOTIFY-002 · Notification Bell UI 🟠 `M`

**Acceptance Criteria:**

- `components/layout/NotificationBell.tsx` in AdminShell topbar:
  - Badge with unread count (max display: 99+)
  - Dropdown panel: list of latest 20 notifications, grouped by date
  - Each item: icon by type, title, body (truncated 80 chars), relative time, read/unread dot
  - Click → mark as read + navigate to relevant page (based on `link_to` field)
  - "Mark all as read" button at panel top
  - "View all notifications" link → `/notifications` full page
- Realtime badge updates via `useRealtimeNotifications()`
- Empty state: "No new notifications" with inbox icon

**Blockers:** P11-NOTIFY-001, P1-SHELL-001  
**Unblocks:** None

---

**Phase 11 Summary**

| Task ID        | Title                      | Priority | Size | Est. Days |
| -------------- | -------------------------- | -------- | ---- | --------- |
| P11-NOTIFY-001 | Notification Service Layer | 🟢       | M    | 1         |
| P11-NOTIFY-002 | Notification Bell UI       | 🟢       | M    | 1         |

**Phase 11 Total:** ~2 days (can be parallelised with Phase 6)

---

## Appendix A — Sprint Schedule

| Sprint | Weeks | Phases       | Key Deliverables                                        |
| ------ | ----- | ------------ | ------------------------------------------------------- |
| S1     | 1–2   | P0           | Monorepo, CI/CD, pg_cron, Idempotency, Security Headers |
| S2     | 3–4   | P1           | Login, Auth, Shell, DI Container, Events, Observability |
| S3     | 5–6   | P2           | Users list, Profile drawer, Action dialogs, Zod schemas |
| S4     | 7–8   | P3           | Courses, Enrollments, Course analytics                  |
| S5     | 9–10  | P4, P5 start | Teacher dashboard, Warnings RLS fix, Settings           |
| S6     | 11–12 | P5 end, P6   | Feature flags, Audit viewer, Job queue                  |
| S7     | 13–14 | P7, P8 start | Bulk actions, Analytics dashboard                       |
| S8     | 15–16 | P8 end, P9   | Report export, Tenant management                        |
| S9     | 17–18 | P10 start    | Unit tests, Storybook, Playwright E2E, GDPR erasure     |
| S10    | 19–20 | P10 end      | Security audit, i18n, Perf tuning, Staging, Production  |

---

## Appendix B — Tech Stack Reference

| Layer          | Technology                   | Version | Purpose                                     |
| -------------- | ---------------------------- | ------- | ------------------------------------------- |
| Framework      | Next.js (App Router)         | 15.x    | SSR, routing, Server Components             |
| Language       | TypeScript                   | 5.x     | Type safety (strict mode)                   |
| UI Library     | Material-UI                  | v5      | Component library, DataGrid                 |
| Styling        | Tailwind CSS                 | v3      | Utility overrides, layout                   |
| Server State   | TanStack Query (React Query) | v5      | Caching, background refetch, optimistic UI  |
| Client State   | Zustand                      | v4      | Auth store, UI store, realtime store        |
| Forms          | React Hook Form + Zod        | v7 + v3 | Validation, schema-driven forms             |
| Charts         | Recharts                     | v2      | Line, Bar, Pie charts                       |
| Drag & Drop    | @dnd-kit/core                | v6      | Section/lesson reordering                   |
| Backend        | Supabase (PostgreSQL 16)     | Pro     | DB, Auth, Realtime, Storage, Edge Functions |
| Edge Functions | Deno (Supabase Edge Runtime) | latest  | Bulk operations, exports, sensitive RPCs    |
| Testing (Unit) | Vitest                       | v1      | Service and hook unit tests                 |
| Testing (E2E)  | Playwright                   | v1.40+  | Critical flow automation (per RFC-012)      |
| Component Docs | Storybook                    | v8      | Component library, visual regression        |
| Error Tracking | Sentry                       | latest  | Frontend errors, performance monitoring     |
| Build Tool     | Turborepo + pnpm             | latest  | Monorepo pipeline management                |
| CI/CD          | GitHub Actions + Vercel      | —       | Automated testing and deployment            |
| i18n           | next-intl                    | v3      | Arabic/English localisation, RTL support    |

---

_EduZone Admin Dashboard — Implementation Plan v2.1_  
_Generated: 2026-03-08 | Revised: 2026-04-05 | Schema: v10.0 | Total Tasks: 66 | Duration: 20 weeks_  
_Changelog v2.1: Added P0-INFRA-007/008/009 (pg_cron, Idempotency, Security Headers) · Added P1-CORE-001/002/003 (DI Container, Domain Events, Observability) · Added P4-TEACHER-006 (Warnings RLS Fix) · Added P10-SECURITY-002 (GDPR Erasure) · Replaced Cypress with Playwright (RFC-012) · Fixed schema version drift v5→v10 · Updated estimates for P3-COURSE-003 (2.5d→4d), P10-QA-003 (5d→7d), P10-I18N-001 (1.5d→3d) · Added 5 risks (R-015–R-019) · Updated sprint schedule to 10 sprints / 20 weeks_
