# خطة إتمام EduZone Dashboard — Production Architecture
## الفترة: بعد M16 | الهدف: §24 Final Certification

---

## الحالة الحالية (نقطة الانطلاق)

```
typecheck = ✅ PASS
lint      = ✅ PASS
unit      = ✅ 1069/1069 PASS
build     = ✅ PASS
```

**المراحل المنجزة:** M0–M16 (§4–§21 من الخطة)  
**المرحلة التالية:** Pre-M17 cleanup → M17 → M18

---

## المجموعة 1: Pre-M17 — Structural Debt Cleanup

> هذه مجموعة من الإصلاحات الضرورية **قبل** الانتقال لـ§23، لأنها تؤثر على سلامة البنية وعلى موثوقية بوابات الـCI.
> الترتيب داخل المجموعة مهم: W4 أولًا لأنه يغلق ثغرة موثوقية CI، ثم W2/W1 لأنهما يُعدّلان كودًا سيتم اختباره في M17.

---

### Pre-M17.A — إصلاح RLS/Integration CI scripts (W4)

**المشكلة:** `scripts/security/rls-smoke-test.ts` و`permission-exhaustive-test.ts` تستخدم `console.assert` الذي **لا يُخرج `exit(1)`** عند الفشل في Node — بوابات CI وهمية تحمي لا شيء.

