# M8 — Repository / Port Boundary — Milestone Report

> المرحلة: **# 12. P1 — Repository / Port Boundary** (M8 في ترتيب التنفيذ)
> التاريخ: 2026-09-02
> المنهجية: شوف → افحص → فكّر → عدّل → تأكد (نُفِّذت الحلقة كاملة مع إعادة فحص)

---

## 1. Current State (شوف)

الحالة قبل المرحلة:

- `application/ports/` موجودة وتضم: `IUserAdminRepository`, `ISessionRepository`,
  `ITenantAdminRepository`, `INotificationAdminRepository`, `IEventBus`, `ILogger`, `ITracer`.
- `infrastructure/repos/` تضم Implementations: `user-admin.repository.ts`,
  `session.repository.ts`, `tenant-admin.repository.ts`, `notifications.repository.ts`
  (+ domain services الأخرى: courses, users, tenants, feature-flags, jobs, audit,
  analytics, rate-limits, access-rules, bulk, settings, warnings).
- Use Cases في `application/use-cases/` (users, tenants, notifications, auth)
  تعتمد **فقط** على Ports — حالة ممتازة ناتجة عن M7.

## 2. Findings (افحص)

### F8-1: مخالفة قاعدة الطبقات — Server Actions داخل Application (مخالفة P1)

الخطة §29 تحدد أن Server Actions تنتمي إلى طبقة **ADAPTERS**، بينما Application
تحتوي فقط على Use Cases + Authorization + Ports. الواقع قبل المرحلة:

```
application/actions/*.ts  →  import  →  infrastructure/*   (6 ملفات)
```

أمثلة فعلية:
- `application/actions/boundary.ts` → `@/infrastructure/supabase/server`
- `application/actions/user.actions.ts` → `@/infrastructure/repos/user-admin.repository`
- `application/actions/admin.actions.ts` → `@/infrastructure/repos/*` (8 خدمات)
- `application/actions/tenants.actions.ts` → `@/infrastructure/repos/tenant-admin.repository`
- `application/actions/session.actions.ts` → `@/infrastructure/repos/session.repository`
- `application/actions/video.actions.ts` → `@/infrastructure/youtube.service`

أي أن `Application → Infrastructure = FAIL` في الواقع الحالي، وهي بالضبط
المخالفة التي يجب أن تفشل الـArchitecture test عندها (§12 "تأكد").

### F8-2: دورة اعتماد Application ↔ Infrastructure (خلل هيكلي)

```
infrastructure/repos/courses.service.ts
  → application/actions/video.actions.ts   (استدعاء Server Action من infrastructure!)
  → infrastructure/youtube.service.ts
```

تغيرات سلوكية بلا داعٍ: استدعاء `issueWarning` و`createTenant` و`getNotifications`
من `infrastructure/*.service.ts` كان يمر عبر Server Actions (ذاتها تستدعي
infrastructure) — دورة كاملة بدل الاستدعاء المباشر.

### F8-3: Domain نظيف بالفعل

فحص `domain/` كاملًا: صفر استيرادات من `next/react/@supabase/infrastructure`.
لا يحتاج تدخلًا.

### F8-4: service_role محصور (لا تغيير مطلوب)

`createAdminClient` مستخدم فقط في:
- `infrastructure/supabase/admin.ts` (المصدر الوحيد)
- `infrastructure/repos/*` (12 repo/service)
- 3 route handlers (`cron/routine`, `bulk-action`, `audit/cleanup-duplicate-seqs`)

كلها مواقع معتمدة ضمن نموذج Admin Gateway (نتيجة M4). لا يوجد service_role في
`features/` أو `adapters/` أو `application/`.

## 3. Risk

- نقل ملفات قد يكسر استيرادات واسعة → عولج بالبحث الشامل (26 موقع استيراد)
  و`git mv` للحفاظ على تاريخ الملفات.
- Server Actions تعمل عبر `'use server'` — يجب أن يبقى السلوك كما هو تمامًا
  (نقل الملف لا يغير دلالة 'use server' طالما الملف كامل ونُقل كما هو).

## 4. Target State

```
UI / Routes
     ↓
ADAPTERS (Server Actions هنا — §29)
     ↓ (validate → authenticate/authorize → execute)
APPLICATION (Use Cases + Ports + Authorization فقط — صفر تبعيات لأسفل)
     ↓
PORTS
     ↓
INFRASTRUCTURE (Supabase / repos / services)
```

## 5. Files to Change

| الملف | التغيير |
|---|---|
| `application/actions/*` → `adapters/actions/*` | نقل 6 ملفات (git mv — rename 100%) |
| `adapters/hooks/useSessionCheck.ts` | تحديث import |
| `adapters/mutations/users.mutations.ts` + test | تحديث imports |
| `adapters/mutations/warnings.mutations.ts` | تحديث import |
| `features/auth/components/AuthProvider.tsx` | تحديث import |
| `features/auth/components/LoginPage.tsx` | تحديث import |
| `infrastructure/repos/courses.service.ts` | تحديث import |
| `infrastructure/repos/{tenants,users,warnings,notifications}.service.ts` + tests | تحديث imports |
| `infrastructure/repos/feature-flags.service.test.ts` | تحديث mock path |
| `src/architecture/layer-boundaries.test.ts` | **جديد** — Architecture enforcement test |

