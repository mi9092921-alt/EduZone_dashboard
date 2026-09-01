# EduZone — System Design Document

> **Version:** 1.0 | **Date:** 2026-03-11 | **Status:** APPROVED  
> **Scope:** Admin & Management Dashboard — Full System Architecture

---

## 1. System Overview

EduZone Admin Dashboard is a multi-tenant, enterprise-grade control plane built on a **Clean Architecture** foundation. It serves three distinct personas (super_admin, admin, teacher) across isolated tenant boundaries, with all operations enforced by PostgreSQL Row-Level Security and Supabase JWT authentication.

### 1.1 Design Goals

| Goal                 | Target                                        |
| -------------------- | --------------------------------------------- |
| **Availability**     | 99.9% uptime (< 8.7 hrs/year downtime)        |
| **API Response**     | P99 < 500ms for all RPC calls                 |
| **Page Load**        | LCP < 2.5s on 4G connection                   |
| **Concurrent Users** | 10,000+ simultaneous admin sessions           |
| **Data Isolation**   | Zero cross-tenant data leakage (RLS-enforced) |
| **Audit Coverage**   | 100% of write operations logged               |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  Next.js 15 (App Router) · TypeScript 5 · React 18             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ React Query  │  │   Zustand    │  │     Zod      │          │
│  │ (server      │  │ (client      │  │ (validation) │          │
│  │  state)      │  │  state)      │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS + JWT
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE LAYER                             │
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │   RPC Functions     │    │     Edge Functions (Deno)   │    │
│  │  (SECURITY DEFINER) │    │  - Bulk operations          │    │
│  │  - User CRUD        │    │  - Data exports             │    │
│  │  - Course ops       │    │  - Session revocation       │    │
│  │  - Analytics        │    │  - service_role operations  │    │
│  │  - Settings         │    │  Rate-limit guard applied   │    │
│  └─────────┬───────────┘    └──────────────┬──────────────┘    │
│            │                               │                   │
│            └───────────────┬───────────────┘                   │
│                            ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL 17 (Row-Level Security)         │   │
│  │                                                         │   │
│  │  users · tenants · courses · enrollments · sessions     │   │
│  │  activity_logs · job_queue · feature_flags · settings   │   │
│  │  rate_limits · audit_chain_state · materialised views   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Clean Architecture Layers

The codebase follows **Clean Architecture** (Ports & Adapters) with strict dependency direction enforced by ESLint + dependency-cruiser.

### 3.1 Layer Dependency Matrix

```
Domain → Application → Infrastructure → Adapters → Features
  ↑____________contracts__________________|
```

| Layer              | Can Import From                | Cannot Import From                 |
| ------------------ | ------------------------------ | ---------------------------------- |
| **Domain**         | Domain only                    | Everything else                    |
| **Application**    | Domain, Contracts              | Infrastructure, Adapters, Features |
| **Infrastructure** | Domain, Application, Contracts | Adapters, Features                 |
| **Contracts**      | Domain                         | Everything else                    |
| **Adapters**       | Domain, Application, Contracts | Infrastructure, Features           |
| **Features**       | Domain, Contracts, Adapters    | Infrastructure, other Features     |

### 3.2 Layer Responsibilities

**Domain Layer** — Pure business logic, zero dependencies:

- `types/` — User, Course, Tenant, Auth TypeScript types
- `schemas/` — Zod validation schemas + inferred DTOs
- `events/` — Domain events (UserSuspended, CoursePublished, etc.)
- `services/` — PermissionService, TenantService (pure functions)
- `observability/` — IMetrics, ITracer ports
- `logger.ts` — ILogger port

**Application Layer** — Use case orchestration:

- `ports/` — IUserRepo, ICourseRepo, IEventBus, IJobQueue, etc.
- `use-cases/` — suspendUser, listUsers, publishCourse, etc.
- `events/handlers/` — onUserSuspended, onCoursePublished, etc.

**Infrastructure Layer** — External integrations:

- `repos/` — SupabaseUserRepo, SupabaseCourseRepo, etc.
- `rpc/client.ts` — Centralised RPC wrapper (retry + metrics + logging)
- `event-bus/` — InMemoryEventBus implementation
- `queue/` — SupabaseJobQueue implementation
- `http/retry.ts` — Exponential backoff with jitter

**Contracts Layer** — Versioned API schemas:

- `rpc/v1/` — Frozen, never modified
- `rpc/v2/` — Active development version
- `common/` — Idempotency, pagination contracts

---

## 4. Data Architecture

### 4.1 Core Entities

```
tenants (1) ──────────────── (N) users
   │                              │
   │                         user_roles ──── roles ──── permissions
   │                              │
   └──── (N) courses ─────── (N) enrollments
              │
         sections ──── lessons ──── user_progress
```

### 4.2 Key Tables

| Table           | Purpose                            | RLS Policy                 |
| --------------- | ---------------------------------- | -------------------------- |
| `users`         | All platform users                 | Tenant-scoped + role-based |
| `tenants`       | Isolated tenant organisations      | super_admin only           |
| `courses`       | Course catalogue                   | Tenant-scoped              |
| `sessions`      | Active user sessions (partitioned) | Owner + admin              |
| `activity_logs` | Immutable audit trail              | Append-only, hash-chained  |
| `job_queue`     | Async job tracking                 | Admin only                 |
| `settings_kv`   | System configuration               | super_admin only           |
| `feature_flags` | Feature gating                     | Role + user targeting      |
| `rate_limits`   | Per-user/endpoint throttling       | Internal only              |

### 4.3 Materialised Views (Analytics)

| View                | Refresh     | Purpose                       |
| ------------------- | ----------- | ----------------------------- |
| `mv_user_stats`     | Every 15min | User activity aggregates      |
| `mv_course_stats`   | Every 15min | Course completion metrics     |
| `mv_daily_activity` | Daily       | Platform-wide activity trends |

---

## 5. API Architecture

### 5.1 Two-Surface Backend

**Supabase RPC (anon key + JWT):**

- Standard CRUD operations
- User account management
- Settings & feature flags
- Analytics queries (via materialised views)
- Activity logging

**Edge Functions (Deno, anon key + JWT):**

- Bulk user operations (suspend/ban/export N users)
- Data export generation (CSV, JSON)
- Session revocation (requires service_role internally)
- Complex cross-table transactions
- Tenant provisioning

### 5.2 Request Lifecycle

```
Browser → React Query hook
  → adapter hook (useListUsers, useSuspendUser, etc.)
  → use-case function (application layer)
  → port interface (IUserRepo)
  → infrastructure impl (SupabaseUserRepo)
  → RpcClient.call() [retry + metrics + logging]
  → supabase.rpc('admin_list_users', params)
  → PostgreSQL RPC [RLS + permission check]
  → DB operation + async audit log
  → typed response
  → React Query cache update → UI
```

### 5.3 Standard Error Envelope

```typescript
interface RpcError {
  code: RpcErrorCode; // e.g. "ADMIN_ONLY", "NOT_FOUND"
  message: string; // Human-readable, shown in UI toast
  detail?: string; // Optional extra context
  hint?: string; // Optional fix suggestion
  ref: string; // x-request-id for Sentry correlation
}
```

---

## 6. Async Processing Architecture

### 6.1 Domain Events

Use cases emit typed domain events instead of calling side-effects directly. This decouples email sending, audit logging, session revocation, and analytics from the main operation.

```
suspendUser use-case
  → repo.suspendUser(userId)           [DB write]
  → eventBus.publish(UserSuspendedEvent) [async]
    → onUserSuspended handler:
        → queue.enqueue('send-suspension-email')
        → queue.enqueue('revoke-user-sessions')
```

### 6.2 Job Queue

All heavy async work goes through IJobQueue:

| Job Name                | Trigger                   | Description                        |
| ----------------------- | ------------------------- | ---------------------------------- |
| `send-suspension-email` | UserSuspendedEvent        | Email to suspended user            |
| `revoke-user-sessions`  | UserSuspended/BannedEvent | Kill all active sessions           |
| `bulk-user-action`      | Admin bulk operation      | Process N users in batches         |
| `bulk-export`           | Admin export request      | Generate CSV/JSON file             |
| `analytics-refresh`     | Schedule / on-demand      | Refresh materialised views         |
| `tenant-provision`      | Tenant creation           | Set up isolated tenant environment |

---

## 7. Security Architecture (Summary)

> Full details in `SECURITY_DESIGN.md`

- **Authentication:** Supabase JWT, MFA required for admin/super_admin
- **Authorisation:** RLS on all tables + `token_version` check on every request
- **Transport:** HTTPS only, HSTS enforced
- **Secrets:** Service role key never in browser; only in Edge Functions server-side
- **Rate Limiting:** Per-user sliding window (100 req/60s default) at Edge layer
- **Idempotency:** UUID v4 keys on all mutations; 24h TTL server-side
- **Audit:** Hash-chained `activity_logs` — tamper-evident, append-only
- **Input Validation:** Zod schemas on all inputs; parameterised queries (no SQL injection)

---

## 8. Scalability Design

### 8.1 Database

- `sessions` table partitioned by `created_at` (monthly partitions)
- Materialised views refreshed on schedule, not per-query
- Connection pooling via Supabase PgBouncer
- Indexes on all foreign keys + frequently filtered columns (status, tenant_id, created_at)

### 8.2 Edge Layer

- Stateless Edge Functions (horizontal scale)
- Rate limit state stored in PostgreSQL (not in-memory)
- Idempotency results cached 24h to handle retries

### 8.3 Frontend

- React Query with stale-while-revalidate caching
- Optimistic updates on mutations
- Virtual scrolling for large datasets (10k+ users)
- Code splitting per feature slice (Next.js dynamic imports)

---

## 9. Multi-Tenancy Model

Every tenant has full data isolation enforced at the database level:

```sql
-- Example RLS policy (applied to all tenant-scoped tables)
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = get_current_tenant_id());
```

- Tenant context is derived from the authenticated JWT, never from URL params
- `super_admin` bypasses tenant isolation to access all data
- Sub-tenants supported for Enterprise plan (max depth: 2 levels)
- Tenant slug: lowercase alphanumeric + hyphens, 4–64 chars

---

## 10. Feature Flags

Feature flags support three targeting modes:

| Mode           | Scope             | Example Use Case                        |
| -------------- | ----------------- | --------------------------------------- |
| **Global**     | All users         | Maintenance mode, emergency kill switch |
| **Role-based** | By `primary_role` | Beta features for admins only           |
| **User-based** | Specific user IDs | Internal testing, canary rollout        |

Flags are cached in `settings_cache` and checked via `is_feature_enabled(flag_name)` RPC.

---

## 11. Monitoring & Observability (Summary)

> Full details in `MONITORING_LOGGING.md`

Three pillars of observability:

1. **Logging** — Structured JSON logs via ILogger; all lines include `traceId`, `tenantId`, `userId`
2. **Metrics** — IMetrics port (timing, counters, gauges) → Datadog/Prometheus in production
3. **Tracing** — ITracer port with correlation IDs (X-Request-ID) threading through every request, event, and job

---

## 12. Technology Decision Summary

| Decision     | Choice                    | Rationale                                |
| ------------ | ------------------------- | ---------------------------------------- |
| Monorepo     | Turborepo                 | Shared packages, fast incremental builds |
| Framework    | Next.js 15                | App Router, RSC, edge-ready              |
| Database     | Supabase / PostgreSQL 17  | RLS, realtime, RPCs, managed             |
| State        | React Query + Zustand     | Server state separate from UI state      |
| Validation   | Zod                       | Runtime + compile-time type safety       |
| Architecture | Clean Architecture        | Testable, swappable, dependency-inverted |
| Async        | Domain Events + Job Queue | Decoupled, scalable side-effects         |
| Testing      | Vitest + Playwright       | Fast unit + reliable E2E                 |