**الملفات:**
- [`scripts/security/rls-smoke-test.ts`](file:///d:/projects/EduZone/web_project/New_edu_dashboard/scripts/security/rls-smoke-test.ts)
- [`scripts/security/permission-exhaustive-test.ts`](file:///d:/projects/EduZone/web_project/New_edu_dashboard/scripts/security/permission-exhaustive-test.ts)

**التغيير (أقل تغيير آمن):**
1. استبدال كل `console.assert(cond, msg)` بـ:
   ```ts
   if (!cond) { console.error('[FAIL]', msg); process.exitCode = 1; }
   ```
2. إضافة فحص `process.exitCode` في نهاية كل ملف + `process.exit(process.exitCode ?? 0)`.
3. **لا تغيير في منطق الفحص نفسه** — فقط تعديل مسار الإخراج.

**تأكد:**
```bash
# تشغيل بدون backend (يجب أن يفشل لغياب .env.test — هذا متوقع)
# لكن يجب أن يُخرج exit code ≠ 0 عند فشل assertion
node --loader ts-node/esm scripts/security/rls-smoke-test.ts; echo "exit: $?"
```

**ملاحظة:** تشغيل الـscripts مقابل backend حقيقي يبقى مرتبطًا بتوفير `.env.test` (نفس متطلب E2E — خارج نطاق هذه المرحلة).

---

### Pre-M17.B — Branch Protection Documentation (W5)

**المشكلة:** لا يمكن تعريف Branch Protection بملف — يستلزم فعلًا يدويًا في GitHub UI.

**الإجراء (ليس كودًا — تنفيذ يدوي):**

```text
GitHub → EduZone_dashboard repo → Settings → Branches → Add branch ruleset:
  Branch name pattern: main
  ✅ Require a pull request before merging
  ✅ Require status checks to pass before merging
     Required checks: build_and_test (ci.yml)
  ✅ Do not allow bypassing the above settings
```

**توثيق في `.github/BRANCH_PROTECTION.md`** (ملف جديد) يوثق الإعداد المطلوب — حتى لا يُفقد عند إعادة إنشاء المستودع.

---

### Pre-M17.C — كسر العلاقة المعكوسة في tenants.service (W2 — جزء 1)

**المشكلة:** [`infrastructure/repos/tenants.service.ts`](file:///d:/projects/EduZone/web_project/New_edu_dashboard/apps/admin/src/infrastructure/repos/tenants.service.ts) يستورد من `@/adapters/actions/tenants.actions` (سطر 1–6، 113، 119، 125، 131).

`infrastructure` تستدعي `application/actions` (التي تستدعي `infrastructure`) → **دورة كاملة**.

**السبب الجذري:** `tenants.service.ts` تُستخدَم من الـUI كـlegacy service قبل M7. بعد M7، الـactions أصبحت رقيقة وتستدعي `ManageTenantsUseCase` مباشرة.

**الحل (أقل تغيير آمن):**
- `tenants.service.ts` تستدعي `ManageTenantsUseCase` مباشرة بدل الـactions.
- أو: إزالة الـ4 وظائف المُفوَّضة (create/update/suspend/delete) من `tenants.service.ts` إذا لا يوجد مستهلك لها من خارج الـservice.

**خطوة شوف أولًا:**
```bash
grep -r "tenantsService\.\(createTenant\|updateTenant\|suspendTenant\|deleteTenant\)" apps/admin/src
```

إذا صفر مستهلكين → **نحذف الوظائف** الأربع من `tenants.service.ts` ونزيل الاستيراد.  
إذا يوجد مستهلكون → ننقل الاستدعاء ليصبح مباشرًا عبر Use Case بدل الـaction.

**تأكد:**
```bash
pnpm typecheck && pnpm lint && pnpm --filter @eduzone/admin exec vitest run --config vitest.unit.config.ts src/infrastructure/repos/tenants.service.test.ts
```

---

### Pre-M17.D — كسر العلاقة المعكوسة في courses.service + SecurityAlertPanel (W2 جزء 2 + W1)

**المشكلة 1 (courses.service):** [`infrastructure/repos/courses.service.ts`](file:///d:/projects/EduZone/web_project/New_edu_dashboard/apps/admin/src/infrastructure/repos/courses.service.ts) سطر 1 يستورد `getYoutubeMetadataAction` من `@/adapters/actions/video.actions`.

`video.actions.ts` هو `'use server'` يستدعي `youtube.service.ts` مباشرة.  
أي: `infrastructure` → `adapters/actions (use server)` → `infrastructure` — دورة + تعقيد بلا سبب.

**الحل:** استدعاء `getYoutubeVideoDetails` من `youtube.service.ts` مباشرة داخل `courses.service.ts` (تجاوز الـaction الوسيط).
```ts
// بدل:
import { getYoutubeMetadataAction } from '@/adapters/actions/video.actions';
const res = await getYoutubeMetadataAction(data.video_url);

// يصبح:
import { getYoutubeVideoDetails } from '@/infrastructure/youtube.service';
const metadata = await getYoutubeVideoDetails(data.video_url);
// + تعامل مع الاستجابة مباشرة (لا wrapper success/error)
```

**المشكلة 2 (SecurityAlertPanel — W1):** [`features/dashboard/components/SecurityAlertPanel.tsx`](file:///d:/projects/EduZone/web_project/New_edu_dashboard/apps/admin/src/features/dashboard/components/SecurityAlertPanel.tsx) يستعلم `activity_logs` مباشرة عبر `container.supabase`.

**الحل:** نقل الاستعلام إلى:
- `adapters/queries/audit.queries.ts` — دالة `useSecurityAlerts()` hook.
- `SecurityAlertPanel` يستخدم الـhook بدل الاستعلام المباشر.

**تأكد:**
```bash
pnpm typecheck && pnpm lint
pnpm --filter @eduzone/admin exec vitest run --config vitest.unit.config.ts
```

التأكيد النهائي: grep لـ`video.actions` في `infrastructure` يجب أن يُعيد **صفر نتائج**.

---

## المجموعة 2: M17 — §23 P2 — Accessibility / UX Regression

**الهدف:** إثبات أن critical flows تعمل صحيحًا بعد كل refactoring، مع coverage أساسي للـa11y والـRTL.

### الحدود (في هذه المرحلة)

```text
Arabic RTL ✓ | English LTR ✓
لا Storybook/visual regression (تتطلب backend مرئي)
Focus على: keyboard nav + aria + state coverage (loading/empty/error/disabled)
```

### شوف (Inventory)

افحص:
```bash
# ملفات Playwright الحالية
ls apps/admin/tests/e2e/
# ملفات a11y في Storybook (إذا وُجدت)
grep -r "axe\|@axe-core\|toHaveNoViolations" apps/admin/src --include="*.ts" --include="*.tsx"
```

### افحص

حدد الـcritical flows:

```text
1. Login → Dashboard redirect
2. Users CRUD + role assignment
3. Courses CRUD + lesson reorder
4. Notifications send + inbox
5. Tenant management (super-admin)
6. Bulk actions (warn/suspend)
7. Settings (feature flags, access rules)
```

لكل flow:
```text
✓ لوحة مفاتيح (tab/enter/escape)
✓ aria-labels على الأزرار والـmodals
✓ RTL: الاتجاه لا يكسر التخطيط
✓ Loading state مرئي
✓ Empty state مرئي
✓ Error state مرئي
✓ Destructive confirmation (مثل حذف مستخدم)
```

### عدّل

**Phase A — Automated a11y (بدون backend):**
- إضافة `@axe-core/playwright` أو `axe-playwright` (إذا لم يكن مثبتًا).
- اختبارات Playwright تفحص الـaxe violations على صفحات ستاتيك (Login، Error pages).

**Phase B — E2E critical flows (تتطلب `vars.E2E_ENABLED`):**
- تحديث `tests/e2e/` بـspecs للـcritical flows.
- كل spec يتحقق من: keyboard nav + focus trap في modals + aria roles.
- RTL: تشغيل `?locale=ar` بجانب الافتراضي.

**Phase C — State coverage في الاختبارات الحالية:**
- إضافة اختبارات Vitest/MSW للحالات: `loading`, `empty`, `error`, `disabled` للـhooks والـqueries الرئيسية.

### تأكد

```text
[ ] axe: 0 violations على صفحات ستاتيك
[ ] Login flow: keyboard-only ✓
[ ] Modal: focus trap ✓ + Escape يغلق ✓
[ ] RTL: لا overflow + لا icon flip خاطئ
[ ] State coverage: loading/empty/error لكل critical component
[ ] Critical flows موثقة في E2E (خاملة إذا لم يتوفر backend)
```

---

## المجموعة 3: M18 — §24 Final Production Architecture Certification

**الهدف:** التحقق الشامل من كل checklist الخطة §24 — لا نقول "Architecture Production" إلا عند PASS الكامل.

### شوف + افحص

نُنفِّذ الحلقة على **كل بند** من §24:

#### Architecture
```bash
# 1. Domain isolation
grep -r "from '@/infrastructure\|from 'next\|from 'react'" apps/admin/src/domain/ --include="*.ts"
# 2. Application isolation
pnpm --filter @eduzone/admin exec vitest run --config vitest.unit.config.ts src/architecture/
# 3. Ports enforced
pnpm lint  # ESLint boundaries
# 4. Routes thin
grep -r "createAdminClient\|supabase.from" apps/admin/src/app/ --include="*.ts" --include="*.tsx"
# 5. Actions thin (لا business logic)
grep -r "createAdminClient" apps/admin/src/application/actions/ --include="*.ts"
```

#### Security
```bash
# service_role containment
grep -rn "createAdminClient\|SUPABASE_SERVICE_ROLE" apps/admin/src/ --include="*.ts" --include="*.tsx" | grep -v "infrastructure\|bulk-action\|cleanup-duplicate"
# auth centralized → authorization.service.ts
# deny-by-default → boundary.ts
# no secret in bundle (next build output)
```

#### Request Safety
```bash
grep -rn "actorId\|tenantId" apps/admin/src/container.ts
```

#### Data Access
```bash
# RPC catalog موثق
cat apps/admin/src/infrastructure/rpc/rpc-catalog.ts | head -20
# DTO boundary: لا as unknown as
grep -rn "as unknown as" apps/admin/src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec"
```

#### Reliability
```bash
# transactions موثقة
grep -rn "worker_issue_warning\|reorder_section_lessons\|reorder_course_sections" apps/admin/src/
# idempotency: uq_job_dedupe موثق في catalog
```

#### Observability
```bash
# structured logging: ConsoleLogger
# audit events: IAuditLogger
# request IDs: authorizeCaller → createRequestId
grep -rn "createRequestId\|requestId" apps/admin/src/application/authorization/
```

#### Testing (full gate)
```bash
pnpm typecheck
pnpm lint
pnpm --filter @eduzone/admin exec vitest run --config vitest.unit.config.ts
pnpm --filter @eduzone/admin build
```

#### CI/CD
```bash
# يُتحقق من .github/workflows/ci.yml و deploy.yml
cat .github/workflows/ci.yml | grep "Architecture Check"
```

### فكّر

لكل بند من §24 يكون:
- **PASS**: موثق + مختبر + يفشل CI عند الخرق.
- **PARTIAL**: موثق + مختبر جزئيًا + سبب معروف.
- **BLOCKED**: يتطلب backend/E2E — موثق بخطوات التفعيل.

### عدّل

إصلاح أي بند لم يصل لـPASS خلال الفحص.

### تأكد — الـchecklist النهائي

```text
Architecture
[ ] Domain isolated — grep صفر
[ ] Application isolated — arch tests PASS
[ ] Ports enforced — ESLint PASS
[ ] Infrastructure isolated — PASS
[ ] Routes thin — grep صفر
[ ] Actions thin — grep صفر
[ ] No dependency violations — arch tests PASS

Security
[ ] service_role isolated — grep محدود + vitest PASS
[ ] auth centralized — authorization.service.ts
[ ] authorization centralized — boundary.ts
[ ] deny-by-default — موثق في boundary.ts
[ ] resource authorization — موثق
[ ] tenant isolation verified — tenant-isolation.test.ts PASS
[ ] no secret leakage — errorStatus/toClientMessage PASS
[ ] privileged routes hardened — PASS

Request safety
[ ] no mutable global request context — container.ts فحص
[ ] request context scoped — RequestContext
[ ] no cross-request contamination — موثق في M3

Data access
[ ] repositories/ports where required — PASS
[ ] RPC boundary defined — rpc-catalog.ts
[ ] DTO boundary defined — bulk-action.schema.ts + M9
[ ] sensitive fields protected — toClientMessage PASS

Reliability
[ ] transactions where required — worker_issue_warning + reorder RPCs
[ ] idempotency where required — uq_job_dedupe
[ ] concurrency tests — M12 833/833
[ ] retries controlled — موثق

Observability
[ ] structured logging — ConsoleLogger JSON
[ ] request IDs — createRequestId في authorizeCaller
[ ] audit events — IAuditLogger + 9 use cases
[ ] error tracking — taxonomy.ts + mapDbError
[ ] alerts — (مرتبط بـSentry/external — مؤجل)

Testing
[ ] unit PASS — 1069/1069
[ ] integration PASS — PARTIAL (MSW ضمن unit)
[ ] security/RLS PASS — BLOCKED (يتطلب .env.test)
[ ] tenant A/B PASS — tenant-isolation.test.ts ✓
[ ] E2E PASS — BLOCKED (يتطلب E2E_ENABLED)
[ ] accessibility PASS — M17

CI/CD
[ ] clean install — PASS
[ ] lint PASS — PASS
[ ] typecheck PASS — PASS
[ ] architecture tests PASS — PASS (ci.yml باب صريح)
[ ] tests PASS — PASS
[ ] build PASS — PASS
[ ] security gates PASS — PARTIAL (RLS مؤجل بـscript hardening)
[ ] deployment smoke PASS — BLOCKED (لا pipeline نشر في المستودع)
[ ] branch protection — BLOCKED (فعل يدوي GitHub UI)
```

---

## جدول التنفيذ المقترح

| الحزمة | المحتوى | التقدير | الأولوية |
|---|---|---|---|
| **Pre-M17.A** | إصلاح `exit(1)` في RLS scripts | ~30 دقيقة | 🔴 P0 |
| **Pre-M17.B** | توثيق Branch Protection | ~15 دقيقة | 🔴 P0 |
| **Pre-M17.C** | كسر دورة tenants.service | ~45 دقيقة | 🟡 P1 |
| **Pre-M17.D** | كسر دورة courses.service + SecurityAlertPanel | ~60 دقيقة | 🟡 P1 |
| **M17** | Accessibility / UX Regression | ~3-4 ساعات | 🟡 P1 |
| **M18** | Final Certification checklist | ~2-3 ساعات | 🟡 P1 |

**ترتيب التنفيذ الصارم:**
```
Pre-M17.A → Pre-M17.B → Pre-M17.C → Pre-M17.D
    ↓
  M17 (Accessibility)
    ↓
  M18 (Final Certification)
```

---

## قاعدة إغلاق الخطة

الخطة تُغلق فقط عندما يُنتج M18 ملف تقرير يوثق:
- كل بند في §24 بحالة PASS / PARTIAL / BLOCKED مع سبب.
- commands + نتائج فعلية.
- قائمة المخاطر المتبقية مع خطط التفعيل.

> **معيار النجاح النهائي:**
> كل Boundary مهمة في Architecture يمكن إثباتها بالكود والاختبارات والـCI، وكل Security Control حساس يمكن اختباره adversarially، وكل تغيير يمكن تتبعه وإعادة التحقق منه.
