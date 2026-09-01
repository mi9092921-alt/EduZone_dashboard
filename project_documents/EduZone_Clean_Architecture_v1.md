# EduZone — Clean Architecture Specification

> **Version:** 1.0 | **Date:** 2026-03-17 | **Status:** APPROVED  
> **Stack:** Next.js 15 · TypeScript 5 · Supabase · MUI v5 · React Query v5 · Zustand · Zod  
> **Principles:** Clean Architecture (Robert C. Martin) · Ports & Adapters (Alistair Cockburn) · SOLID · DDD Tactical Patterns

---

## 1. Architecture Philosophy

The EduZone Admin Dashboard follows **Clean Architecture** — a software design philosophy where business rules are isolated from frameworks, databases, and UI. The goal is a codebase that is **testable**, **framework-independent**, and **adaptable** to change.

### 1.1 Core Rules

| #   | Rule                                                                                                   | Enforcement                                                |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | **Dependency Rule** — outer layers depend on inner; never the reverse                                  | ESLint `import/no-restricted-paths` + `dependency-cruiser` |
| 2   | **Framework Isolation** — domain/application layers never import React, Next.js, MUI, or Supabase      | TypeScript path alias restrictions                         |
| 3   | **Dependency Inversion** — application depends on port interfaces (`I*`), not concrete implementations | Constructor/parameter injection                            |
| 4   | **Single Responsibility** — each module has one reason to change                                       | Code review checklist                                      |
| 5   | **Interface Segregation** — ports are small, role-specific interfaces                                  | Max 5–7 methods per port                                   |

### 1.2 Dependency Direction

```
                    ┌─────────────────────────────────────┐
                    │            DOMAIN LAYER              │
                    │   Types · Schemas · Events · Rules   │
                    │        ⟵ ZERO dependencies ⟶        │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │         APPLICATION LAYER            │
                    │   Use Cases · Ports · Event Handlers │
                    │      depends on: Domain only         │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
┌─────────▼──────────┐  ┌─────────▼──────────┐  ┌─────────▼──────────┐
│  INFRASTRUCTURE     │  │   ADAPTERS          │  │   FEATURES          │
│  Supabase repos     │  │   React Query hooks │  │   Page components   │
│  RPC client         │  │   Form adapters     │  │   Feature slices    │
│  Event bus impl     │  │   Zustand stores    │  │   Routing           │
│  depends on:        │  │   depends on:       │  │   depends on:       │
│  Domain, Application│  │  Domain, Application│  │  Domain, Adapters   │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

---

## 2. Layer Specifications

### 2.1 Domain Layer — `src/domain/`

> **Purpose:** Pure business logic. Zero external dependencies. Testable without any framework.

```
src/domain/
├── types/                    # Core business types
│   ├── user.types.ts         # User, AuthUser, AccountStatus
│   ├── course.types.ts       # Course, Section, Lesson
│   ├── tenant.types.ts       # Tenant, Region
│   ├── enrollment.types.ts   # Enrollment, EnrollStatus
│   ├── warning.types.ts      # Warning, WarningSeverity
│   ├── session.types.ts      # Session, Device
│   ├── settings.types.ts     # Setting, FeatureFlag
│   └── common.types.ts       # PaginatedResult<T>, SortDirection
├── schemas/                  # Zod validation schemas
│   ├── user.schema.ts        # loginSchema, suspendUserSchema, banUserSchema
│   ├── course.schema.ts      # createCourseSchema, publishCourseSchema
│   ├── warning.schema.ts     # issueWarningSchema
│   └── settings.schema.ts    # setSettingSchema, maintenanceModeSchema
├── events/                   # Domain event definitions
│   ├── registry.ts           # Central event name registry
│   ├── user.events.ts        # UserSuspended, UserBanned, UserLocked
│   ├── course.events.ts      # CoursePublished, CourseArchived
│   └── base.ts               # DomainEvent<T> base type
├── services/                 # Pure domain logic (no I/O)
│   ├── PermissionService.ts  # canActOn(), hasPermission() — pure functions
│   └── TenantService.ts      # isWithinQuota(), validateSlug()
├── errors/                   # Business error definitions
│   ├── AppError.ts           # Base AppError class
│   ├── codes.ts              # RpcErrorCode union type
│   └── parseRpcError.ts      # Raw → typed error mapper
└── constants/                # Immutable business constants
    ├── permissions.ts        # PermissionName union + matrix
    └── limits.ts             # MAX_BULK_SIZE, MAX_DEVICES, etc.
