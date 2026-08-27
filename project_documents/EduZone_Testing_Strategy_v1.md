EduZone Testing Strategy v1.0  **|  INTERNAL**


**EduZone**

**Testing Strategy**

Admin Dashboard — Vitest + Cypress + Storybook + RLS Testing

*Version 1.0  |  2026-03-08*


|**Coverage Target**|**80% lines (unit + integration) — CI enforced**|
| :- | :- |
|**Unit Framework**|Vitest 1.x + React Testing Library|
|**E2E Framework**|Cypress 13.x|
|**Component Tests**|Storybook 8 + Chromatic visual diff|
|**DB / RLS**|Supabase local (Docker) with seed fixtures|
|**CI Gate**|Vitest + Cypress smoke in GitHub Actions — PR blocked if red|


# **1. Testing Strategy Overview**
## **1.1 Testing Pyramid**

|**Layer**|**Target %**|**Tool**|**What is Tested**|
| :-: | :-: | :-: | :-: |
|**Unit**|**60%**|*Vitest + RTL*|Pure functions, Zustand stores, Zod schemas, hooks, service wrappers|
|**Integration**|**25%**|*Vitest + MSW*|React Query hooks against mocked Supabase, form validation flows, PermissionGate logic|
|**Component**|**10%**|*Storybook*|Visual regression on all UI component states via Chromatic|
|**E2E / Critical**|**5%**|*Cypress 13*|13 critical user flows end-to-end against local Supabase|

## **1.2 CI Gate Policy**

|**Check**|**Threshold**|**Consequence if Fail**|
| :-: | :-: | :-: |
|**Vitest coverage — lines**|**≥ 80%**|PR blocked — must add tests before merge|
|**Vitest coverage — branches**|**≥ 75%**|PR blocked — critical for RLS-dependent paths|
|**Cypress smoke suite**|**0 failures**|PR blocked — all 13 flows must pass|
|**Chromatic visual diff**|**0 unreviewed**|PR blocked until designer approves or dismisses diff|
|**TypeScript compile**|**0 errors**|PR blocked — strict mode, no ts-ignore|
|**ESLint**|**0 errors**|PR blocked — warnings allowed for now, errors block|
|**gitleaks secret scan**|**0 secrets**|PR blocked — service\_role key in code = instant block|

**COVERAGE EXCEPTION:** Generated files (database.types.ts, theme.ts from Token Studio) are excluded from coverage via Vitest's coverage.exclude config. Third-party type declarations also excluded.


# **2. Supabase Mock Strategy**
**CRITICAL:** The browser Supabase client (anon key) is always mocked in unit/integration tests. Never connect to a real Supabase instance in Vitest. Only Cypress E2E tests use a real local Supabase.

## **2.1 MSW Handlers for RPC Calls**
Mock Service Worker intercepts all fetch() calls including Supabase's PostgREST and RPC endpoints at the network level.

// tests/mocks/handlers/rpc.handlers.ts

import { http, HttpResponse } from 'msw';

export const rpcHandlers = [

`  `// check\_user\_access — happy path

`  `http.post('\*/rest/v1/rpc/check\_user\_access', () =>

`    `HttpResponse.json({ allowed: true, role: 'admin', tenant\_id: TENANT\_ID })

`  `),

`  `// check\_user\_access — token\_version mismatch

`  `http.post('\*/rest/v1/rpc/check\_user\_access\_locked', () =>

`    `HttpResponse.json({ allowed: false, reason: 'account\_locked', message: 'Account locked.' })

`  `),

`  `// control\_user\_account

`  `http.post('\*/rest/v1/rpc/control\_user\_account', async ({ request }) => {

`    `const body = await request.json();

`    `if (body.p\_action === 'ban' && !body.p\_reason)

`      `return HttpResponse.json({ code: 'ADMIN\_ONLY', message: '...' }, { status: 403 });

`    `return HttpResponse.json({ status: body.p\_action === 'unlock' ? 'active' : body.p\_action+'ed', until: null });

`  `}),

`  `// Edge Function — bulk-action

`  `http.post('\*/functions/v1/bulk-action', async ({ request }) => {

`    `const body = await request.json();

`    `if (body.dry\_run) return HttpResponse.json({ estimated\_count: 12, job\_id: null, status: null });

`    `return HttpResponse.json({ job\_id: MOCK\_JOB\_ID, estimated\_count: 12, status: 'pending' });

`  `}),

];

