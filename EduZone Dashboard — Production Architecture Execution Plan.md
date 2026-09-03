# EduZone Dashboard — Production Architecture Execution Plan
## Execution Model: شوف → افحص → فكّر → عدّل → تأكد

Repository:
https://github.com/mi9092921-alt/EduZone_dashboard

## 1. الهدف النهائي

تحويل الـArchitecture الحالية في `EduZone_dashboard` إلى Architecture Production-grade بدون إعادة كتابة المشروع من الصفر وبدون كسر الوظائف الحالية.

المشروع بالفعل يحتوي على طبقات:

```text
src/
├── domain/
├── application/
├── adapters/
├── infrastructure/
├── features/
├── app/
└── container.ts
```

كما توجد `application/ports` و`application/authorization` وطبقات Supabase وRepositories بالفعل. لذلك المهمة هي **refactoring + enforcement + verification**، وليست إنشاء Architecture جديدة من الصفر.  

---

# 2. قاعدة التنفيذ الأساسية

لن يتم تنفيذ أي Milestone بطريقة:

```text
اقرأ الخطة
↓
أنشئ ملفات
↓
قل إن المرحلة انتهت
```

بل لكل Milestone:

```text
1. شوف
   ↓
2. افحص
   ↓
3. فكّر
   ↓
4. حدّد أقل تغيير آمن
   ↓
5. عدّل
   ↓
6. Typecheck
   ↓
7. Lint
   ↓
8. Tests
   ↓
9. Architecture/Security checks
   ↓
10. راجع diff
   ↓
11. أعد الفحص
   ↓
12. تأكد أن المشكلة الأصلية اختفت
```

ويجب تكرار الحلقة أكثر من مرة عند الحاجة، خصوصًا في P0/P1.

---

# 3. قواعد ممنوعة أثناء التنفيذ

ممنوع:

- إعادة كتابة المشروع بالكامل.
- إنشاء abstraction لمجرد abstraction.
- نقل الملفات دون تحديد سبب معماري واضح.
- تغيير السلوك الوظيفي دون ضرورة.
- اعتبار TypeScript ناجحًا كدليل Production.
- الاعتماد على Documentation لإثبات أن Security صحيحة.
- وضع `service_role` في UI أو feature code.
- وضع business logic في Route أو Server Action.
- الاعتماد على frontend permissions كحاجز أمني.
- استخدام mutable global request state.
- تعديل قاعدة البيانات دون فحص المستودعين المشتركين وتأثير التغيير على `EduZone_App`.

قاعدة البيانات مشتركة بين التطبيق والـDashboard، وتعليمات المشروع تنص صراحة على أن أي تغيير فيها يجب فحص استخداماته في المستودعين معًا. 

---

# 4. P0 — Baseline & Reality Mapping

## الهدف

إنشاء صورة دقيقة جدًا للحالة الحالية قبل refactoring.

### شوف

افحص:

```text
apps/admin/src/
apps/admin/src/app/
apps/admin/src/application/
apps/admin/src/adapters/
apps/admin/src/domain/
apps/admin/src/infrastructure/
apps/admin/src/features/
supabase/
.github/
```

ثم افحص أيضًا:

```text
package.json
turbo.json
pnpm-workspace.yaml
tsconfig*
eslint*
vitest*
playwright*
cypress*
next.config*
middleware.ts
container.ts
```

### افحص

ابحث عن:

```text
createClient(
createBrowserClient(
createServerClient(
createAdminClient(
SUPABASE_SERVICE_ROLE_KEY
process.env
supabase.from(
supabase.rpc(
fetch(
'use server'
route.ts
action
requirePermission
roleAllowsPermission
tenantId
actorId
any
as unknown as
```

وابنِ inventory مصنفًا:

```text
AUTH
AUTHORIZATION
SERVICE_ROLE
TENANCY
DATABASE
RPC
ROUTES
SERVER ACTIONS
FEATURES
ADAPTERS
DOMAIN
APPLICATION
OBSERVABILITY
TESTS
CI
```

### فكّر

أنشئ dependency graph حقيقي:

```text
UI
 ↓
Feature
 ↓
Adapter
 ↓
Application
 ↓
Port
 ↓
Infrastructure
```

مع تسجيل أي انحراف.

### عدّل

في هذه المرحلة لا نعيد هيكلة business logic.

نضيف فقط أدوات/تقارير baseline اللازمة لاكتشاف violations بدقة.

### تأكد

يجب أن نخرج بـ:

```text
ARCHITECTURE_BASELINE
SERVICE_ROLE_INVENTORY
AUTHORIZATION_INVENTORY
TENANT_INVENTORY
ROUTE_ACTION_INVENTORY
DEPENDENCY_GRAPH
```

ولا ننتقل إلى refactor قبل اكتمال هذه الصورة.

---

# 5. P0 — Release Stability Gate

هذه مرحلة ضرورية قبل أي refactoring واسع؛ لأن Production Readiness الحالي يثبت أن:

- tests تفشل
- lint غير سليم
- build لا ينتهي بنجاح كامل

وهذا P0 حقيقي. 

## شوف

نفذ clean install.

ثم:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### افحص

صنّف كل failure:

```text
CODE
TEST
MOCK
ENVIRONMENT
NETWORK
TOOLING
CONFIGURATION
```

Production plan الحالي يذكر وجود network calls داخل unit tests وVitest worker timeouts ووجود مشكلة في lint integration. 

### فكّر

افصل:

```text
Unit Tests
Storybook Browser Tests
Integration Tests
E2E Tests
```

ولا يجب أن تفشل unit tests بسبب Supabase network.

### عدّل

- إصلاح test isolation.
- منع network calls في unit tests.
- فصل Storybook browser project عن unit suite.
- إصلاح lint إلى ESLint CLI حديث.
- توحيد toolchain.

### تأكد

نريد:

```text
typecheck = PASS
lint = PASS
unit = PASS
build = PASS
```

من clean checkout.

---

# 6. P0 — Configuration & Secret Boundary

الـProduction plan الحالي يعتبر credentials المحلية Risk/P0، حتى لو كانت `.gitignored`. يجب التعامل معها على أنها exposed إلى أن يتم إثبات العكس. 

## شوف

افحص:

```text
apps/admin/.env.local
.env*
vercel config
GitHub Actions
tests
fixtures
logs
artifacts
Sentry
```

### افحص

صنف:

```text
PUBLIC
SERVER
SECRET
THIRD_PARTY
TEST
```

واكشف كل مكان يمكن أن يصل إليه:

```text
SUPABASE_SERVICE_ROLE_KEY
JWT
API keys
Sentry secrets
YouTube credentials
```

### فكّر

يجب أن يكون:

```text
Browser
  ↓
PUBLIC CONFIG ONLY

Server
  ↓
SERVER CONFIG

Privileged Server
  ↓
SECRET CONFIG
```

### عدّل

أنشئ configuration boundary typed ومتحققًا.

واعمل:

```text
secret rotation
history scan
artifact scan
fake test fixtures
```

ولا تسمح بإدخال secrets داخل test output.

### تأكد

يجب إثبات:

```text
old secret revoked
new secret works
secret scan clean
no secret in client bundle
no secret in logs
```

---

# 7. P0 — Request Context Isolation

هذه نقطة مهمة جدًا في المشروع الحالي.

الـ`container.ts` يحتوي بالفعل:

```ts
actorId: '' as string,
tenantId: '' as string,
```

أي أن هناك mutable global state للـrequest context داخل container. 

## شوف

حدد جميع استخدامات:

```text
container.actorId
container.tenantId
global auth context
singleton request state
```

## افحص

حدد هل يمكن أن تتشارك طلبات مختلفة نفس القيمة.

## فكّر

النموذج الصحيح:

```text
Request
 ↓
RequestContext
 ├── userId
 ├── tenantId
 ├── role
 └── permissions
```

ويكون request-scoped.

## عدّل

أزل mutable request state من global container.

اجعل context يدخل صراحة في العمليات المطلوبة.

## تأكد

اختبار concurrent requests:

```text
Request A → Tenant A
Request B → Tenant B
```

ويجب عدم حدوث أي cross-request contamination.

---

# 8. P0 — Service Role Isolation

هذه واحدة من أخطر نقاط المشروع.

في `admin.actions.ts` يوجد حاليًا إنشاء مباشر لـ`service_role` client داخل Server Action، مع Authorization وDB operations في الملف نفسه. 

## شوف

اجمع جميع:

```text
SUPABASE_SERVICE_ROLE_KEY
createClient(service_role)
```

### افحص

لكل استخدام:

```text
Who calls it?
What operation?
Why service_role?
Can anon/server client do it?
What tenant protection exists?
What authorization happens first?
```

### فكّر

لا ننشئ `service_role` abstraction عام.

ننقل فقط العمليات التي تحتاجه فعلاً إلى:

```text
Server-only Admin Gateway
```

