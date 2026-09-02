# M10 — Error Architecture (P1) — Milestone Report

> المرحلة: **§14 P1 — Error Architecture** (M9 في ترتيب التنفيذ = M10 في تسلسل التقارير)
> التاريخ: 2026-09-02
> المنهجية: شوف → افحص → فكّر → عدّل → تأكد (نُفِّذت الحلقة كاملة مع إعادة فحص وقياس على HEAD نظيف)

---

## 1) الهدف (من الخطة §14)

- توحيد **تصنيف الأخطاء (Error Taxonomy)** بدل `throw new Error` / raw DB errors المتفرقة.
- منع **تسريب التفاصيل الداخلية** (رسائل PostgREST/PG، أسماء القيود، المخطط، الـstack، أكواد SQLSTATE) إلى العميل.
- إغلاق بند **F9-8** المؤجل من M9: `cleanup-duplicate-seqs` route يُرجع `fetchErr.message` / `delErr.message` الخام للعميل.
- إضافة **قاعدة architecture قابلة للفشل** تحرس حدود الأخطاء (M10)، مثل ما فعل M9 مع الـDTO boundary.

## 2) ما نُفِّذ

### 2.1 التصنيف — `src/domain/errors/taxonomy.ts` (جديد)

ستة أصناف فوق `AppError` الموجود (كل صنف **هو** `AppError` — لا كسر للمستهلكين الحاليين):

| الصنف | الكود | الحالة |
|---|---|---|
| `ValidationError` | `INVALID_TYPE` | 400 |
| `UnauthorizedError` | `AUTH_REQUIRED` | 401 |
| `ForbiddenError` | `PERMISSION_DENIED` | 403 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `ConflictError` | `DUPLICATE` | 409 |
| `InfrastructureError` | `INTERNAL_ERROR` | 500 |

- `errorStatus(err)`: خريطة الحالة (مصفوفة "تأكد" في §14) — مُختبرة بـtest matrix.
- `toClientMessage(err)`: **النقطة الوحيدة** لاستخراج رسالة موجهة للعميل:
  - `AppError` → رسالته المؤلفة (آمنة بالتصميم).
  - `ZodError` → أول issue (رسائل التحقق موجهة للمستخدم).
  - أي شيء آخر → نص عام + `console.error` (المسؤولية على موقع الـthrow/catch).
- `mapDbError(raw, context)`: البديل المعتمد الوحيد عن `if (error) throw error;` — يسجل الخام server-side ثم:
  - أكواد PG/PostgREST الخام (`23505`, `42P01`, `PGRST*`, بلا كود) → `InfrastructureError` برسالة عامة.
  - أكواد التطبيق المؤلفة (UPPER_SNAKE مثل `PERMISSION_DENIED`) → `AppError` يحافظ على الكود والرسالة.

### 2.2 تحصين `parseRpcError`

- كل `PostgrestError` بكود خام (SQLSTATE 5 خانات أو `PGRST*`) يُقنّع إلى `INTERNAL_ERROR` برسالة عامة، مع تسجيل الخام في الـlogs.
- أكواد RPC المؤلفة من تطبيقنا (UPPER_SNAKE) تبقى تمر برسائلها المكتوبة للعميل.
- اكتُشفت الحاجة أثناء التشغيل: أول تنفيذ استخدم قائمة بيضاء من الأكواد، ففشلت الاختبارات (رسائل RPC المؤلفة قُنّعت) → صُمم تمييز **الشكل** بدل القائمة (مطابقة نمط SQLSTATE/PGRST).

### 2.3 إصلاح مواقع التسريب (17 ملفًا)

**البنية التحتية (repos):**
- `user-admin.repository.ts`: رسائل Auth/DB الخام في `StepResult.message` → `toStepFailure()` (تسجيل + رسالة قصيرة مستقرة `"<Step> failed"`)؛ استثناء `not found` في `deleteAuthUser` محفوظ كمَعلَم idempotency؛ RPCs → `InfrastructureError`.
- `settings.service.ts`: `throw new Error('ADMIN_ONLY')` → `UnauthorizedError`؛ `SETTING_NOT_FOUND` → `NotFoundError('Setting')`؛ `throw error` → `mapDbError`.
- `feature-flags.service.ts`: `FLAG_NOT_FOUND` → `NotFoundError`؛ `FLAG_KEY_EXISTS` (23505) → `ConflictError('A flag with this key already exists')`؛ `No tenant found...` → `ForbiddenError`.
- `courses.service.ts`: 4 رسائل عربية كانت تلصق `contentErr.message`/`batchErr.message`/`durationErr.message` → `InfrastructureError` برسالة عامة + التفاصيل للـlogs؛ `Not authenticated`/`TENANT_CONTEXT_REQUIRED` → `UnauthorizedError`؛ `enrollStudent` duplicate → `ConflictError` برسالة نظيفة.
- `enrollment-service.ts` (مكتشف بإعادة الفحص): `error.message` الخام في النتيجة → `mapDbError`.
- بقية الـrepos (14): `if (error) throw error;` → `throw mapDbError(error, '<file>')` آليًا + دمج الاستيرادات المكررة.