## **2.2 MSW Setup in Vitest**
// tests/setup.ts (referenced in vitest.config.ts)

import { beforeAll, afterEach, afterAll } from 'vitest';

import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => server.resetHandlers());

afterAll(() => server.close());

**onUnhandledRequest: error:** This forces every test to explicitly mock all network calls. Any uncovered RPC call will fail the test immediately, preventing silent false-positives.

## **2.3 Supabase Client Mock**
For tests that need to inspect what was called (not just network responses), use the typed mock factory:

// tests/mocks/supabase.mock.ts

import { vi } from 'vitest';

export const mockRpc = vi.fn();

export const mockFrom = vi.fn();

vi.mock('@/lib/supabase/client', () => ({

`  `supabase: {

`    `rpc:   mockRpc,

`    `from:  mockFrom,

`    `auth:  { getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }) },

`    `channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),

`  `},

}));

## **2.4 RLS Testing in Cypress (Local Supabase)**
Cypress E2E tests run against supabase start (local Docker). RLS is fully enabled — tests exercise real policy enforcement.

// cypress/support/commands.ts

// Login as specific role using service\_role to insert a test JWT

Cypress.Commands.add('loginAs', (role: 'super\_admin'|'admin'|'teacher'|'student') => {

`  `const user = Cypress.env('TEST\_USERS')[role];

`  `cy.request({

`    `method: 'POST',

`    `url:    `${Cypress.env('SUPABASE\_URL')}/auth/v1/token?grant\_type=password`,

`    `headers: { apikey: Cypress.env('SUPABASE\_ANON\_KEY') },

`    `body:    { email: user.email, password: user.password },

`  `}).then(res => {

`    `window.localStorage.setItem('sb-auth-token', JSON.stringify(res.body));

`  `});

});

// Seed test data using service\_role (bypasses RLS)

Cypress.Commands.add('seedUser', (overrides = {}) => {

`  `cy.task('seedUser', overrides);  // runs in Node.js via cypress.config.ts task

});

**TEST ISOLATION:** Each Cypress spec that mutates data calls cy.task('resetDb') in beforeEach to restore the seed state. Never share mutable state between specs.


# **3. Unit Test Patterns**
## **3.1 Zustand Store Tests**
// apps/web/src/store/\_\_tests\_\_/auth.store.test.ts

import { describe, it, expect, beforeEach } from 'vitest';

import { useAuthStore } from '../auth.store';

import { act } from '@testing-library/react';

describe('AuthStore', () => {

`  `beforeEach(() => useAuthStore.getState().reset());

`  `it('sets user on login', () => {

`    `act(() => useAuthStore.getState().setUser(mockUser));

`    `expect(useAuthStore.getState().user?.id).toBe(mockUser.id);

`  `});

`  `it('triggers hard logout on account\_locked', async () => {

`    `const { handleAccessResult } = useAuthStore.getState();

`    `act(() => handleAccessResult({ allowed: false, reason: 'account\_locked' }));

`    `expect(useAuthStore.getState().user).toBeNull();

`    `expect(mockRouterPush).toHaveBeenCalledWith('/login?reason=session\_invalidated');

`  `});

});

## **3.2 Zod Schema Tests**
// apps/web/src/forms/schemas/\_\_tests\_\_/user-action.schema.test.ts

import { controlUserSchema } from '../user-action.schema';