مع allowlist.

### عدّل

الهدف:

```text
Adapter / Route
      ↓
Authorization
      ↓
Use Case
      ↓
Admin Gateway
      ↓
service_role
```

وليس:

```text
Route
 ↓
createClient(service_role)
 ↓
DB
```

### تأكد

Grep يجب أن يثبت أن استعمال service-role محصور في المواقع المعتمدة فقط.

---

# 9. P0 — Authorization Consolidation

هناك بالفعل `application/authorization/policy.ts`، لكنه يمثل إصلاحًا جزئيًا فقط، والملف نفسه يوضح أن الـcentralized authorization النهائي لم يُنفذ بعد. 

## شوف

احصر كل:

```text
role checks
permission checks
super_admin checks
tenant checks
ownership checks
```

في:

```text
UI
hooks
routes
actions
repositories
RPC
```

### افحص

لكل operation:

```text
Authentication?
Role?
Permission?
Tenant?
Resource ownership?
Resource state?
```

### فكّر

نحتاج decision model موحدًا:

```text
AuthorizationContext
+
Action
+
Resource
→
AuthorizationDecision
```

### عدّل

أنشئ:

```text
IAuthorizationService
```

مع عمليات واضحة مثل:

```text
requirePermission()
requireRole()
requireTenantAccess()
requireResourceAccess()
requireSuperAdmin()
```

ويكون القرار deny-by-default.

### تأكد

اختبارات matrix:

```text
anonymous
student
teacher
admin
super_admin
tenant A
tenant B
owned resource
foreign resource
```

---

# 10. P0 — Tenant Isolation

هذه ليست مرحلة Documentation.

Production plan الحالي يصنفها P0 لأن RLS موجود، لكن لا يوجد executable attack matrix يثبت العزل عبر كل المسارات. 

## شوف

حدد جميع data paths:

```text
Tables
RPC
Routes
Server Actions
Repositories
Exports
Search
Analytics
Jobs
Realtime
Storage
```

## افحص

لكل path:

```text
How tenant is derived?
Can client provide tenantId?
Can super_admin cross tenants?
Can teacher cross tenant?
Is resource ownership checked?
```

### فكّر

القاعدة:

```text
tenantId from trusted context
≠
tenantId from request body
```

إلا في explicit authorized super-admin operation.

### عدّل

اجعل tenant context جزءًا من authorization contract.

### تأكد

أنشئ:

```text
Tenant A
Tenant B
```

ثم اختبر:

```text
SELECT
INSERT
UPDATE
DELETE
RPC
API
Export
Search
Analytics
Realtime
Jobs
Storage
```

الـnegative tests يجب أن تثبت:

```text
A cannot read B
A cannot update B
A cannot delete B
A cannot export B
```

---

# 11. P0 — Route / Server Action Thin Boundary

المشروع الحالي يحتوي Server Actions كبيرة، وأبرز مثال `admin.actions.ts` بحجم يقارب 30 KB. 

## الهدف

Server Action يجب أن تصبح:

```text
validate
→ authenticate
→ authorize
→ execute use case
→ map response
```

## شوف

حلل كل function داخل:

```text
application/actions/*
```

ثم صنفها:

```text
READ
WRITE
ADMIN
SESSION
TENANT
VIDEO
```

## افحص

حدد business logic وDB queries وpermission logic الموجودة داخلها.

## فكّر

قسّم العمليات الكبيرة فقط إلى Use Cases حقيقية.

لا تنشئ 100 abstraction بلا حاجة.

## عدّل

مثلًا:

```text
createCourseAction
        ↓
CreateCourseUseCase
        ↓
ICourseRepository
        ↓
SupabaseCourseRepository
```

## تأكد

يجب أن تختفي تدريجيًا من actions:

```text
business rules
service_role creation
duplicated authorization
large DB orchestration
```

---

# 12. P1 — Repository / Port Boundary

المشروع يحتوي أصلًا على `application/ports` و`infrastructure/repos`.  

لذلك لا ننشئها من الصفر.

## شوف

اربط:

```text
Use Case
→ Port
→ concrete Repository
```

## افحص

أي Use Case يصل مباشرة إلى:

```text
Supabase
fetch
Next.js
database client
```

## عدّل

انقل direct dependency إلى Port عندما تكون العملية business-critical أو تستفيد فعليًا من abstraction.

## تأكد

Architecture test:

```text
Application → Infrastructure = FAIL
Application → Port = PASS
```

---

# 13. P1 — DTO / Schema Boundary

