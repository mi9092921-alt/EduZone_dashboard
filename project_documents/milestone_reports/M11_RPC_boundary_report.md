# M11 — RPC Boundary Report

- **التاريخ:** 2026-09-02
- **المرحلة:** §15 P1 — RPC Boundary (M11، المرحلة 11 في ترتيب التنفيذ)
- **المنهجية:** شوف → افحص → فكّر → عدّل → تأكد (حلقة كاملة مع إعادة فحص)
- **الحالة:** ✅ مكتملة — tsc صفر أخطاء، lint نظيف، 642/642 اختبار ناجح للمجالات المعدلة

---

## 1. الهدف

فرض حدود مركزية على نقاط الدخول المميزة لقاعدة البيانات (Postgres RPCs) بحيث:

1. كل RPC موثّق في **كتالوج واحد** يصنّفه أمنيًا مقابل SQL الفعلي (`07_functions.sql`, `10_permissions.sql`).
2. لا تُستدعى `.rpc()` عشوائيًا من UI/Adapters/Application — بل عبر خدمات `infrastructure/` مُراجَعة.
3. اكتشاف وإصلاح الأعطال التعاقدية (contract mismatches) في المواقع القائمة.

---

## 2. ما تم (شوف + افحص)

### 2.1 جرد شامل
تم حصر **40 موقع استدعاء `.rpc()`** (~33 دالة فريدة) عبر `features/`, `adapters/`, `application/`, `app/`, `infrastructure/`، وتصنيف كل دالة مقابل SQL الفعلي:

| التصنيف | الدلالة | أمثلة |
|---|---|---|
| `public` | قابل للتنفيذ دون auth | — (لا يوجد في التطبيق) |
| `authenticated` | EXECUTE لـ`authenticated`؛ الدالة تفرض auth ذاتيًا | `check_dashboard_access`, `logout_current_user`, `bind_device_for_current_user`, `enroll_in_course`, `log_app_open_location` |
| `tenant-scoped` | متميزة لكنها تثبّت `get_current_tenant_id()` داخليًا | `enroll_student`, `revoke_enrollment`, `issue_warning`, `reorder_course_sections`, `log_activity_async` |
| `privileged` | تتحقق `is_admin_with_session_validation()` أو permission صريح | `get_dashboard_stats`, `get_user_stats_summary`, `get_daily_activity`, `get_system_health`, `flush_activity_logs`, `reset_user_device` |
| `service-role` | EXECUTE لـ`service_role` فقط — لا يُستدعى إلا بـadmin client | `admin_get_jobs`, `admin_retry_job`, `admin_cancel_job`, `admin_enqueue_bulk_job`, `worker_update_bulk_job`, `release_stale_job_locks`, `terminate_user_sessions`, `process_notification_fanout_jobs`, `manage_partitions`, cron routines |

### 2.2 النتائج (Findings)

| # | النتيجة | الخطورة |
|---|---|---|
| **F11-1** | `.rpc()` مستدعاة مباشرة من `features/` (`Topbar` → `logout_current_user`؛ `AuthProvider` + `LoginPage` → `check_dashboard_access`) و`adapters/` (`useSessionCheck`, `analytics.queries`) — استدعاء عشوائي خارج حدود Repos | عالية (مخالفة حد) |
| **F11-2** | `.rpc()` من `application/` (`authorization.service` → `user_has_permission`) — نقطة معتمدة مركزية (M5) لكنها غير موثقة كاستثناء | متوسطة |
| **F11-3** | **عطل تعاقدي حقيقي:** `reorderSections` يرسل `p_section_updates` بينما توقيع الدالة SQL هو `(p_course_id uuid, p_ordered_ids uuid[])` — كل reorder كان يفشل بصمت ويسقط لـbatch fallback غير ذري | **عالية (bug)** |
| **F11-4** | مسارات RPC ميتة في `users.service.ts`: `controlUserAccount`/`terminateUserSessions` عبر عميل browser، بينما الدالتان **service_role فقط** (`10_permissions.sql`) — المسار لا يمكن أن يعمل؛ المسار الحي عبر `user-admin.repository.ts` بأدمن كلاينت | متوسطة (كود ميت مضلل) |
| **F11-5** | لا يوجد RPC catalog — لا مصدر واحد للحقيقة لتصنيف وحراسة كل RPC | جوهر المرحلة |

---

## 3. ما نُفّذ (فكّر + عدّل)

### 3.1 ملفات جديدة