describe('controlUserSchema', () => {

`  `it('requires reason for suspend', () => {

`    `const result = controlUserSchema.safeParse({ action: 'suspend' });

`    `expect(result.success).toBe(false);

`    `expect(result.error?.issues[0].path).toContain('reason');

`  `});

`  `it('requires suspend\_hours 1-720 for suspend action', () => {

`    `const bad = controlUserSchema.safeParse({ action:'suspend', reason:'test', suspend\_hours: 0 });

`    `expect(bad.success).toBe(false);

`    `const good = controlUserSchema.safeParse({ action:'suspend', reason:'test', suspend\_hours: 48 });

`    `expect(good.success).toBe(true);

`  `});

});

## **3.3 parseRpcError Tests**
import { parseRpcError } from '@eduzone/utils/parseRpcError';

describe('parseRpcError', () => {

`  `it.each([

`    `['ADMIN\_ONLY',         'Permission denied.'],

`    `['MAX\_DEVICES\_REACHED','Device limit reached.'],

`    `['RATE\_LIMITED',       'Too many attempts.'],

`    `['UNKNOWN\_CODE',       'Unexpected error.'],

`  `])('maps %s to readable message', (code, expected) => {

`    `const err = parseRpcError({ message: code });

`    `expect(err.message).toBe(expected);

`  `});

});

## **3.4 PermissionGate Tests**
import { render, screen } from '@testing-library/react';

import { PermissionGate } from '@/components/ui/PermissionGate';

import { useAuthStore } from '@/store/auth.store';

describe('PermissionGate', () => {

`  `it('renders children when permission is granted', () => {

`    `useAuthStore.setState({ permissions: ['users.write'] });

`    `render(<PermissionGate permission="users.write"><span>content</span></PermissionGate>);

`    `expect(screen.getByText('content')).toBeInTheDocument();

`  `});

`  `it('renders nothing when permission is denied', () => {

`    `useAuthStore.setState({ permissions: [] });

`    `render(<PermissionGate permission="users.delete"><span>secret</span></PermissionGate>);

`    `expect(screen.queryByText('secret')).not.toBeInTheDocument();

`  `});

`  `it('renders fallback when provided and permission denied', () => {

`    `useAuthStore.setState({ permissions: [] });

`    `render(

`      `<PermissionGate permission="settings.write" fallback={<span>no access</span>}>

`        `<span>settings</span>

`      `</PermissionGate>

`    `);

`    `expect(screen.getByText('no access')).toBeInTheDocument();

`  `});

});


# **4. Integration Test Patterns**
## **4.1 React Query Hooks with MSW**
// apps/web/src/queries/\_\_tests\_\_/useUsers.test.tsx

import { renderHook, waitFor } from '@testing-library/react';

import { useUsers } from '../useUsers';

import { createQueryWrapper } from '../../tests/utils/queryWrapper';

describe('useUsers', () => {

`  `it('fetches users list with filters', async () => {

`    `const { result } = renderHook(

`      `() => useUsers({ role: 'student', page: 1 }),

`      `{ wrapper: createQueryWrapper() }

`    `);

`    `await waitFor(() => expect(result.current.isSuccess).toBe(true));

`    `expect(result.current.data?.users).toHaveLength(2);

`  `});

`  `it('retries on 5xx', async () => {

`    `server.use(http.post('\*/rest/v1/rpc/get\_users', () =>

`      `HttpResponse.json({ error: 'DB\_ERROR' }, { status: 500 })));

`    `const { result } = renderHook(() => useUsers({}), { wrapper: createQueryWrapper() });

`    `await waitFor(() => expect(result.current.failureCount).toBe(3));

`  `});

});

## **4.2 Token-Version Mismatch Integration**
// tests/integration/token-version.test.tsx