```

**Rules:**

- ❌ No imports from `react`, `next`, `@supabase/*`, `@mui/*`, `@tanstack/*`
- ❌ No `async` functions (no I/O)
- ❌ No `console.log` (use `ILogger` port in application layer)
- ✅ Only pure functions and type definitions
- ✅ 100% unit test coverage required

---

### 2.2 Application Layer — `src/application/`

> **Purpose:** Orchestrate business operations via use cases. Define ports (interfaces) that infrastructure must implement.

```
src/application/
├── ports/                      # Interface contracts (Dependency Inversion)
│   ├── IUserRepo.ts            # listUsers, suspendUser, getUserById, etc.
│   ├── ICourseRepo.ts          # listCourses, createCourse, publishCourse
│   ├── IEnrollmentRepo.ts      # enrollStudent, revokeEnrollment
│   ├── ISettingsRepo.ts        # getSetting, setSetting
│   ├── ISessionRepo.ts         # terminateSessions, getActiveSessions
│   ├── IDeviceRepo.ts          # bindDevice, resetDevices
│   ├── IWarningRepo.ts         # issueWarning, listWarnings
│   ├── IJobQueue.ts            # enqueue, dequeue, getJobStatus
│   ├── IEventBus.ts            # publish, subscribe
│   ├── ILogger.ts              # info, warn, error, debug
│   ├── ITracer.ts              # startSpan, endSpan
│   └── IMetrics.ts             # timing, counter, gauge
├── use-cases/                  # Business operations
│   ├── users/
│   │   ├── listUsers.ts        # Paginated user list with filters
│   │   ├── getUserById.ts      # Single user with relations
│   │   ├── suspendUser.ts      # Suspend + emit event + log
│   │   ├── lockUser.ts         # Lock + terminate sessions
│   │   ├── banUser.ts          # Ban + terminate sessions
│   │   ├── unlockUser.ts       # Unlock account
│   │   └── terminateSessions.ts
│   ├── courses/
│   │   ├── listCourses.ts
│   │   ├── createCourse.ts
│   │   ├── publishCourse.ts
│   │   └── archiveCourse.ts
│   ├── enrollments/
│   │   ├── enrollStudent.ts
│   │   └── revokeEnrollment.ts
│   ├── auth/
│   │   ├── checkDashboardAccess.ts
│   │   └── handleTokenMismatch.ts
│   └── settings/
│       ├── getSetting.ts
│       ├── setSetting.ts
│       └── toggleMaintenanceMode.ts
└── events/
    └── handlers/               # Side-effect handlers (async)
        ├── onUserSuspended.ts  # → queue email + revoke sessions
        ├── onUserBanned.ts     # → queue notification + audit
        └── onCoursePublished.ts
```

**Use Case Signature Pattern:**

```typescript
// Every use case is a pure function with injected dependencies
export async function suspendUser(
  repo: IUserRepo,
  eventBus: IEventBus,
  logger: ILogger,
  tracer: ITracer,
  actorId: string,
  tenantId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const span = tracer.startSpan('suspendUser');
  try {
    await repo.suspendUser(userId, reason);
    await eventBus.publish(
      createUserSuspendedEvent(actorId, tenantId, span.traceId, userId, reason),
    );
    logger.info('User suspended', { userId, reason, traceId: span.traceId });
    span.end('ok');
  } catch (raw) {
    const err = parseRpcError(raw);
    logger.error('suspendUser failed', err);
    span.end('error', err);
    throw err;
  }
}
```

**Rules:**

- ❌ No imports from infrastructure, adapters, or features
- ❌ No direct Supabase calls — only port interfaces
- ❌ No React imports
- ✅ 90% unit test coverage required
- ✅ All dependencies injected via parameters

---

### 2.3 Infrastructure Layer — `src/infrastructure/`

> **Purpose:** Concrete implementations of ports. This is where Supabase, HTTP, and external services live.

```
src/infrastructure/
├── repos/                        # Port implementations
│   ├── SupabaseUserRepo.ts       # implements IUserRepo
│   ├── SupabaseCourseRepo.ts     # implements ICourseRepo
│   ├── SupabaseEnrollmentRepo.ts # implements IEnrollmentRepo
│   ├── SupabaseSettingsRepo.ts   # implements ISettingsRepo
│   ├── SupabaseSessionRepo.ts   # implements ISessionRepo
│   ├── SupabaseDeviceRepo.ts    # implements IDeviceRepo
│   ├── SupabaseWarningRepo.ts   # implements IWarningRepo
│   └── SupabaseJobQueue.ts      # implements IJobQueue
├── rpc/
│   ├── client.ts                 # Centralised RPC wrapper (retry + metrics + x-request-id)
│   ├── errorHandler.ts           # parseRpcError, isSessionInvalidated
│   └── globalQueryClient.ts      # React Query QueryClient + global onError
├── supabase/
│   ├── client.ts                 # createBrowserClient (singleton)
│   ├── server.ts                 # createServerClient (SSR)
│   └── middleware.ts             # Session refresh middleware
├── event-bus/
│   └── InMemoryEventBus.ts       # IEventBus implementation
├── observability/
│   ├── ConsoleLogger.ts          # ILogger → console (dev)
│   ├── SentryLogger.ts           # ILogger → Sentry (prod)
│   ├── NoopTracer.ts             # ITracer → noop (dev)
│   └── NoopMetrics.ts            # IMetrics → noop (dev)
└── http/
    └── retry.ts                  # Exponential backoff with jitter
```

**Rules:**

- ✅ Each file implements exactly one port interface
- ✅ 80% test coverage required
- ✅ All Supabase-specific code is confined here
- ❌ Never imported directly by features — only via container.ts

---

### 2.4 Contracts Layer — `src/contracts/`

> **Purpose:** Versioned API schemas that freeze the interface between client and server. Prevents breaking changes.

```
src/contracts/
├── rpc/
│   ├── v1/                     # Frozen — NEVER modify
│   │   ├── checkDashboardAccess.ts  # Request/Response types for v1
│   │   └── controlUser.ts
│   └── v2/                     # Active development
│       ├── checkDashboardAccess.ts
│       └── controlUser.ts
└── common/
    ├── pagination.ts           # PaginationRequest, PaginationResponse
    ├── idempotency.ts          # IdempotencyKey, IdempotencyResult
    └── envelope.ts             # StandardResponse<T>, ErrorEnvelope
```

---

### 2.5 Adapters Layer — `src/adapters/`

> **Purpose:** Bridge between application layer and React/UI. React Query hooks, form adapters, and Zustand stores.

```
src/adapters/
├── queries/                      # React Query hooks (read)
│   ├── users.queries.ts          # useListUsers, useUserById, useUserDevices
│   ├── courses.queries.ts        # useListCourses, useCourseById
│   ├── enrollments.queries.ts    # useEnrollments
│   ├── settings.queries.ts       # useSettings, useFeatureFlags
│   ├── jobs.queries.ts           # useJobStatus
│   └── keys.ts                   # queryKeys factory
├── mutations/                    # React Query hooks (write)
│   ├── users.mutations.ts        # useSuspendUser, useLockUser, useBanUser
│   ├── courses.mutations.ts      # useCreateCourse, usePublishCourse
│   ├── enrollments.mutations.ts  # useEnrollStudent, useRevokeEnrollment
│   ├── settings.mutations.ts     # useSetSetting
│   └── warnings.mutations.ts    # useIssueWarning
├── forms/                        # React Hook Form + Zod adapters
│   ├── useSuspendUserForm.ts
│   ├── useBanUserForm.ts
│   ├── useIssueWarningForm.ts
│   └── useCreateCourseForm.ts
├── stores/                       # Zustand (UI state only)
│   ├── auth.store.ts             # AuthUser, tokenVersion, logout
│   ├── ui.store.ts               # sidebar, modals, filters
│   └── realtime.store.ts         # Alerts, unread count
└── hooks/                        # Shared adapter hooks
    ├── usePermission.ts          # Permission check hook
    ├── useCheckDashboardAccess.ts # Polls check_dashboard_access every 5min
    └── useUserRealtime.ts        # Realtime subscription hook
```

**Rules:**

- ✅ Adapters call use cases via the DI container
- ✅ Hooks encapsulate all React Query / Zustand logic
- ❌ No direct Supabase imports — use cases and ports only
- ❌ No business logic — only wiring

---

### 2.6 Features Layer — `src/features/`

> **Purpose:** UI components grouped by domain feature. Each feature is a self-contained slice.

```
src/features/
├── users/
│   ├── components/
│   │   ├── UsersPage.tsx           # Main page component
│   │   ├── UserTable.tsx           # DataGrid with server-side pagination
│   │   ├── UserFilters.tsx         # Filter bar (status, role, tenant, etc.)
│   │   ├── UserProfileDrawer.tsx   # Right-side slide-in (5 tabs)
│   │   ├── UserRowActions.tsx      # Kebab menu per row
│   │   ├── BulkActionBar.tsx       # Floating bottom bar for batch ops
│   │   ├── LockUserDialog.tsx
│   │   ├── SuspendUserDialog.tsx
│   │   ├── BanUserDialog.tsx
│   │   └── IssueWarningDialog.tsx
│   ├── types/
│   │   └── userTable.types.ts      # Feature-local types
│   └── index.ts                    # Public API
├── courses/
│   ├── components/
│   │   ├── CoursesPage.tsx
│   │   ├── CourseEditor.tsx
│   │   ├── SectionAccordion.tsx
│   │   └── EnrollmentDialog.tsx
│   └── index.ts
├── auth/
│   ├── components/
│   │   ├── LoginPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   └── MaintenanceBanner.tsx
│   └── index.ts
├── dashboard/
│   ├── components/
│   │   ├── DashboardPage.tsx
│   │   ├── KpiCards.tsx
│   │   ├── ActivityHeatmap.tsx
│   │   └── SystemHealthBar.tsx
│   └── index.ts
├── settings/
│   ├── components/
│   │   ├── SettingsPage.tsx
│   │   ├── MaintenanceWizard.tsx
│   │   └── FeatureFlagsPanel.tsx
│   └── index.ts
└── layout/
    ├── components/
    │   ├── AdminShell.tsx           # Sidebar + Topbar + Content
    │   ├── Sidebar.tsx
    │   ├── Topbar.tsx
    │   ├── RealtimeToast.tsx
    │   └── NetworkBanner.tsx
    └── index.ts
```

**Rules:**

- ✅ Features import from `domain`, `adapters`, and shared UI
- ❌ Never import from infrastructure directly
- ❌ Never import from other features (use shared adapters)
- ✅ Each feature has an `index.ts` public API

---

## 3. Dependency Injection Container

> **Purpose:** Wire all layers together in a single place. The container is the only file that knows about all implementations.

```
src/container.ts
```

```typescript
import { SupabaseUserRepo } from '@/infrastructure/repos/SupabaseUserRepo';
import { SupabaseCourseRepo } from '@/infrastructure/repos/SupabaseCourseRepo';
import { InMemoryEventBus } from '@/infrastructure/event-bus/InMemoryEventBus';
import { ConsoleLogger } from '@/infrastructure/observability/ConsoleLogger';
import { NoopTracer } from '@/infrastructure/observability/NoopTracer';
import { NoopMetrics } from '@/infrastructure/observability/NoopMetrics';
import { createBrowserClient } from '@/infrastructure/supabase/client';
import type { IUserRepo } from '@/application/ports/IUserRepo';
import type { IEventBus } from '@/application/ports/IEventBus';

const supabase = createBrowserClient();

export const container = {
  // Repos
  userRepo: new SupabaseUserRepo(supabase) as IUserRepo,
  courseRepo: new SupabaseCourseRepo(supabase) as ICourseRepo,
  enrollmentRepo: new SupabaseEnrollmentRepo(supabase) as IEnrollmentRepo,
  settingsRepo: new SupabaseSettingsRepo(supabase) as ISettingsRepo,
  sessionRepo: new SupabaseSessionRepo(supabase) as ISessionRepo,
  warningRepo: new SupabaseWarningRepo(supabase) as IWarningRepo,

  // Services
  eventBus: new InMemoryEventBus() as IEventBus,
  logger: new ConsoleLogger() as ILogger,
  tracer: new NoopTracer() as ITracer,
  metrics: new NoopMetrics() as IMetrics,

  // Context (set after auth)
  actorId: '' as string,
  tenantId: '' as string,
};
```

---

## 4. Data Flow — Request Lifecycle

```
 ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────┐
 │ Feature  │───▶│ Adapter  │───▶│ Application │───▶│Infrastructure│───▶│ Supabase │
 │ (React)  │    │ (Hook)   │    │ (Use Case)  │    │ (Repo)       │    │ (RPC)    │
 └──────────┘    └──────────┘    └─────────────┘    └──────────────┘    └──────────┘
   UI Click   →  useMutation  →  suspendUser()  →  SupabaseUserRepo →  .rpc(...)
                       ↓                  ↓
                  optimistic         eventBus
                  cache update       .publish()
                       ↓                  ↓
                  React Query        onUserSuspended
                  re-render          → queue email
                                     → revoke sessions
```

### 4.1 Read Flow (Query)

```
UsersPage → useListUsers() → listUsers(repo, ..., filters) → repo.listUsers(filters) → supabase.rpc()
```

### 4.2 Write Flow (Mutation)

```
SuspendDialog → useSuspendUser() → suspendUser(repo, eventBus, ...) → repo.suspendUser() → supabase.rpc()
                                                                     → eventBus.publish(UserSuspended)
```

---

## 5. Port Interface Examples

### 5.1 IUserRepo

```typescript
export interface IUserRepo {
  listUsers(filters: UserFilters, page: number, pageSize: number): Promise<PaginatedResult<User>>;
  getUserById(id: string): Promise<User>;
  suspendUser(id: string, reason: string, hours: number): Promise<void>;
  lockUser(id: string, reason: string): Promise<void>;
  banUser(id: string, reason: string): Promise<void>;
  unlockUser(id: string): Promise<void>;
  terminateSessions(id: string, reason?: string): Promise<number>;
  resetDevices(id: string): Promise<void>;
}
```

### 5.2 IEventBus

```typescript
export interface IEventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(eventName: string, handler: (event: DomainEvent<T>) => Promise<void>): void;
}
```

### 5.3 ILogger

```typescript
export interface ILogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
```

---

## 6. Layer Dependency Matrix

| Layer              | Can Import                                                        | Cannot Import                                                    |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Domain**         | `@eduzone/types` only                                             | Application, Infrastructure, Adapters, Features, React, Supabase |
| **Application**    | Domain, Contracts                                                 | Infrastructure, Adapters, Features, React, Supabase              |
| **Infrastructure** | Domain, Application, Contracts, `@supabase/*`                     | Adapters, Features, React                                        |
| **Contracts**      | Domain                                                            | Everything else                                                  |
| **Adapters**       | Domain, Application, Contracts, `react`, `@tanstack/*`, `zustand` | Infrastructure, Features                                         |
| **Features**       | Domain, Contracts, Adapters, `react`, `@mui/*`                    | Infrastructure, Application (direct), other Features             |

### 6.1 ESLint Enforcement

```json
{
  "rules": {
    "import/no-restricted-paths": [
      "error",
      {
        "zones": [
          { "target": "./src/domain", "from": "./src/application" },
          { "target": "./src/domain", "from": "./src/infrastructure" },
          { "target": "./src/domain", "from": "./src/adapters" },
          { "target": "./src/domain", "from": "./src/features" },
          { "target": "./src/application", "from": "./src/infrastructure" },
          { "target": "./src/application", "from": "./src/adapters" },
          { "target": "./src/application", "from": "./src/features" },
          { "target": "./src/adapters", "from": "./src/infrastructure" },
          { "target": "./src/features", "from": "./src/infrastructure" }
        ]
      }
    ]
  }
}
```

---

## 7. Testing Strategy per Layer

| Layer              | Tool                           | Mock Strategy                                   | Coverage       |
| ------------------ | ------------------------------ | ----------------------------------------------- | -------------- |
| **Domain**         | Vitest                         | None needed (pure functions)                    | 100%           |
| **Application**    | Vitest                         | Mock all ports (`IUserRepo`, `IEventBus`, etc.) | 90%            |
| **Infrastructure** | Vitest                         | Mock Supabase client                            | 80%            |
| **Adapters**       | Vitest + React Testing Library | Mock use cases via container                    | 80%            |
| **Features**       | Vitest + RTL                   | Mock adapter hooks                              | 70%            |
| **E2E**            | Playwright                     | Real Supabase (test project)                    | Critical paths |

---

## 8. State Management Architecture

```
┌──────────────────────────────────────────────────┐
│                    STATE MAP                       │
├──────────────────┬───────────────────────────────┤
│ Server State     │ React Query                    │
│ (users, courses, │ staleTime: 30s                │
│  settings, jobs) │ gcTime: 5min                  │
│                  │ Global onError → error handler │
├──────────────────┼───────────────────────────────┤
│ Auth State       │ Zustand (auth.store)           │
│ (user, role,     │ NOT persisted to storage       │
│  tokenVersion)   │ Hydrated from Supabase Auth    │
├──────────────────┼───────────────────────────────┤
│ UI State         │ Zustand (ui.store)             │
│ (sidebar, modals,│ Filters synced to URL via nuqs │
│  selected rows)  │                               │
├──────────────────┼───────────────────────────────┤
│ Realtime State   │ Zustand (realtime.store)       │
│ (alerts, unread) │ Fed by Supabase Realtime       │
├──────────────────┼───────────────────────────────┤
│ Form State       │ React Hook Form + Zod          │
│                  │ zodResolver for validation     │
└──────────────────┴───────────────────────────────┘
```

**Golden Rule:** Never put server data in Zustand. Never put UI state in React Query.

---

## 9. Directory Summary — Final Structure

```
apps/admin/src/
├── domain/           →  Pure business logic (types, schemas, events, services, errors)
├── application/      →  Use cases + port interfaces + event handlers
├── infrastructure/   →  Supabase repos, RPC client, event bus, observability
├── contracts/        →  Versioned API schemas (v1 frozen, v2 active)
├── adapters/         →  React Query hooks, Zustand stores, form adapters
├── features/         →  UI components grouped by domain (users, courses, auth, etc.)
├── container.ts      →  DI wiring (single file that knows all implementations)
├── app/              →  Next.js App Router pages (thin — delegate to features)
└── lib/              →  Framework utilities (env.ts, middleware)
```

---

## 10. Migration Path — From Simple to Clean

> For new features, follow this order:

1. **Define types** in `domain/types/`
2. **Create Zod schemas** in `domain/schemas/`
3. **Define port interface** in `application/ports/`
4. **Write use case** in `application/use-cases/`
5. **Implement repo** in `infrastructure/repos/`
6. **Wire in container** in `container.ts`
7. **Create adapter hooks** in `adapters/queries/` or `adapters/mutations/`
8. **Build feature UI** in `features/*/components/`

This ensures the dependency rule is never violated — you build from inside out.
