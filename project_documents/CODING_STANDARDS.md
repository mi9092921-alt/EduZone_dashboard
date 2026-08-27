# EduZone — Coding Standards & Conventions

> **Version:** 1.0 | **Date:** 2026-03-11 | **Applies To:** All engineers  
> **Enforcement:** ESLint + TypeScript + dependency-cruiser (CI gate)

---

## 1. General Principles

1. **Clarity over cleverness** — Write for the next engineer, not to impress
2. **Explicit over implicit** — Prefer obvious, readable code
3. **Types as documentation** — TypeScript types should explain intent
4. **Small functions** — Single responsibility; max ~40 lines per function
5. **Fail loudly** — Prefer throwing typed errors over returning `null | undefined`
6. **No dead code** — Delete commented-out code; use git history instead

---

## 2. TypeScript Standards

### 2.1 Configuration

All packages use `strict: true`. Additional enforced settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 2.2 Type Rules

```typescript
// ✅ DO: Use explicit return types on exported functions
export async function suspendUser(userId: string): Promise<void> { ... }

// ❌ DON'T: Rely on inferred return types for public APIs
export async function suspendUser(userId: string) { ... }

// ✅ DO: Use discriminated unions for result types
type Result<T> = { ok: true; data: T } | { ok: false; error: RpcError };

// ❌ DON'T: Use any or unknown without narrowing
const data: any = response; // NEVER

// ✅ DO: Use Zod for runtime validation + infer types
const UserSchema = z.object({ id: z.string().uuid(), email: z.string().email() });
type User = z.infer<typeof UserSchema>;

// ✅ DO: Use const assertions for enums
const USER_STATUS = ['active', 'suspended', 'banned', 'locked'] as const;
type UserStatus = typeof USER_STATUS[number];

// ❌ DON'T: Use TypeScript enum
enum UserStatus { Active, Suspended } // avoid
```

### 2.3 Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Types / Interfaces | PascalCase | `UserFilters`, `IUserRepo` |
| Variables / Functions | camelCase | `suspendUser`, `userId` |
| Constants (module-level) | SCREAMING_SNAKE_CASE | `MAX_BULK_SIZE` |
| Files (components) | PascalCase | `UserTable.tsx` |
| Files (non-components) | camelCase | `suspendUser.ts`, `useListUsers.ts` |
| CSS classes | kebab-case | `user-table__action-cell` |
| Ports (interfaces) | `I` prefix | `IUserRepo`, `IEventBus` |
| Hooks | `use` prefix | `useListUsers`, `useSuspendUser` |
| Event handlers | `on` prefix | `onUserSuspended`, `onClick` |

---

## 3. File & Folder Conventions

### 3.1 Feature Slice Structure

Each feature follows this structure:

```
features/users/
├── components/
│   ├── UserTable.tsx
│   ├── UserFilters.tsx
│   └── SuspendDialog.tsx
├── hooks/
│   ├── useListUsers.ts      # Data fetching
│   └── useSuspendUser.ts    # Mutations
├── stores/
│   └── userFiltersStore.ts  # Zustand slice (UI state only)
├── types/
│   └── userTable.types.ts   # Feature-local types
└── index.ts                 # Public exports only
```

### 3.2 Import Order (enforced by ESLint)

```typescript
// 1. Node built-ins
import path from 'path';

// 2. External packages
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Internal packages (@eduzone/*)
import type { User } from '@eduzone/types';

// 4. Application layer (@/)
import type { IUserRepo } from '@/application/ports/IUserRepo';
import { suspendUser } from '@/application/use-cases/users/suspendUser';

// 5. Feature-local imports (relative)
import { UserTable } from './components/UserTable';
```

### 3.3 Export Rules

```typescript
// ✅ Feature public API via index.ts — only export what others need
export { UserManagementPage } from './components/UserManagementPage';
export type { UserFilters } from './types/userTable.types';

// ❌ Never import from deep paths across features
import { SuspendDialog } from '../users/components/SuspendDialog'; // VIOLATION
// Use the feature's index.ts instead
```

---

## 4. React Patterns

### 4.1 Component Standards

```typescript
// ✅ Functional components with explicit prop types
interface UserTableProps {
  tenantId: string;
  onUserSelect: (userId: string) => void;
}

export function UserTable({ tenantId, onUserSelect }: UserTableProps) {
  // ...
}

// ❌ Default exports for components (except page components required by Next.js)
export default function UserTable() {} // avoid in shared components

// ✅ Named exports for everything except Next.js pages/layouts
export function UserTable() {}
```

### 4.2 Data Fetching (React Query)

```typescript
// ✅ Standard query hook pattern
export function useListUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => listUsers(container.userRepo, container.metrics, container.tracer, container.logger, filters),
    staleTime: 30_000,       // 30 seconds
    gcTime: 5 * 60_000,      // 5 minutes
  });
}

// ✅ Standard mutation hook pattern
export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      suspendUser(container.userRepo, container.eventBus, container.logger, container.tracer,
                  container.actorId, container.tenantId, userId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (error) => toast.error(parseRpcError(error).message),
  });
}
```