describe('token\_version mismatch', () => {

`  `it('hard-logouts on account\_locked', async () => {

`    `// Override check\_user\_access to return locked

`    `server.use(http.post('\*/rest/v1/rpc/check\_user\_access', () =>

`      `HttpResponse.json({ allowed: false, reason: 'account\_locked' })

`    `));

`    `render(<AppShell />, { wrapper: AuthWrapper });

`    `// Simulate the 5-min poll firing

`    `act(() => vi.advanceTimersByTime(5 \* 60 \* 1000));

`    `await waitFor(() =>

`      `expect(mockRouter.push).toHaveBeenCalledWith('/login?reason=session\_invalidated')

`    `);

`  `});

`  `it('shows maintenance banner (no logout) on maintenance\_mode', async () => {

`    `server.use(http.post('\*/rest/v1/rpc/check\_user\_access', () =>

`      `HttpResponse.json({ allowed: false, reason: 'maintenance\_mode', ends\_at: '2026-12-01T00:00:00Z' })

`    `));

`    `render(<AppShell />, { wrapper: AuthWrapper });

`    `act(() => vi.advanceTimersByTime(5 \* 60 \* 1000));

`    `await waitFor(() => expect(screen.getByRole('banner', { name: /maintenance/i })).toBeVisible());

`    `expect(mockRouter.push).not.toHaveBeenCalled(); // must NOT logout

`  `});

});

## **4.3 Bulk Action Flow Integration**
// tests/integration/bulk-action.test.tsx

describe('BulkActionPanel', () => {

`  `it('shows estimated count on dry-run before submit', async () => {

`    `render(<BulkActionPanel action="bulk\_suspend" />, { wrapper });

`    `fireEvent.click(screen.getByRole('button', { name: /preview/i }));

`    `await waitFor(() =>

`      `expect(screen.getByText(/12 users will be affected/i)).toBeVisible()

`    `);

`  `});

`  `it('polls job status and shows progress bar', async () => {

`    `// First response: pending, second: processing 50/100, third: done

`    `let call = 0;

`    `server.use(http.get('\*/rest/v1/job\_queue', () => {

`      `call++;

`      `const states = [

`        `{ status: 'pending',    error\_msg: null },

`        `{ status: 'processing', error\_msg: JSON.stringify({ processed:50, total:100 }) },

`        `{ status: 'done',       error\_msg: JSON.stringify({ processed:100, total:100, failed\_ids:[] }) },

`      `];

`      `return HttpResponse.json(states[Math.min(call-1, 2)]);

`    `}));

`    `render(<BulkProgressPanel jobId={MOCK\_JOB\_ID} />, { wrapper });

`    `await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50'));

`    `await waitFor(() => expect(screen.getByText(/completed/i)).toBeVisible());

`  `});

});


# **5. Cypress E2E Test Flows**
13 critical flows — all must pass before any deployment to staging or production.

|**#**|**Spec File**|**Role**|**Flow**|**Assertions**|
| :-: | :-: | :-: | :-: | :-: |
|**01**|auth/login.cy.ts|*admin*|Login + redirect|JWT in localStorage; redirected to /dashboard; AdminShell visible|
|**02**|auth/token-version.cy.ts|*admin*|Account locked mid-session|Poll fires → hard logout → /login?reason=session\_invalidated|
|**03**|auth/maintenance.cy.ts|*admin*|Maintenance mode banner|Banner visible; user NOT logged out; countdown shows ends\_at|
|**04**|users/list.cy.ts|*admin*|Users DataGrid load|50 rows visible; filters work; pagination works|
|**05**|users/lock-unlock.cy.ts|*admin*|Lock + Unlock user|Chip changes to "Locked"; unlock restores "Active"; activity logged|
|**06**|users/ban.cy.ts|*super\_admin*|Ban user|Requires super\_admin role; ban dialog requires reason; chip="Banned"|
|**07**|users/bulk-suspend.cy.ts|*admin*|Bulk suspend 5 users|Dry-run count shown; confirm; job\_id returned; progress to 100%; status chips updated|
|**08**|courses/create-edit.cy.ts|*admin*|Create + edit course|Slug auto-generated; sections reorderable; save succeeds|
|**09**|courses/enrollment.cy.ts|*admin*|Enroll + revoke student|Student appears in enrolled list; revoke removes with reason|
|**10**|settings/maintenance-wizard.cy.ts|*super\_admin*|Enable maintenance mode|5-step wizard completes; app shows maintenance screen for teacher role|
|**11**|audit/hash-chain.cy.ts|*super\_admin*|Audit viewer + chain verify|Logs load; hash chain verify button returns valid; CSV export triggers download|
|**12**|teacher/my-courses.cy.ts|*teacher*|Teacher dashboard|Only own courses visible; student progress tab loads; warning issue works|
|**13**|permissions/gate.cy.ts|*teacher*|Permission enforcement|Settings page returns 403 for teacher; users.delete action absent from menu|