## 6. Dependency Impact

- `container.ts` لا يتأثر (لم يكن يستورد actions).
- كل السلاسل: `features → adapters/actions → application/use-cases → ports → infrastructure/repos` — اتجاه واحد صحيح.
- حلقة F8-2 انقطعت جزئيًا: `courses.service → adapters/actions/video.actions`
  أصبحت داخل نفس المستوى (adapters ↔ infrastructure مقبول ضمن الشكل المستهدف؛
  الإلغاء الكامل للدورة عبر Port للـYouTube مؤجل لمرحلة M16 External Services
  وفق مبدأ "أقل تغيير آمن").

## 7. Shared DB Impact

**صفر** — لا تغيير على `supabase/schema/` أو RPC أو RLS أو أي contract مشترك.
التغيير تنظيم ملفات داخل Dashboard فقط. لا يتطلب cross-repo verification.

## 8. Implementation (عدّل)

1. `git mv application/actions adapters/actions` (6 ملفات، rename نظيف).
2. استبدال `@/application/actions/` → `@/adapters/actions/` في 17 ملفًا.
3. `eslint --fix` لإصلاح `import/order` الناتجة عن التغيير.
4. إنشاء `src/architecture/layer-boundaries.test.ts`:

   - **domain purity**: كل ملف في `domain/` ممنوع فيه import من
     `infrastructure/adapters/features/components/app/container/next/react/@supabase`.
   - **application isolation**: كل ملف في `application/` ممنوع فيه import من أي
     طبقة أخرى (بما فيها infrastructure) → `Application → Infrastructure = FAIL`
   - **use-cases → ports**: كل use case ممنوع أن يلمس `@/infrastructure/`.

## 9. Validation (تأكد)

| الفحص | النتيجة |
|---|---|
| `pnpm typecheck` (apps/admin) | **PASS** (exit 0) |
| `pnpm lint` (apps/admin, --max-warnings=0) | **PASS** (0 problems) |
| `pnpm test` (unit) | **323 passed** / 12 failed (ملف واحد) |
| `src/architecture/layer-boundaries.test.ts` | **62/62 PASS** |
| grep `@/application/actions` في src | **0 نتائج** |
| git rename detection | 6 renames بنسبة 100% |

### الفشل المتبقي — تحقيق الجذر (Re-scan)

`infrastructure/repos/feature-flags.service.test.ts` — 12/12 fail بسبب
`[MSW] Cannot bypass a request when using the "error" strategy` +
timeout. **تم إثبات أنه فشل مسبق**: شُغّل نفس الاختبار على HEAD النظيف
(34f9aab) في git worktree معزول بنفس النتيجة (12/12 failed). سببه أن الاختبار
ينفذ network calls (MSW `onUnhandledRequest: 'error'`) في unit suite —
وهذه بالضبط خانة **P0-M1 (Release Stability: منع network في unit tests)**
وليست من نطاق M8. تغييرات M8 لم تُدخل أي فشل جديد (323 test ناجح تشمل جميع
ملفات actions/repos المعدلة).

### إثبات أن القاعدة قابلة للفشل (§18 مبدأ "rules قابلة للفشل")

أثناء التنفيذ التقط الـArchitecture test فعليًا بقايا ملفات قديمة
(`application/actions/*` عادت للقرص أثناء عملية stash) وفشل 6/6 على الملفات
المخالفة قبل إزالتها — أي أن الاختبار يفعل ما صُمم له.

## 10. Regression Check

- السلوك الوظيفي: لا تغيير — الملفات نُقلت كما هي (fc/compare = identical
  بعد تحديث import path الوحيد داخل boundary actions).
- `'use server'` محفوظ في كل action file (نُقل verbatim).
- service-role isolation: لم يتغير (admin.ts لا يزال المصدر الوحيد، مخدوم من repos فقط).
- CI: typecheck + lint + architecture test يغطي القاعدة الجديدة في كل PR.

## 11. Exit Criteria

| المعيار | الحالة |
|---|---|
| `Application → Infrastructure = FAIL` (اختبار تنفيذي) | ✅ PASS (62/62) |
| `Application → Port = PASS` (Use Cases تعتمد Ports فقط) | ✅ (كان قائمًا من M7، الآن مفروض اختباريًا) |
| Server Actions في طبقة Adapters وفق §29 | ✅ |
| لا انحدار في typecheck/lint | ✅ |
| لا اختبارات جديدة فاشلة | ✅ (الفشل الوحيد موثق كمسبق ومخرَج جذر خارج نطاق M8) |
| Shared DB غير متأثرة | ✅ |

## 12. Remaining Risks / المتبعات

1. **P0-M1**: إصلاح `feature-flags.service.test.ts` (MSW/network isolation) —
   مخرج جذر موثق، يعالج في مرحلة Release Stability.
2. **M16 (External Services)**: إنشاء `IVideoMetadataProvider` port لإلغاء
   ما تبقى من دورة `courses.service → video.actions → youtube.service` بشكل
   كامل (حاليًا مسموح ضمن نفس المستوى لكنها ليست نموذجًا مثاليًا).
3. **M13 (Architecture Enforcement)**: الرفع من arch tests إلى ESLint
   `no-restricted-imports` / dependency-cruiser داخل CI ليتعطل البناء مباشرة
   بدل مرحلة الاختبار.