### 4.3 State Management Rules

| State Type | Tool |
|-----------|------|
| Server/async data | React Query |
| UI-only transient state | `useState` / `useReducer` |
| Cross-component UI state (e.g. filters, selected rows) | Zustand |
| Form state | React Hook Form + Zod |

**Rule:** Never put server data in Zustand. Never put UI state in React Query.

---

## 5. Use Case Patterns

### 5.1 Standard Use Case Structure

```typescript
// application/use-cases/users/suspendUser.ts

// ✅ Inject all dependencies via parameters (no module-level singletons)
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
    await eventBus.publish(createUserSuspendedEvent(actorId, tenantId, span.traceId, userId, reason));
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

**Rules for use cases:**
- No direct imports from infrastructure (only ports)
- No React imports
- No `console.log` (use ILogger)
- Always use tracer for observability
- Always parse errors with `parseRpcError`

---

## 6. Error Handling

### 6.1 Error Types

```typescript
// All domain errors extend AppError
export class AppError extends Error {
  constructor(
    public readonly code: RpcErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Parsing raw RPC errors
export function parseRpcError(raw: unknown): AppError {
  if (raw instanceof AppError) return raw;
  if (isPostgresError(raw)) {
    return new AppError(raw.code as RpcErrorCode, raw.message, raw.detail);
  }
  return new AppError('INTERNAL_ERROR', 'An unexpected error occurred');
}
```

### 6.2 Error Handling Rules

```typescript
// ✅ Always catch and re-throw typed errors in use cases
try {
  await repo.suspendUser(userId, reason);
} catch (raw) {
  throw parseRpcError(raw); // Never throw raw Supabase errors to UI
}

// ✅ Show user-friendly messages via React Query's onError
onError: (error) => {
  const appError = parseRpcError(error);
  toast.error(appError.message); // Localised, human-readable
}

// ❌ Never swallow errors silently
try {
  await something();
} catch {} // NEVER
```

---

## 7. Testing Standards

### 7.1 Coverage Requirements

| Layer | Minimum Coverage |
|-------|----------------|
| Domain services | 100% |
| Application use cases | 90% |
| Infrastructure repos | 80% |
| React hooks | 80% |
| Components | 70% (happy path + error state) |

### 7.2 Test File Location & Naming

```
src/
├── application/use-cases/users/
│   ├── suspendUser.ts
│   └── suspendUser.test.ts      # Co-located unit test
├── features/users/components/
│   ├── UserTable.tsx
│   └── UserTable.test.tsx
└── e2e/
    └── user-management.spec.ts  # Playwright E2E
```

### 7.3 Test Patterns

```typescript
// ✅ Use test doubles (not real Supabase) for unit tests
const mockRepo: IUserRepo = {
  listUsers: vi.fn().mockResolvedValue({ data: [mockUser], count: 1 }),
  suspendUser: vi.fn().mockResolvedValue(undefined),
  // ...
};

// ✅ Test domain services with pure input/output
describe('PermissionService', () => {
  it('admin cannot act on super_admin', () => {
    const svc = new PermissionService();
    expect(svc.canActOn('admin', 'super_admin', 'suspend')).toBe(false);
  });
});

// ✅ Test use cases with injected mocks
it('suspendUser publishes UserSuspendedEvent', async () => {
  await suspendUser(mockRepo, mockEventBus, mockLogger, mockTracer, 'actor-1', 'tenant-1', 'user-1', 'reason');
  expect(mockEventBus.publish).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'user.suspended' })
  );
});
```

---

## 8. Git Conventions

### 8.1 Branch Naming

```
feature/P2-USER-007-suspend-user
fix/P3-COURSE-002-enrollment-count-bug
refactor/clean-arch-rpc-client
docs/security-design-doc
```

### 8.2 Commit Messages (Conventional Commits)

```
feat(users): add bulk suspend endpoint
fix(auth): handle token_version mismatch in check_user_access
refactor(rpc): extract retry logic to shared withRetry utility
test(users): add unit tests for suspendUser use case
docs(security): document hash-chain audit trail
chore(deps): upgrade react-query to v5.28
```

### 8.3 Pull Request Rules

- **Title:** matches the main commit message format
- **Description:** must include: What, Why, How, Testing steps
- **Reviewers:** minimum 1 approval (2 for production-impacting changes)
- **CI must pass:** no exceptions for merging to `develop`, `staging`, or `main`
- **No `console.log`** left in production code
- **No TODO comments** without an associated GitHub issue number

---

## 9. Code Review Checklist

Reviewers must verify:

- [ ] Layer boundaries respected (no infrastructure in application layer, etc.)
- [ ] New tables have RLS policies
- [ ] New RPCs have permission checks
- [ ] Error handling uses `parseRpcError`
- [ ] Tests cover the main success + error paths
- [ ] No `any` types without explicit justification comment
- [ ] Sensitive data not logged (passwords, tokens, PII)
- [ ] New events registered in `application/events/registry.ts`
- [ ] Idempotency key used on all mutations
- [ ] Observability (metrics + tracer span) added to new use cases