## **5.1 Cypress Configuration**
// cypress.config.ts

export default defineConfig({

`  `e2e: {

`    `baseUrl: 'http://localhost:3000',

`    `specPattern: 'cypress/e2e/\*\*/\*.cy.ts',

`    `viewportWidth: 1280,

`    `viewportHeight: 800,

`    `video:       true,

`    `screenshotOnRunFailure: true,

`    `experimentalRunAllSpecs: true,

`    `setupNodeEvents(on, config) {

`      `on('task', {

`        `seedUser:  (overrides) => db.seedUser(overrides),

`        `resetDb:   ()          => db.resetToFixtures(),

`        `deleteUser:(id)        => db.deleteUser(id),

`      `});

`    `},

`  `},

});

## **5.2 Cypress Test Data Strategy**
- All seed users are defined in cypress/fixtures/users.json with known passwords stored in Cypress.env (not committed).
- Each test role (super\_admin, admin, teacher, student) has exactly one dedicated test user. Never share users between specs.
- Mutable data (users created/banned/enrolled in tests) is reset via cy.task('resetDb') in beforeEach.
- Immutable reference data (tenants, system settings) is seeded once in supabase/seed.sql and never mutated in tests.

## **5.3 RTL / Arabic E2E**
- Add ?lang=ar query param to set Arabic locale in Cypress tests.
- Assert cy.get('html').should('have.attr', 'dir', 'rtl') on Arabic locale tests.
- Sidebar should appear on RIGHT — assert computed left > window.innerWidth / 2.


# **6. Storybook & Visual Regression**
## **6.1 Story Requirements**
Every component in components/ui/ and components/domain/ must have a story file covering all required states:

|**Component**|**Required Stories**|
| :-: | :-: |
|**UserStatusChip**|active, locked, suspended, banned — each as separate story|
|**ConfirmDialog**|default, danger variant, loading state, with detail text|
|**PermissionGate**|granted (shows children), denied (shows nothing), denied with fallback|
|**BulkProgressPanel**|idle, dry-run preview, processing (50%), done, failed, partial failure|
|**UserRowActions**|admin role (all actions), teacher role (warn only), loading state|
|**HashChainRow**|valid, invalid (broken chain), pending verification|
|**AuditLogTable**|loading, empty, with low/medium/high/critical risk rows|
|**MaintenanceBanner**|with ends\_at, without ends\_at, counting down|
|**FeatureFlagRow**|enabled, disabled, loading toggle, with date overrides|

## **6.2 Story File Template**
// components/ui/UserStatusChip/UserStatusChip.stories.tsx

import type { Meta, StoryObj } from '@storybook/react';

import { UserStatusChip } from './UserStatusChip';

const meta: Meta<typeof UserStatusChip> = {

`  `title:     'UI/UserStatusChip',

`  `component:  UserStatusChip,

`  `tags:      ['autodocs'],

`  `argTypes:  { status: { control: 'select', options: ['active','locked','suspended','banned'] } },

};

export default meta;

type Story = StoryObj<typeof UserStatusChip>;