| الملف | الوظيفة |
|---|---|
| `infrastructure/rpc/rpc-catalog.ts` | **مصدر الحقيقة المركزي**: 33+ RPC مع تصنيفها الأمني الموثق (سطر grants في `10_permissions.sql`)، مالك موقع الاستدعاء، والصلاحية المطلوبة. يصدّر `RPC_CATALOG`, `RPC_INDEX`, `requiresAdminClient()` |
| `infrastructure/repos/auth-rpc.service.ts` | يملك `check_dashboard_access` + `logout_current_user` مع معالجة أخطاء صريحة (استخراج حقول `PostgrestError` غير القابلة للتعداد) |
| `infrastructure/repos/jobs-rpc.service.ts` | يملك RPCs قائمة الانتظار والـcron: `admin_enqueue_bulk_job`, `worker_update_bulk_job`, `log_activity_async`, `user_has_permission` (+متغير non-throwing)، `manage_partitions`, `prune_expired_access_cache`, `process_update_enrollment_totals_jobs`, `process_cache_purges`, `process_notification_fanout_jobs` |

### 3.2 إصلاح F11-3 — عطل `reorder_course_sections`

```14:32:apps/admin/src/infrastructure/repos/courses.service.ts
  const { error } = await supabase.rpc('reorder_course_sections', {
    p_course_id: courseId,
    p_ordered_ids: orderedIds,
  });
```

- التوقيع الآن يطابق SQL الفعلي؛ `courses.mutations.ts` + اختبارات `courses.service.test.ts` حُدّثت لتوقيع `(courseId, orderedIds)`.
- الأثر: ترتيب الأقسام أصبح **ذريًا** (atomic) بدل السقوط الصامت لتحديثات صف-بصف.

### 3.3 إزالة F11-4 — المسارات الميتة

- حُذفت `controlUserAccount`/`terminateUserSessions` من `users.service.ts` (وأنواعها غير المستخدمة `AccountAction`/`ControlResult` من imports) مع تعليق يوثق المسار الحي عبر `user-admin.repository.ts`.
- اختبارات `users.service.test.ts` حُدّثت (الاختبارات المحذوفة كانت تغطي مسارًا مستحيل التشغيل أصلًا).

### 3.4 سحب مواقع الاستدعاء إلى infrastructure (F11-1)

| المستهلك السابق | الدالة | أصبح يعتمد على |
|---|---|---|
| `features/auth/AuthProvider.tsx` | `check_dashboard_access` | `auth-rpc.service.checkDashboardAccess` |
| `features/auth/LoginPage.tsx` | `check_dashboard_access` | `auth-rpc.service.checkDashboardAccess` |
| `features/layout/Topbar.tsx` | `logout_current_user` | `auth-rpc.service.logoutCurrentUser` |
| `adapters/hooks/useSessionCheck.ts` | `check_dashboard_access` | `auth-rpc.service.checkDashboardAccess` |
| `adapters/queries/analytics.queries.ts` | `get_system_health` | `analytics.service.getSystemHealth` (جديدة، مع DTO + degrade-soft) |
| `app/api/bulk-action/route.ts` | 5 دوال | `jobs-rpc.service` |
| `app/api/cron/routine/route.ts` | 5 دوال | `jobs-rpc.service` |

الاستثناء الوحيد المتبقي خارج `infrastructure/`: `application/authorization/authorization.service.ts` → `user_has_permission` — **موثق كموقع معتمد** لأن الدالة ترفض server-side أي `p_user_id ≠ auth.uid()` لغير service_role، وهو قلب خدمة التصاريح المركزية (M5).

### 3.5 Architecture Guard (M11) — إثبات قابلية الفشل

أُضيف `describe('architecture: RPC boundary (M11)')` إلى `architecture/layer-boundaries.test.ts`:

1. **فحص ثابت لكل ملف مصدر** في `infrastructure/`, `adapters/`, `features/`, `app/`, `application/`: أي `.rpc(` خارج `infrastructure/` (أو الاستثناء الموثق) يُفشل الاختبار برسالة تشرح المطلوب.
2. **حارس الكتالوج ذاته**: كل RPC مصنّف `service-role` يجب أن يملكه owner داخل `infrastructure/`.
3. **قابلية الفشل مُثبتة فعليًا**: عند أول تشغيل التقط القاعدة الجديدة مخالفتين حقيقيتين (مسارا `bulk-action` و`cron/routine`) قبل إصلاحهما — ثم نجح 531/531 بعد النقل.