## شوف

حدد كل مكان يعبر فيه:

```text
DB row
→ UI
```

أو:

```text
request body
→ business logic
```

## افحص

خصوصًا:

```text
any
as unknown as
database row casts
Partial<DB types>
```

Production plan بالفعل يسجل كثرة `any` كخطر P2-SEC-007. 

## عدّل

استخدم:

```text
Zod Input Schemas
DB Types
Domain Types
Application DTOs
```

حسب الحاجة، وليس بشكل آلي لكل object.

## تأكد

الـpublic boundary لا يعيد DB internals أو sensitive fields.

---

# 14. P1 — Error Architecture

## شوف

احصر:

```text
throw new Error(...)
```

والـraw DB errors.

## افحص

هل error يصل للعميل بما فيه:

```text
DB details
function names
stack
SQL details
internal IDs
```

## عدّل

أنشئ error taxonomy:

```text
ValidationError
UnauthorizedError
ForbiddenError
NotFoundError
ConflictError
InfrastructureError
```

مع external-safe mapping.

## تأكد

مثال:

```text
ForbiddenError → 403
NotFoundError → 404
Internal database error → generic 500
```

والـlogs فقط تحتوي التفاصيل الداخلية.

---

# 15. P1 — RPC Boundary

## شوف

اجمع جميع RPCs المستخدمة من التطبيق.

## افحص

صنفها:

```text
Public
Authenticated
Tenant Scoped
Privileged
Service Role Only
```

ثم افحص:

```text
SECURITY DEFINER
search_path
grants
tenant validation
caller validation
```

## عدّل

لا تسمح باستدعاء RPC حساس بشكل عشوائي من Application code.

استخدم Ports/Repositories للـRPCs business-critical.

## تأكد

اختبارات مباشرة للـRPC من أكثر من role وأكثر من tenant.

---

# 16. P1 — Transaction / Concurrency / Idempotency

## شوف

ابحث عن العمليات متعددة الخطوات:

```text
create + assign
publish + audit
bulk update
notification dispatch
subscription mutation
```

## افحص

اسأل:

```text
What if request repeats?
What if request crashes halfway?
What if two requests arrive simultaneously?
```

## فكّر

لا نضع transaction abstraction في كل مكان.

فقط العمليات التي تتطلب atomicity حقيقية.

## عدّل

حيث يلزم:

```text
DB transaction
RPC transaction
unique constraint
idempotency key
lease
retry
```

## تأكد

اختبارات:

```text
double submit
concurrent update
retry after failure
partial failure
```

---

# 17. P1 — Audit & Observability ✅ DONE (M13 — 2026-09-03, see project_documents/milestone_reports/M13_audit_observability_report.md)

المشروع لديه observability وaudit infrastructure بالفعل، لكن Production evidence غير مكتمل. 

## شوف

حدد العمليات الحساسة:

```text
role change
user delete
teacher assignment
course publish
subscription change
bulk action
settings change
```

## عدّل

اجعل Use Case هو مصدر الـaudit event، وليس UI.

وأضف structured logging:

```text
requestId
userId
tenantId
action
resource
duration
result
```

بدون:

```text
password
token
service_role
session
secrets
```

## تأكد

اختبر:

```text
operation
→ audit entry
→ correlation id
→ observable log
```

---

# 18. P1 — Architecture Enforcement ✅ DONE (M14 — 2026-09-03, see project_documents/milestone_reports/M14_architecture_enforcement_report.md)

هذه مرحلة أساسية حتى لا يعود المشروع إلى حالته السابقة.

## شوف

أدخل architecture violations المعروفة.

## فكّر

حوّل الـArchitecture إلى rules قابلة للفشل.

## عدّل

استخدم ESLint boundaries أو dependency-cruiser.

القواعد الأساسية:

```text
domain → only domain/shared-pure
application → domain + ports + dto + errors
application ↛ infrastructure
domain ↛ Supabase
domain ↛ Next
domain ↛ React
features ↛ service_role
routes ↛ business logic
```

## تأكد

تعمد إنشاء violation صغير في test branch.

يجب أن يفشل CI.

---

# 19. P1 — CI/CD Production Gates ✅ DONE (M15 — 2026-09-03, see project_documents/milestone_reports/M15_ci_cd_production_gates_report.md — Architecture Check صارت بوابة صريحة + parity على main؛ بوابة E2E مُعرَّفة وخاملة تنتظر `vars.E2E_ENABLED`، وRLS/Integration/Smoke متابَعة بفقرة §7 من التقرير)

