# تقرير المرحلة M9 — DTO / Schema Boundary

> المرحلة: **#13 P1 — DTO / Schema Boundary** (M9 في ترتيب التنفيذ)
> التاريخ: 2026-09-02
> المنهجية: شوف → افحص → فكّر → عدّل → تأكد (نُفِّذت الحلقة كاملة مع إعادة فحص)

---

## 1) الهدف

فرض حدود DTO/Schema واضحة عند جميع نقاط العبور:
- **Request body → business logic**: لا `Record<string, unknown>` يصل للاستعلامات قبل التحقق.
- **DB row / RPC → UI**: لا `as unknown as` في `adapters/` و`features/` و`app/`.
- منع **mass-assignment** في الـupserts.

**قيود ملزمة** (من `agent_prompt_eduzone_db.md`): لا تعديل على `supabase/schema/`؛ لا كسر contract مشترك. ✔ مُلتزِم بها — كل الحلول في كود TypeScript التطبيقي.

---

## 2) النتائج (Findings) قبل التنفيذ

| # | الموقع | المشكلة | الخطورة |
|---|---|---|---|
| F9-1 | `app/api/bulk-action/route.ts:376` | `request.json() as BulkRequestBody` — لا validation، و`filters`/`params` يمرران كـ`Record<string, unknown>` مع `as string[]` لاحقًا | **عالية** (دخل عام → DB query) |
| F9-2 | `access-rules.service.ts` | `upsertAccessRule(Partial<AccessRule>)` — العميل يتحكم بـ`id`/`created_at`/`deleted_at`؛ الـUI كان يمرر `...editingRule` كاملًا | **عالية** (mass-assignment) |
| F9-3 | `AnalyticsPage.tsx` ×4 | `userStats as unknown as Record<...>` لأن RPC يرجع `refreshed_at` غير معلن في `UserStats` | متوسطة |
| F9-4 | `warnings.service.ts` | `getStudentProgress` يرجع `PaginatedResult<Record<string, unknown>>` والـUI يعيد الـcast | متوسطة |
| F9-5 | `rate-limits.service.ts` | `row as unknown as RateLimitWithEmail` spread كامل | منخفضة |
| F9-6 | `jobs.service.ts` | `data as unknown as JobStatusCounts` من RPC | منخفضة |
| F9-7 | `feature-flag.types.ts` | `null as unknown as FeatureFlag` في mapper | منخفضة (كذب على النوع) |
| F9-8 | `cleanup-duplicate-seqs/route.ts` | DB error `message` يُعاد للعميل | **خارج نطاق M9** → مؤجل لمرحلة Errors (M10) |

---

## 3) التغييرات

### 3.1 F9-1 — Zod schema لـ bulk-action (الأهم)
- **جديد**: `domain/schemas/bulk-action.schema.ts`
  - `bulkActionRequestSchema`: `action` (enum من 9 أفعال مطابقة لـ`ACTION_PERMISSIONS`)، `filters` (`.strict()` — `user_ids` UUIDs ≤500، `search` ≤200، `primary_role`، `account_status`، `tenant_id` UUID، `region_id`)، `params` (`.strict()` — `reason` ≤1000، `severity` 1|2|3 مطابقة لـCHECK constraint، `suspend_hours` 1–720، `export_format` json|csv)، `dry_run` boolean.
  - `MAX_BULK_SIZE = 500` (مصدر واحد للحقيقة — الـroute يستورده).
- `app/api/bulk-action/route.ts`:
  - حُذف `BulkRequestBody` و`VALID_ACTIONS` اليدويان؛ الـPOST يعمل `safeParse` ويرجع `INVALID_BODY` 400 مع أول issue.
  - حُذفت واجهة `UserFilterQuery` المزيفة + `applyUserFilters` + cast البنية — استعلامان مباشران بنفس قواعد الفلترة (count + fetch)، والـtenant scoping (P1-SEC-005) محفوظ كما هو.
  - `processInlineUserAction` يستقبل `BulkParamsInput` → زالت casts `Number(params.suspend_hours)` و`(params.reason as string)`.

### 3.2 F9-2 — UpsertAccessRuleInput (منع mass-assignment)
- `domain/schemas/settings.schema.ts`: `upsertAccessRuleSchema` — whitelist فقط: `id?`, `tenant_id`, `rule_type` (enum من 4), `rule_value`, `is_active`. الحقول المدارة من الخادم (`created_at`/`deleted_at`/`updated_at`) غير قابلة للتمرير.
- `adapters/actions/admin.actions.ts`: `upsertAccessRuleAction(rule: UpsertAccessRuleInput)`.
- `infrastructure/repos/access-rules.service.ts`: `upsertAccessRule` + `upsertAccessRuleAdmin` يقبلان النوع الجديد.
- `AccessRulesManager.tsx`: استبدال `{...editingRule} as AccessRule` بتمرير الحقول المسموحة صراحةً.

### 3.3 F9-3 — UserStatsDto
- `analytics.service.ts`: `export type UserStatsDto = UserStats & { refreshed_at?: string }` — `getUserStats` يرجعه. الـRPC contract المشترك لم يُمَس.
- `AnalyticsPage.tsx`: `handleExportCsv` أصبح يقبل `readonly object[]` بشكل عام → زالت الـ4 double casts في `userStats`/`courseStats`/`activity`/`geoData`.