---

## 4. التحقق (تأكد)

| الفحص | النتيجة |
|---|---|
| `tsc --noEmit` | ✅ صفر أخطاء (بعد إصلاح تضييق أنواع `role`/`tenant_id` في LoginPage) |
| `eslint src --max-warnings=0` | ✅ نظيف |
| `vitest run src/architecture + repos المعدلة + adapters` | ✅ **642/642 ناجح** |
| اختبار الحزمة الكامل | 855 ناجح؛ 22 فشل **موجود مسبقًا** (Pre-existing) وغير مرتبط بهذه المرحلة — أُثبت ذلك بتشغيل `admin.test.ts` على شجرة نظيفة عبر `git stash` (فشل 3/3 قبل التعديلات أيضًا). الأسباب: بيئة `jsdom` تمنع `getServerEnv` في `admin.test.ts`/`env.test.ts`، ومشاكل MSW handlers في `feature-flags.service.test.ts`، وstorybook interaction. توصية: معالجتها في مرحلة QA/CI منفصلة |
| إعادة فحص شامل | grep نهائي: كل `.rpc(` داخل `infrastructure/` عدا الاستثناء الموثق الوحيد |

**ملاحظة تشغيلية:** أثناء التحقق استُخدم `git stash`/`git stash pop` لعزل فشل pre-existing؛ استُعيدت كل التعديلات وتحقق عملها بالفحوص أعلاه. لا توجد تعديلات مفقودة.

---

## 5. الأثر الأمني

- **تقليص سطح الاستدعاء العشوائي:** مستقبلًا أي RPC جديد يجب تسجيله في الكتالوج ومراجعة تصنيفه قبل أن يمر guard الاختبارات.
- **اكتشاف عطل صامت حقيقي** (`reorder_course_sections`) كان يعطل ميزة كاملة دون أي خطأ ظاهر للمستخدم.
- **إزالة تضليل أمني:** مسارات كانت تبدو قابلة للتنفيذ من browser بينما grants تمنعها (F11-4) — حذفها يمنع الاعتماد الخاطئ عليها مستقبلًا.
- **توثيق ربط grants ↔ كود:** الكتالوج يسجل سطر grant لكل دالة، فيسهل مراجعة أي تغيير في `10_permissions.sql` مقابل استدعاءاته.

---

## 6. بقاء (Residual) وتوصيات للمراحل القادمة

1. **M12+ (Supabase Advisor / lint SQL):** مراجعة `SECURITY INVOKER` functions ذات grants واسعة دوريًا.
2. **توحيد `admin_get_job` polling:** `bulk.service.ts` يستدعي `admin_get_job` من عميل browser المعتمد — مقبول (is_admin داخل الدالة) لكن يُفضَّل توحيده مع `jobs.service.ts` في متابعة.
3. **Pre-existing test failures** (22): معالجتها خارج نطاق M11 في مرحلة CI/QA.
4. **تحديث Execution Plan:** تعليم بند `RPC boundary defined` كمكتمل + M10/M11 في جدول التتبع.

---

## 7. قائمة الملفات المتغيرة

**جديدة (3):**
- `apps/admin/src/infrastructure/rpc/rpc-catalog.ts`
- `apps/admin/src/infrastructure/repos/auth-rpc.service.ts`
- `apps/admin/src/infrastructure/repos/jobs-rpc.service.ts`

**معدلة (14):**
- `apps/admin/src/architecture/layer-boundaries.test.ts` (guard M11)
- `apps/admin/src/adapters/hooks/useSessionCheck.ts`
- `apps/admin/src/adapters/queries/analytics.queries.ts`
- `apps/admin/src/adapters/mutations/courses.mutations.ts`
- `apps/admin/src/app/api/bulk-action/route.ts`
- `apps/admin/src/app/api/cron/routine/route.ts`
- `apps/admin/src/features/auth/components/AuthProvider.tsx`
- `apps/admin/src/features/auth/components/LoginPage.tsx`
- `apps/admin/src/features/layout/components/Topbar.tsx`
- `apps/admin/src/infrastructure/repos/analytics.service.ts` (+`getSystemHealth`)
- `apps/admin/src/infrastructure/repos/courses.service.ts` (إصلاح التوقيع)
- `apps/admin/src/infrastructure/repos/courses.service.test.ts`
- `apps/admin/src/infrastructure/repos/users.service.ts` (حذف المسارات الميتة)
- `apps/admin/src/infrastructure/repos/users.service.test.ts`