الـCI الحالي يقوم بـsecret scan وtypecheck وlint وVitest وbuild وDB lint، لكنه لا يثبت E2E أو integration/RLS/migration وغيرها. 

كما أن Production plan يسجل tool/version drift في deploy pipeline. 

## الهدف

```text
PR
 ↓
Secret Scan
 ↓
Dependency Audit
 ↓
Architecture Check
 ↓
Lint
 ↓
Typecheck
 ↓
Unit
 ↓
Integration
 ↓
Security/RLS
 ↓
E2E
 ↓
Build
 ↓
Deployment Smoke
```

## تأكد

لا يمكن merge إلى `main` إذا فشل أي Production gate.

---

# 20. P1 — Database Lifecycle

هذه المرحلة يجب التعامل معها بحذر لأنها **ليست Dashboard-only**.

Production plan الحالي يحدد مشكلة migration history وrollback كـP0-DB-001. 

وفي المقابل، تعليمات `agent_prompt_eduzone_db.md` الحالية تقول صراحة إن قاعدة البيانات المشتركة ما زالت في تطوير نشط، وتمنع إنشاء migrations/patches بالطريقة الحالية، وتطلب التعامل مع `supabase/schema/` كمرجع مباشر إلى أن يتم تغيير هذه السياسة. 

لذلك لا يجب أن يخلط Agent Architecture بين المسارين.

### المسار الحالي

```text
Dashboard Architecture
        +
Shared DB Compatibility
```

### مسار مستقل لاحقًا

```text
Database Production Lifecycle
```

ولا يتم تغيير schema/migration strategy إلا بعد تنسيق المستودعين.

---

# 21. P2 — Performance Baseline

لا نبدأ optimization قبل measurement.

## شوف

قِس:

```text
TTFB
LCP
INP
CLS
bundle sizes
query latency
```

## افحص

أهم hotspots:

```text
bulk routes
notification fan-out
analytics
audit verification
realtime
Data Grid
search
exports
```

Production plan الحالي يعتبر هذه المناطق مرشحة للمخاطر لكنه يؤكد أنها غير مقاسة بعد. 

## عدّل

عند الحاجة:

```text
pagination
projection
batching
caching
queue
bounded exports
```

## تأكد

استخدم أرقامًا قبل وبعد.

---

# 22. P2 — External Services

أي integrations خارجية:  
مرحلة محذوفة حاليا 

---

# 23. P2 — Accessibility / UX Regression

بعد استقرار Architecture، وليس قبلها.

الـrepository يحتوي Storybook/axe/Cypress/Playwright، لكن هذه الأدوات ليست release evidence حاليًا. 

افحص:

```text
Arabic
English
RTL
responsive
keyboard
focus
modal
loading
empty
error
disabled
destructive confirmation
```

واجعل critical flows جزءًا من E2E.

---

# 24. المرحلة النهائية — Production Architecture Certification

لا نقول:

> Architecture Production

إلا عندما تكون كل الاختبارات التالية PASS.

## Architecture

```text
[ ] Domain isolated
[ ] Application isolated
[ ] Ports enforced
[ ] Infrastructure isolated
[ ] Routes thin
[ ] Actions thin
[ ] No dependency violations
```

## Security

```text
[ ] service_role isolated
[ ] auth centralized
[ ] authorization centralized
[ ] deny-by-default
[ ] resource authorization
[ ] tenant isolation verified
[ ] no secret leakage
[ ] privileged routes hardened
```

## Request safety

```text
[ ] no mutable global request context
[ ] request context scoped
[ ] no cross-request contamination
```

## Data access

```text
[ ] repositories/ports where required
[ ] RPC boundary defined
[ ] DTO boundary defined
[ ] sensitive fields protected
```

## Reliability

```text
[ ] transactions where required
[ ] idempotency where required
[ ] concurrency tests
[ ] retries controlled
```

## Observability

```text
[ ] structured logging
[ ] request IDs
[ ] audit events
[ ] error tracking
[ ] alerts
```

## Testing

```text
[ ] unit PASS
[ ] integration PASS
[ ] security/RLS PASS
[ ] tenant A/B PASS
[ ] E2E PASS
[ ] accessibility PASS
```

## CI/CD

```text
[ ] clean install
[ ] lint PASS
[ ] typecheck PASS
[ ] architecture tests PASS
[ ] tests PASS
[ ] build PASS
[ ] security gates PASS
[ ] deployment smoke PASS
```

---

# 25. ترتيب التنفيذ الفعلي

