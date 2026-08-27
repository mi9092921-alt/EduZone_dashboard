# EduZone — RFC & Architectural Decision Log

> **Version:** 1.0 | **Date:** 2026-03-11  
> **Purpose:** Document major engineering decisions, their rationale, and the alternatives considered.  
> **Format:** Each RFC is immutable once status is ACCEPTED or REJECTED.

---

## RFC Index

| RFC | Title | Status | Date |
|-----|-------|--------|------|
| [RFC-001](#rfc-001) | Clean Architecture as foundational pattern | ACCEPTED | 2026-03-08 |
| [RFC-002](#rfc-002) | Supabase as backend (vs custom API server) | ACCEPTED | 2026-03-08 |
| [RFC-003](#rfc-003) | Turborepo monorepo structure | ACCEPTED | 2026-03-08 |
| [RFC-004](#rfc-004) | Domain Events for async side-effects | ACCEPTED | 2026-03-11 |
| [RFC-005](#rfc-005) | Contract versioning (v1/v2 directory strategy) | ACCEPTED | 2026-03-11 |
| [RFC-006](#rfc-006) | IJobQueue abstraction over direct queue calls | ACCEPTED | 2026-03-11 |
| [RFC-007](#rfc-007) | Idempotency keys on all mutations | ACCEPTED | 2026-03-11 |
| [RFC-008](#rfc-008) | JWT stored in memory (not localStorage) | ACCEPTED | 2026-03-08 |
| [RFC-009](#rfc-009) | React Query as server state (vs Redux) | ACCEPTED | 2026-03-08 |
| [RFC-010](#rfc-010) | Materialised views for analytics (vs live queries) | ACCEPTED | 2026-03-08 |
| [RFC-011](#rfc-011) | MUI v5 + Tailwind hybrid UI stack | ACCEPTED | 2026-03-08 |
| [RFC-012](#rfc-012) | Vitest + Playwright (vs Jest + Cypress) | ACCEPTED | 2026-03-08 |

---

## RFC-001

### Clean Architecture as Foundational Pattern

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Lead Architect

**Decision:**  
Adopt Clean Architecture (Ports & Adapters / Hexagonal) as the structural pattern for the admin app codebase, with strict layer dependency enforcement via ESLint + dependency-cruiser.

**Context:**  
The admin dashboard will grow from a simple CRUD app to a complex multi-tenant control plane with 10+ feature domains. Without architectural discipline, the codebase becomes difficult to test, change, and reason about.

**Rationale:**
- Domain logic stays pure and testable (no Supabase imports in business logic)
- Infrastructure is swappable (e.g. replace InMemoryEventBus with Redis without touching use cases)
- Feature teams work in isolated slices with enforced boundaries
- Aligns with FAANG-grade quality bar for maintainability

**Alternatives Considered:**
- **Feature-folder with loose coupling** — Simpler, but no enforcement. Team discipline fades over time.
- **Domain-Driven Design (full DDD)** — Too heavy for current team size; Clean Architecture gives 80% of the benefit at 20% of the complexity.

**Consequences:**
- Higher initial setup cost (container, ports, etc.)
- ESLint violations fail CI — engineers must learn layer rules
- Significantly better testability, maintainability long-term

---

## RFC-002

### Supabase as Backend (vs Custom API Server)

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Engineering Lead

**Decision:**  
Use Supabase (managed PostgreSQL + Auth + Edge Functions + Realtime) as the complete backend instead of building a custom Node.js/Go API server.

**Context:**  
Team is 4 engineers. Time-to-market pressure exists. The backend needs: auth, database, file storage, realtime, edge compute.

**Rationale:**
- Eliminates entire infrastructure layer (no server management, scaling, auth implementation)
- RLS at database level provides stronger security than application-level checks
- Supabase Edge Functions (Deno) handle the cases RLS can't (service_role ops, bulk processing)
- Built-in auth with JWT + MFA + session management
- 3x faster to ship with a small team

**Alternatives Considered:**
- **NestJS + Prisma + PostgreSQL** — Full control, but 2–3x more infrastructure to build and maintain
- **Firebase** — NoSQL, weaker typing, no SQL, harder to enforce complex RLS
- **Hasura + GraphQL** — GraphQL surface is larger than needed; RLS support exists but less mature

**Consequences:**
- Locked into Supabase for core infrastructure (mitigated by Clean Architecture ports)
- SQL knowledge required on team
- Cannot run on-premise (mitigated by Supabase self-hosting option if needed)

---

## RFC-003

### Turborepo Monorepo Structure

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Lead Architect

**Decision:**  
Use Turborepo with pnpm workspaces for a monorepo containing the admin app, shared UI package, shared types package, and shared config packages.

**Rationale:**
- Shared TypeScript types between frontend and Supabase-generated types
- Shared ESLint, TypeScript, Tailwind configs — single source of truth
- Turborepo's incremental caching makes CI fast even as codebase grows
- Natural home for future packages (mobile app, public site, etc.)

**Alternatives Considered:**
- **Separate repos** — Harder to keep types in sync; no shared tooling
- **Nx** — More opinionated, larger learning curve; Turborepo simpler for our use case

---

## RFC-004

### Domain Events for Async Side-Effects

**Date:** 2026-03-11 | **Status:** ACCEPTED | **Author:** Lead Architect

**Decision:**  
Use cases emit typed Domain Events via `IEventBus` instead of calling side-effects (email, audit, session revocation) directly.

**Context:**  
In v1.1, `suspendUser` directly called email service, audit logger, and session revocation. This coupled 4 concerns into one function, making it hard to test and hard to change.

**Rationale:**
- Use cases remain focused on the primary operation
- Side-effects can be added/changed without modifying use cases
- Async handlers don't block the primary response
- Handlers are independently testable

**Alternatives Considered:**
- **Direct calls in use case** — Simple but creates tight coupling and slows response times
- **Saga pattern** — Too complex for current scale; consider if distributed transactions are needed

---

## RFC-005

### Contract Versioning (v1/v2 Directory Strategy)

**Date:** 2026-03-11 | **Status:** ACCEPTED | **Author:** Lead Architect

**Decision:**  
RPC and Edge Function contracts are versioned by directory (`contracts/rpc/v1/`, `contracts/rpc/v2/`). Once published in `v1/`, a contract is frozen. Breaking changes go into `v2/`.

**Rationale:**
- Consumers (repos, UI hooks) can pin to a version
- Prevents accidental breaking changes in shared contracts
- Provides clear migration path when breaking changes are needed

**Rules:**
- ✅ Adding optional fields → same version
- ✅ New endpoints → same version (until breaking change needed)
- ❌ Removing or renaming fields → new version required
- ❌ Changing field types → new version required

---

## RFC-006

### IJobQueue Abstraction Over Direct Queue Calls

**Date:** 2026-03-11 | **Status:** ACCEPTED | **Author:** Lead Architect

**Decision:**  
All async job enqueueing goes through the `IJobQueue` port. Default implementation: `SupabaseJobQueue`. Port allows swapping to Redis, SQS, or Kafka with zero application code changes.

**Rationale:**
- Current scale: Supabase Queue is sufficient
- Future scale: Queue backend can be upgraded without touching business logic
- All job types are typed via `JobName` union — no magic strings in application code

---

## RFC-007

### Idempotency Keys on All Mutations

**Date:** 2026-03-11 | **Status:** ACCEPTED | **Author:** Security Lead

**Decision:**  
Every mutation (suspendUser, banUser, publishCourse, bulkAction, etc.) requires an idempotency key. Client generates a UUID v4 before the mutation call; server stores result for 24 hours.

**Context:**  
Admin dashboards are particularly prone to double-submissions: button double-clicks, slow network retries, and Edge Function timeout re-runs can all cause operations to execute twice.

**Consequences:**
- All Edge Functions must implement idempotency check (small overhead per request)
- Client hooks must generate and pass idempotency keys
- 24h storage overhead in idempotency store table

---

## RFC-008

### JWT Stored in Memory (Not localStorage)

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Security Lead

**Decision:**  
Access token (JWT) is stored in memory only. Refresh token is in an HttpOnly cookie managed by Supabase. No tokens in `localStorage` or `sessionStorage`.

**Rationale:**
- `localStorage` is accessible to any JavaScript on the page (XSS risk)
- In-memory token is wiped on tab close (limits exposure window)
- HttpOnly cookie cannot be read by JavaScript at all

**Consequences:**
- Token lost on page refresh → auto-refreshed via HttpOnly cookie (transparent to user)
- Slightly more complex auth state management

---

## RFC-009

### React Query as Server State (vs Redux)

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Frontend Lead

**Decision:**  
Use React Query v5 for all server/async state. Use Zustand only for UI state (filters, selected rows, modal open/closed). Redux not used.

**Rationale:**
- React Query eliminates 80% of boilerplate for data fetching, caching, invalidation
- Zustand is lightweight for the UI state that remains
- Redux adds significant complexity for problems React Query already solves
- Separation of server state vs UI state is architecturally cleaner

---

## RFC-010

### Materialised Views for Analytics (vs Live Queries)

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Data Lead

**Decision:**  
All analytics queries (`mv_user_stats`, `mv_course_stats`, `mv_daily_activity`) are served from materialised views, refreshed every 15 minutes (or on-demand for admins).

**Rationale:**
- Live aggregation queries on 100k+ user tables take 2–10 seconds
- Materialised views deliver sub-100ms reads from pre-computed data
- Analytics data does not need to be real-time; 15-minute staleness is acceptable

**Consequences:**
- Analytics data is stale by up to 15 minutes
- Must monitor view refresh success rate (alert on failure)
- Manual refresh available via admin action for urgent needs

---

## RFC-011

### MUI v5 + Tailwind Hybrid UI Stack

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** Frontend Lead

**Decision:**  
Use Material-UI v5 for complex data components (tables, dialogs, date pickers) and Tailwind CSS for layout, spacing, and custom styling.

**Rationale:**
- MUI's DataGrid is production-ready for large datasets with virtualisation
- MUI's component library covers 90% of admin UI needs out of the box
- Tailwind for fine-grained layout control without fighting MUI's sx prop everywhere

**Consequences:**
- Two styling systems to learn and maintain
- MUI's theme tokens must align with design tokens document

---

## RFC-012

### Vitest + Playwright (vs Jest + Cypress)

**Date:** 2026-03-08 | **Status:** ACCEPTED | **Author:** QA Lead

**Decision:**  
Use Vitest for unit/integration tests and Playwright for E2E tests.

**Rationale:**
- Vitest: 3–5x faster than Jest for TypeScript projects (native ESM, no transform overhead)
- Vitest: API-compatible with Jest (minimal migration cost)
- Playwright: more reliable than Cypress for complex multi-tab and async flows
- Playwright: better support for multiple browsers in CI

---

## Adding a New RFC

To propose a new architectural decision:

1. Copy the RFC template below
2. Fill in all sections
3. Submit as a PR to `docs/RFC_DECISION_LOG.md`
4. Discuss in PR comments; get at least 2 senior engineer sign-offs
5. Merge with status: ACCEPTED or REJECTED

### RFC Template

```markdown
## RFC-XXX

### Title

**Date:** | **Status:** PROPOSED | **Author:**

**Decision:**
[One sentence]

**Context:**
[Why is this decision needed now?]

**Rationale:**
[Why this option? What problem does it solve?]

**Alternatives Considered:**
- **Option A** — Pros/cons
- **Option B** — Pros/cons

**Consequences:**
[What are the trade-offs and impacts?]
```