### 3.4 F9-4 — StudentProgress DTO
- `warnings.service.ts`: `getStudentProgress` يرجع `PaginatedResult<StudentProgress>` مع mapping typed داخل الخدمة (الخدمة هي نقطة العبور).
- `StudentProgressPage.tsx`: حذف `as unknown as StudentProgress[]`.

### 3.5 F9-5/6/7 — casts محلية
- `rate-limits.service.ts`: mapping صريح للحقول whitelisted في `getActiveBlocks` بدل spread كامل.
- `jobs.service.ts`: `getJobStatusCounts` تتحقق من شكل RPC (`typeof v === 'number'`) وتُسقط إلى 0 — لا cast أعمى.
- `feature-flag.types.ts`: `mapDbRowToFeatureFlag(row | null): FeatureFlag | null` — الصف null يرجع null بصدق. `feature-flags.service.ts` تأخذ الحيّات: القوائم عبر `flatMap(... ?? [])`، والـ`.single()` يطرح `FLAG_NOT_FOUND` عند null. `FeatureFlagDbRow` أصبحت exported.
- الأنماط الثلاثة `InputLabelProps as unknown as {...}` → cast أحادي مباشر (MUI v5 type conflict بين SlotProps generations).

### 3.6 Architecture Test (قاعدة قابلة للفشل)
- `architecture/layer-boundaries.test.ts`: describe جديد **"architecture: DTO / schema boundary (M9)"**:
  - يمسح `adapters/`, `features/`, `app/` (يستثني `*.stories.*`).
  - Regex: `/\bas\s+unknown\s+as\b|\bas\s+any\b/` مع `\b` لمنع false positives (مثل "has any of").
  - `it.each` على كل ملف → رسالة فشل تصف الحل (Zod schema أو typed mapper).
  - **مُثبت الفشل**: التقطت 8 مخالفات فعلية قبل إصلاحها (AnalyticsPage comment, usePermission comment, bulk route cast, NotificationsPage×2, TenantDetailPage, FeatureFlagsPage InputLabelProps, usePermission.test.ts).

### 3.7 إصلاحات جانبية لازمة
- `usePermission.test.ts`: إعادة كتابة الـmocks بـ`vi.mocked()` + `PermissionName` من `@eduzone/types` (كان يستخدم `as any` على mocked hooks).
- `tsconfig.tsbuildinfo`: أثر بناء فقط (لا كود).

---

## 4) التحقق (تأكد + إعادة فحص)

| الفحص | النتيجة |
|---|---|
| `tsc --noEmit` (بعد `next typegen`) | **PASS** (exit 0) |
| `eslint src --max-warnings=0` (+fix مرة) | **PASS** |
| `vitest run src/architecture/layer-boundaries.test.ts` | **214/214 PASS** |
| `vitest run` (كامل) | **533 pass / 22 fail** |
| مقارنة مع HEAD نظيف (git stash → run → pop) | **نفس 10 ملفات فاشلة بنفس الاختبارات الـ22** — كلها مسبقة (3× e2e specs داخل vitest، 6× storybook chromatic، env/admin isolation، feature-flags MSW) من نطاقات سابقة |
| Blind casts في `adapters/`+`features/`+`app/` (بعد الإصلاح) | **صفر** (إعادة فحص PowerShell مستقلة) |

**إثبات عدم الانكسار**: على HEAD النظيف 382 pass؛ بعد M9 أصبح 533 pass مع **نفس** قائمة الفشل تمامًا — أي أن M9 أضاف ~151 اختبارًا ناجحًا (قاعدة الحدود الجديدة تتوسع مع كل ملف) ولم يكسر أي اختبار قائم.

ملاحظة: فشل `next typegen` staleness (`.next/types/validator.ts` قديم) أصلح بتشغيل `pnpm exec next typegen` — غير مرتبط بتغييرات M9.

---

## 5) المتبقي / التسليم للمرحلة التالية

- **F9-8** (DB error leak في cleanup route) → مرحلة Errors/logging القادمة.
- فشل vitest المسبق (e2e-inside-vitest, chromatic, MSW isolation) → خارج نطاق M9؛ يُقترح عزلها في vitest config في مرحلة بنية الاختبارات.
- قاعدة M9 ستفشل بناءً فورًا إذا أضاف أي مطوّر `as unknown as`/`as any` في الحدود — هذا هو الأثر الدائم للمرحلة.

## 6) حالة الأهداف

| Finding | الحالة |
|---|---|
| F9-1 bulk-action body | **مُصلح** (Zod + typed queries) |
| F9-2 mass-assignment | **مُصلح** (whitelist schema) |
| F9-3 Analytics casts ×4 | **مُصلح** (UserStatsDto) |
| F9-4 StudentProgress | **مُصلح** (DTO في الخدمة) |
| F9-5 rate-limits spread | **مُصلح** (explicit mapping) |
| F9-6 jobs RPC cast | **مُصلح** (shape validation) |
| F9-7 null-as-FeatureFlag | **مُصلح** (honest null + call sites) |
| F9-8 DB error leak | **مؤجل** (نطاق M10) |