لا ننفذ المراحل الـ24 دفعة واحدة.

الترتيب المقترح:

```text
M0 — Baseline / Reality Mapping
        ↓
M1 — Release Stability
        ↓
M2 — Secret + Configuration Boundary
        ↓
M3 — Request Context Isolation
        ↓
M4 — Service Role Isolation
        ↓
M5 — Authorization Centralization
        ↓
M6 — Tenant Isolation
        ↓
M7 — Thin Actions / Routes
        ↓
M8 — Use Cases / Ports / Repositories
        ↓
M9 — DTO / Validation / Errors
        ↓
M10 — RPC Boundary
        ↓
M11 — Transactions / Concurrency / Idempotency
        ↓
M12 — Audit / Observability
        ↓
M13 — Architecture Enforcement
        ↓
M14 — CI/CD Gates
        ↓
M15 — Performance
        ↓
M16 — External Services
        ↓
M17 — UX / Accessibility
        ↓
M18 — Final Production Certification
```

---

# 26. شكل كل Milestone

كل Milestone له ملف/تقرير تنفيذ داخلي بهذه الصورة:

```text
MILestone
├── Current State
├── Findings
├── Risk
├── Target State
├── Files to Change
├── Dependency Impact
├── Shared DB Impact
├── Implementation
├── Validation
├── Regression Check
└── Exit Criteria
```

---

# 27. قاعدة إغلاق المرحلة

لا يتم إغلاق المرحلة بعبارة:

```text
Implemented
```

بل:

```text
Observed
Inspected
Reasoned
Changed
Verified
Re-scanned
```

ويجب تسجيل:

```text
commands
results
failing tests before
failing tests after
remaining risks
```

---

# 28. أهم قاعدة في EduZone تحديدًا

هناك مستويان من الـProduction:

```text
Dashboard Architecture
        ↓
Shared Supabase Contract
        ↓
EduZone App
```

لذلك أي refactor يغيّر:

```text
RPC
table contract
permissions
auth semantics
tenant semantics
database function
```

يجب أن يمر عبر cross-repository verification مع `EduZone_App` قبل اعتماده.

---

# 29. النتيجة النهائية المستهدفة

الـArchitecture النهائية تكون تقريبًا:

```text
                         UI
                          │
                          ▼
                     FEATURES
                          │
                          ▼
                    ADAPTERS
                 ┌────────┴────────┐
                 │                 │
             Server Actions     Routes
                 │                 │
                 └────────┬────────┘
                          ▼
                    APPLICATION
                 ┌────────┴────────┐
                 │                 │
             Use Cases         Authorization
                 │                 │
                 └────────┬────────┘
                          ▼
                       PORTS
                          ▲
                          │
                 ┌────────┴────────┐
                 │                 │
             REPOSITORIES       SERVICES
                 │                 │
                 └────────┬────────┘
                          ▼
                  INFRASTRUCTURE
                 ┌────────┼────────┐
                 │        │        │
             Supabase   RPC     External
                 │
                 ▼
            PostgreSQL
```

بينما:

```text
DOMAIN
```

يبقى مستقلًا قدر الإمكان عن:

```text
Next.js
React
Supabase
Browser
Infrastructure
```

---

# 30. القرار التنفيذي

الخطوة الأولى التي يجب تنفيذها الآن ليست إنشاء `Use Cases` ولا إعادة ترتيب الملفات.

ابدأ بـ:

```text
P0-M0
Architecture Baseline + Reality Mapping
```

والـAgent يجب أن يخرج أولًا بقائمة **المخالفات الفعلية الحالية في الملفات الفعلية**.

بعدها فقط يبدأ:

```text
P0-M1
Release Stability
```

ثم:

```text
P0-M2
Configuration / Secrets
```

ثم:

```text
P0-M3
Request Context
```

ثم `service_role → authorization → tenancy`.

هذا الترتيب يضمن أننا لا نبني Architecture "نظريًا صحيحة" فوق أساس حالي غير مستقر.

## معيار النجاح النهائي

الهدف ليس:

> "المشروع أصبح منظمًا."

الهدف هو:

> **كل Boundary مهمة في Architecture يمكن إثباتها بالكود والاختبارات والـCI، وكل Security Control حساس يمكن اختباره adversarially، وكل تغيير يمكن تتبعه وإعادة التحقق منه.**

وهذه هي النقطة التي تحول الـArchitecture من **تصميم جيد** إلى **Production Architecture قابلة للدفاع عنها هندسيًا**.