**الـuse-cases (4):** `getErrorMessage(error)` في نتائج `{ success, error }` → `toClientMessage(error)` (create-user، delete-user، account-control، record-current-session).
**الـactions:** `user.actions.ts` نفس التحول؛ `boundary.ts` `throw new Error('Unauthorized')` → `UnauthorizedError`.
**الـroutes (F9-8):** `cleanup-duplicate-seqs`: `fetchErr.message`/`delErr.message` → رسائل عامة `500` + تسجيل الخام؛ `bulk-action/route.ts` → `mapDbError`.
**خارجي:** `youtube.service.ts`: `YouTube API error: ${statusText}` → رسالة عامة (statusText قد يعكس تفاصيل upstream).

**الواجهة (sentinel strings → كود منظم):**
- `FeatureFlagsPage.tsx`: مقارنة `msg === 'FLAG_KEY_EXISTS'` → فحص `code === 'DUPLICATE'` + `toClientMessage`.
- `EnrollStudentDialog.tsx`: مقارنة `msg.includes('DUPLICATE')` → نفس النمط.

### 2.4 قاعدة Architecture قابلة للفشل (M10) — `layer-boundaries.test.ts`

قاعدتان تنفيذيتان على 4 طبقات (`infrastructure`, `adapters`, `app`, `application`):
1. **منع إعادة رفع الخطأ الخام**: نمط `if (error) throw error;` ممنوع — يجب الـmapping للتصنيف.
2. **`getErrorMessage` ممنوعة في حدود العميل**: يجب `toClientMessage` (تقنّع الأشكال غير-AppError).

**إثبات القدرة على الفشل:** عند أول تشغيل التقطت القاعدة **16 مخالفة فعلية** (15 `throw error` + 1 unused import ثانوي) — أُصلحت جميعًا حتى صارت 330/330.

### 2.5 تحديث الاختبارات التي تُثبت السلوك القديم

- `manage-tenants.use-case.test.ts`: يثبت الآن `code === 'DUPLICATE'` + منع الإدراج.
- `tenants.service.test.ts`: رسالة السبب الجديدة بلا بادئة sentinel.
- `record-current-session` / `account-control` / `courses.service` / `jobs` / `rate-limits` / `tenants` tests: من "يتوقع تمرير الرسالة الخام" إلى "**يثبت الإخفاء**" (`not.toContain('raw')` + `toBeInstanceOf(Error)`/`toMatchObject({ code })`).

## 3) التحقق (تأكد)

| الفحص | النتيجة |
|---|---|
| `tsc --noEmit` | ✅ صفر أخطاء |
| `eslint src --max-warnings=0` | ✅ صفر تحذيرات/أخطاء |
| vitest (domain + architecture + application + 15 ملف repos/adapters) | ✅ **563/563** |
| architecture tests (M9+M10) | ✅ 330/330 |
| domain/errors | ✅ 18/18 (12 قائمة + 6 taxonomy جديدة) |

### المقارنة مع HEAD نظيف (لعزل المسبق عن الجديد)

شُغّلت الحزمة الكاملة على HEAD عبر `git stash` مرتين:
- **feature-flags.service.test (12 فشل)**: فاشلة على HEAD أيضًا — MSW/network isolation، **مسبقة** (موثقة في تقرير M9).
- **env.test (1) + admin.test (3) + storybook (6) + e2e suites (3)**: فاشلة على HEAD أيضًا (متغيرات بيئة/بنية storybook/playwright) — **مسبقة وغير مرتبطة**.
- **إخفاقات كانت ناتجة عن تغييري** (courses 1، use-cases 4، jobs 4، rate-limits 1، tenants 1) — أُصلحت جميعًا؛ الإخفاق الكلي النهائي = الإخفاق المسبق على HEAD حرفيًا (لا رجوع).

## 4) قرارات تصميمية

1. **تمييز بالشكل لا بقائمة بيضاء** لأكواد PG (`/^[0-9][0-9A-Z]{4}$/` + `PGRST*`) — الأكواد المؤلفة UPPER_SNAKE تعبر بأمان، والخام يُقنّع.
2. **الرسالة مؤلفة في موقع النشأة** (repos) وليس في كل catch — لذا `toClientMessage` بسيطة وآمنة افتراضيًا.
3. **الـtaxonomy يوسّع `AppError`** ولا يستبدله: `parseRpcError`، `SESSION_INVALIDATING_CODES`، كل `instanceof AppError` تعمل كما هي.
4. **`AppError.name` وُسّع إلى `string`** ليسمح للأصناف الفرعية بتخصيصه (كان `as const` يمنع الـoverriding).
5. **sentinel strings → `code === 'DUPLICATE'`** في الواجهة: مطابقة على كود منظم بدل substring من رسالة.
6. **رسالة `deleteAuthUser` "not found"** أُبقيت كإشارة idempotency مقصودة (سلوك retry يعتمد عليها).

## 5) ما لم يُنفَّذ (خارج نطاق المرحلة، مقترح للمراحل القادمة)

- تسجيل مركزي (structured logger) بدل `console.error` — الخطة تسنده لمرحلة Observability.
- توحيد بقية `getErrorMessage` داخل features غير المواجهة للعميل مباشرة (تعمل وآمنة مساريًا).
- إصلاح الإخفاقات المسبقة (MSW/storybook/e2e/env) — موثقة كمسبقة وليست من هذا الـscope.

## 6) الأثر على بنود الخطة

- ✅ **F9-8 مغلق** (تسريب DB errors في cleanup route → رسائل عامة + logs).
- ✅ **§14 M9 (Error Architecture) مكتمل**: taxonomy + external-safe mapping + architecture guard قابل للفشل + اختبارات تثبت الإخفاء.