export const Active:    Story = { args: { status: 'active'    } };

export const Locked:    Story = { args: { status: 'locked'    } };

export const Suspended: Story = { args: { status: 'suspended' } };

export const Banned:    Story = { args: { status: 'banned'    } };

## **6.3 Chromatic Visual Diff Policy**
- Chromatic runs on every PR via GitHub Actions. New snapshots require designer approval before merge.
- Accepted diffs are committed — never auto-approved without review.
- RTL stories are separate stories suffixed with \_RTL and snapshotted independently.
- Dark mode stories are separate stories suffixed with \_Dark.

## **6.4 Accessibility Testing in Storybook**
// .storybook/main.ts — enable a11y addon

addons: ['@storybook/addon-a11y', '@storybook/addon-essentials'],

- Every story runs axe-core automatically via the a11y addon.
- Stories with known WCAG violations must include a11y: { disable: true } with a GitHub issue reference and fix deadline.
- Target: 0 axe-core violations on all UI and domain component stories before P10.


# **7. Test Data Seeding Plan**
## **7.1 Seed File Structure**
supabase/

├── seed.sql                  # Immutable reference data (runs once)

├── seed-fixtures/

│   ├── users.sql             # 4 test users per role + 20 student fixtures

│   ├── courses.sql           # 5 test courses with sections and lessons

│   ├── enrollments.sql       # Pre-enrolled students for course tests

│   ├── activity\_logs.sql     # 100 activity entries with varied risk levels

│   ├── warnings.sql          # 10 warnings across test users

│   └── job\_queue.sql         # 3 jobs in pending/done/failed states

└── reset-fixtures.sql        # Truncates and re-runs seed-fixtures/ (used by Cypress)

## **7.2 Factory Functions (Vitest)**
// tests/factories/user.factory.ts

import { faker } from '@faker-js/faker';

import type { User } from '@eduzone/types';

export const userFactory = {

`  `build: (overrides: Partial<User> = {}): User => ({

`    `id:               faker.string.uuid(),

`    `email:            faker.internet.email(),

`    `first\_name:       faker.person.firstName(),

`    `last\_name:        faker.person.lastName(),

`    `primary\_role:     'student',

`    `account\_status:   'active',

`    `lock\_reason:      null,

`    `locked\_at:        null,

`    `suspension\_until: null,

`    `warning\_count:    0,

`    `last\_login:       new Date().toISOString(),

`    `shard\_key:        1,

`    `tenant\_id:        '00000000-0000-0000-0000-000000000001',

`    `region\_id:        'region-eg-01',

...overrides,

`  `}),

`  `buildList: (n: number, overrides?: Partial<User>) =>

`    `Array.from({ length: n }, () => userFactory.build(overrides)),

};

## **7.3 Environment Variables for Tests**

|**Variable**|**Value in CI**|**Notes**|
| :-: | :-: | :-: |
|**NEXT\_PUBLIC\_SUPABASE\_URL**|http://localhost:54321|Supabase local; never production|
|**NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY**|<local anon key>|From supabase status output|
|**SUPABASE\_SERVICE\_ROLE\_KEY**|<local service key>|Used by Cypress tasks only (Node context)|
|**CYPRESS\_TEST\_ADMIN\_EMAIL**|admin@test.eduzone|Matches users.sql fixture|
|**CYPRESS\_TEST\_SUPER\_EMAIL**|super@test.eduzone|Matches users.sql fixture|
|**CYPRESS\_TEST\_TEACHER\_EMAIL**|teacher@test.eduzone|Matches users.sql fixture|
|**CYPRESS\_TEST\_PASSWORD**|<from GitHub Secrets>|Same password for all test users|

**SECRET HYGIENE:** Test passwords and service\_role key are stored in GitHub Actions secrets and Vercel preview env. Never commit to .env files or hardcode in test files.
EduZone Platform  |  Vitest + Cypress + Storybook  |  Page  of 
