# M14 — Architecture Enforcement Report (Execution Plan §18)

- **التاريخ:** 2026-09-03
- **المنهجية:** شوف → افحص → فكّر → عدّل → تأكد (حلقة كاملة مع إعادة فحص)
- **الترقيم:** M14 في تسلسل التقارير الفعلي (M13 في ترتيب تنفيذ الخطة §25؛ تقرير M13 سبق وحُجز لمرحلة Audit & Observability §17)
- **الحالة:** ✅ مكتمل — lint/typecheck/unit كلها خضراء (43 ملفًا / 1068 اختبارًا)، و**إثبات فشل فعلي** للبوابتين (Lint + Test) على violation مقصودة في branch اختباري

---

## 1. الهدف (من الخطة §18 — P1)

تحويل الـArchitecture إلى **rules قابلة للفشل**: أي عودة للوضع القديم يجب أن تُسقط البناء مباشرة عند باب CI وليس في مرحلة اختبار لاحقة. القواعد الأساسية من الخطة:

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

---

## 2. ما الذي وجدناه (شوف + افحص)

| الملاحظة | التفصيل |
|---|---|
| الفرض الحالي في مرحلة الاختبار فقط | `architecture/layer-boundaries.test.ts` (من M8) يعمل ضمن باب Vitest — وتقرير M8 طلب صراحة «الرفع من arch tests إلى ESLint `no-restricted-imports` داخل CI ليتعطل البناء مباشرة» |
| لا قواعد boundaries في ESLint | `eslint.config.mjs` كان يحتوي `import/order` فقط — لا شيء يمنع domain من استيراد React أو features من استيراد service_role وقت اللينت |
| **violation مسجلة (1)** — data access داخل UI | `features/dashboard/components/SecurityAlertPanel.tsx` ينفّذ `.from('activity_logs')...` مباشرة عبر `container.supabase` داخل مكوّن — استعلام بيانات خارج repos/adapters |
| **violation مسجلة (2)** — علاقة معكوسة موثقة | `infrastructure/repos/tenants.service.ts` و`courses.service.ts` تستوردان من `@/adapters/actions/{tenants,video}.actions` (موثقة في M7/M8 كتاريخية) |
| استثناءا service_role الموثقان | `app/api/bulk-action/route.ts` و`app/api/audit/cleanup-duplicate-seqs/route.ts` يستوردان `createAdminClient` (نطاق M4) — cron يمر عبر `jobs-rpc.service` ولا يستورده |
| إحصاء الاستيراد الفعلي | `createAdminClient` محصور في `infrastructure/**` + المسارين؛ لا استيراد `@supabase/*` **قيميًا** خارج infrastructure (bulk-action type-only)؛ `application` نظيف من كل الطبقات ومن next/react؛ `features` لا تستورد `@/application` ولا `@supabase` |

---

## 3. ما الذي نُفِّذ (عدّل)

### 3.1 خمس كتل قواعد في `apps/admin/eslint.config.mjs` (بدون أي dependency جديدة)

| # | الكتلة | الملفات | الممنوع | الاستثناءات |
|---|---|---|---|---|
| 1 | **service-role containment** (M4 + `features ↛ service_role`) | `src/**` | `@/infrastructure/supabase/admin` + استيراد `@supabase/*` **قيميًا** | `src/infrastructure/**`، `app/api/bulk-action/**`، `app/api/audit/cleanup-duplicate-seqs/**` |
| 2 | **domain purity** (`domain ↛ Supabase/Next/React`) | `src/domain/**` | أي `@/*` خارج `@/domain` (regex) + `next`/`react`/`react-dom`/`@supabase/*`/`@eduzone/ui` (بأنواعها) | — (النقي: relative + zod + `@eduzone/types`) |
| 3 | **application isolation** (`application ↛ infrastructure`) | `src/application/**` | `@/(infrastructure\|adapters\|features\|components\|app\|container)` + `next`/`react` + `@supabase/*` قيميًا | `allowTypeImports` لـ`@supabase/*` (حقن أنواع `SupabaseClient` — توثيق M8) |
| 4 | **thin routes** (`routes ↛ business logic`) | `src/app/**` | `@/infrastructure/supabase/admin` + `@supabase/*` قيميًا (لا اتصالات DB في الـroutes) | المساران المميزان أعلاه؛ types مسموحة |
| 5 | **features** | `src/features/**` | `@/infrastructure/supabase/admin` + `@supabase/*` قيميًا (الوصول عبر `container.supabase`/hooks) | types مسموحة |

ملاحظات تنفيذية:

- **flat config: آخر block مطابق يفوز** لِنفس rule id ⇒ الكتل مرتبة general → specific، وكل كتلة خاصة تُعيد ذكر الممنوعات العامة التي يجب أن تبقى سارية على ملفاتها.
- الاستثناءات عبر **قائمة بيضاء صريحة** (`ignores` على مستوى الكتلة) لا عبر تعطيل القاعدة داخل الملفات — أي violation في ملف جديد يفشل فورًا.
- `allowTypeImports: true` يرمّز استثناء M8 الموثق: طبقات أعلى قد تشير إلى **أنواع** Supabase فقط (معاملات `SupabaseClient` محقونة) ولا تنشئ عملاء أبدًا.
- حظر الأنواع أيضًا في domain (مطابق لصرامة guard الـvitest القائم الذي يمنع `import type` من `@supabase` في domain).

### 3.2 شبكة ثانية مستقلة — vitest guard (M14)

`describe('architecture: service-role containment (M14)')` في `layer-boundaries.test.ts`:

- يمسح **كل** `src` (تشمل `container.ts` و`middleware.ts` في الجذر — وليس الطبقات الأربع فقط) ما عدا القائمة البيضاء وملفات الاختبار/القصص.
- يطابق `from '...supabase/admin'` (alias أو relative) — يصمد أمام إعادة تسمية الـpath alias.
- النتيجة: **+216 assertion** (754 إجمالًا في الملف) — فشل إعداد ESLint لا يعيد فتح ثغرة service_role بصمت (باب Lint قبل باب Test في `ci.yml`).

---

## 4. القرارات المعمارية (فكّر)

1. **ESLint وليس dependency-cruiser:** الخطة تعطي الخيارين («ESLint boundaries أو dependency-cruiser»)؛ `@typescript-eslint` و`eslint-plugin-import` مثبتان أصلًا، وباب **Lint** في `ci.yml` يسبق Test/Build — فيتعطل الفشل مبكرًا ودون أي dependency جديدة.
2. **قائمة بيضاء لا تعطيل:** الاستثناءات الموثقة (M4) معلنة في مكان واحد (`ignores` الكتلة) — إضافة مسار مميز جديد تتطلب تعديلًا مراجَعًا في الإعداد نفسه.
3. **عدم حظر `features → container`:** `container.ts` يوثّق صراحة أن features/adapters يرجعون إلى `container.*` للعميل (نمط Browser client المقصود) — لذا القاعدة حظرت الـSDK المباشر وservice_role دون حظر الحاوية، وسُجل استعلام `activity_logs` داخل `SecurityAlertPanel` كمتابعة (بند 7.1).
4. **عدم حظر `infrastructure → adapters` المعكوسة الآن:** علاقة تاريخية موثقة (M7/M8) تتطلب عكس اتجاه فعليًا — حظرها الآن كان سيكسر سلوكًا قائمًا خارج نطاق «Enforcement».
5. **شبكتان مستقلتان للقاعدة الأمنية الأعلى:** احتواء service_role مغطى في ESLint (باب Lint) **و**vitest (باب Test) — تعطل أحدهما لا يُمرر الانتهاك.
6. **الرسائل ذاتية الشرح:** كل رسالة خطأ تشرح السبب + الإصلاح المطلوب (أين يُسمح ولماذا).

---

## 5. ملفات التغيير

**معدّلة (2):**
- `apps/admin/eslint.config.mjs` — قسم M14: 5 كتل `@typescript-eslint/no-restricted-imports` (جدول 3.1)
- `apps/admin/src/architecture/layer-boundaries.test.ts` — `describe('architecture: service-role containment (M14)')`

**لا تغييرات على:** أي كود تطبيق، قاعدة البيانات، أو ملفات CI (`ci.yml` يفشل تلقائيًا عبر باب Lint الموجود).

---

## 6. التحقق (تأكد)

### 6.1 المسار الأخضر (بعد القواعد، على main)

| الفحص | الأمر | النتيجة |
|---|---|---|
| Architecture guards | `vitest run --config vitest.unit.config.ts src/architecture/layer-boundaries.test.ts` | ✅ **754/754 PASS** |
| Lint | `eslint . --max-warnings=0` | ✅ **exit=0** (صفر مشاكل) |
| Typecheck | `tsc --noEmit` | ✅ exit=0 |
| Unit كاملة | `vitest run --config vitest.unit.config.ts` | ✅ **43 ملفًا / 1068 اختبارًا PASS** |

### 6.2 إثبات الفشل — violation مقصودة على branch اختباري (مطلوب في §18)

على branch `feature/P18-ARCH-001-violation-probe` أُنشئ ملفان:

- `src/domain/violation-probe.ts`: يستورد `next/server` + `@/lib/env` + `@/infrastructure/supabase/admin`
- `src/features/violation-probe.ts`: يستورد `@/infrastructure/supabase/admin`

| البوابة | النتيجة |
|---|---|
| `eslint` (باب CI «Lint») | ❌ **فشل — exit=1**: 3 أخطاء في domain probe (`next` framework ban + `@/lib` + admin client عبر regex الـdomain) + خطأ في features probe (`features ↛ service_role`) |
| `vitest layer-boundaries.test.ts` (باب CI «Test») | ❌ **فشل — 2 failed / 759**: `service-role containment (M14)` اكتشف الاستيرادين في الملفين |

⇒ أي PR يحوي violation مماثلًا **لا يمكن دمجه**: باب Lint في CI يتعطل مباشرة (قبل Test/Build).

### 6.3 إعادة الفحص (Re-scan)

- حُذف الـprobe وعاد العمل إلى main وحُذف الـbranch: `git status` نظيف (تغييرات M14 فقط).
- إعادة تشغيل lint + arch guard على main: ✅ exit=0 و**754/754 PASS**.

---

## 7. ما تبقّى (خارج نطاق هذه المرحلة)

1. **SecurityAlertPanel**: نقل استعلام `activity_logs` خلف adapter hook / infrastructure repo (بيانات UI يجب أن تمر بالطبقات) — لا يغيّر السلوك الظاهر.
2. **عكس العلاقة المعكوسة** `infrastructure/repos/{tenants,courses}.service → @/adapters/actions` ثم إضافة قاعدة تحظر `infrastructure → adapters` (توصية M7/M8 المؤجلة).
3. **§19 — CI/CD Production Gates**: باب Lint يغطي هذه القواعد أصلًا؛ عند الحاجة لتحليل أعمق (circular deps، مسارات transitive) يُضاف dependency-cruiser كباب صريح.
4. ESLint `no-restricted-imports` يغطي الاستيراد الساكن فقط — الاستيراد الديناميكي (`import()`) يغطيه guard الـvitest النصي ومراجعة الكود.

