# خطة تنفيذ أربع ميزات جديدة — EduZone Admin Dashboard

> **الحالة:** مقترح معتمد للتنفيذ | **التاريخ:** 2026-09-24 | **الفرع:** production-readiness
>
> الميزات: البحث الشامل (Global Search) · صفحة صحة النظام (System Health) · مركز النسخ الاحتياطي والتصدير (Backup & Export Center) · لوحة التحكم القابلة للتخصيص (Customizable Dashboard)

---

## 📌 اكتشافات من الكود الحالي تؤثر على الخطة

| الاكتشاف | الأثر |
|---|---|
| `@dnd-kit/core` + `@dnd-kit/sortable` مثبّتة في `apps/admin` | اللوحة القابلة للتخصيص لا تحتاج مكتبات جديدة |
| Edge Functions‏ `bulk-export` و`export-report` موجودة في `supabase/functions/` | مركز التصدير يبني عليها بدل البدء من الصفر |
| RPC `getSystemHealth` + hook `useSystemHealth` موجودان (`src/adapters/queries/analytics.queries.ts`) | صفحة الصحة لها أساس جاهز |
| لا يوجد `cmdk` ولا Radix — المكونات مبنية يدوياً في `src/components/ui/` | نبني CommandPalette فوق `Modal.tsx` الموجود بنفس النمط |
| إضافة route جديد تتطلب تحديث 4 أماكن | `src/config/nav.config.ts` · `src/config/route-access.config.ts` (له اختبار lockstep يجب تحديثه) · `layout.tsx` مع `page-guard` · الترجمات `messages/ar.json` و`en.json` |
| نظام المهام غير المتزامنة جاهز | `internal.job_queue` + RPCs‏ `admin_get_jobs`/`admin_cancel_job`/`admin_retry_job` + تقدّم realtime عبر `postgres_changes` |
| Rate limiting جاهز | RPC `check_rate_limit` (DB-backed, SECURITY DEFINER) |

---

## 🧱 أرضية مشتركة لكل الميزات

كل ميزة جديدة تتبع البنية القائمة:

```
apps/admin/src/features/<feature>/
  ├── components/     # مكونات الصفحة
  ├── hooks/          # React Query hooks (adapters)
  └── index.ts        # exports
```

ويُرافق كل ميزة:

- توثيق أي RPC جديد في `src/infrastructure/rpc/rpc-catalog.ts`
- إضافة الـ RPC لقائمة `supabase/schema/VALIDATION.sql`
- ترجمات كاملة في `apps/admin/messages/ar.json` و`en.json`
- مخططات DB في ملفات `supabase/schema/` المرقّمة (03_tables / 05_indexes / 07_functions / 09_rls / 10_permissions)

---

## 🔍 الميزة 1: البحث الشامل (Global Search — Ctrl+K)

### 1) قاعدة البيانات

- **RPC جديد** في `supabase/schema/07_functions.sql`:

  ```sql
  search_all(p_query TEXT, p_limit INT DEFAULT 8)
  ```

  - `SECURITY DEFINER` مع فحص الدور داخل الدالة:
    - المعلم: كورساته وطلابه فقط
    - الأدمن: ضمن مستأجره
    - super_admin: كل شيء بما فيه المستأجرين والمهام
  - يبحث في: `users` (الاسم/الإيميل)، `courses` (العنوان)، `tenants` (super_admin)، `jobs` (super_admin)
  - إرجاع JSON موحّد: `{entity, id, title, subtitle, href}`

- **فهارس** في `05_indexes.sql`: التحقق من تفعيل `pg_trgm` في `01_extensions.sql` + فهارس `GIN` على `users.full_name` و`courses.title` لدعم `ILIKE` السريع.
- أذونات في `10_permissions.sql` + سياسات في `09_rls.sql`.

### 2) الواجهة

| الملف | الوصف |
|---|---|
| `src/components/ui/CommandPalette.tsx` | مكوّن جديد فوق `Modal.tsx`: حقل بحث + قائمة نتائج + تنقل بالأسهم + Enter |
| `src/features/search/components/GlobalSearch.tsx` | منطق البحث: debounce 250ms + React Query |
| `src/features/layout/components/Topbar.tsx` | زر بحث يعرض اختصار `Ctrl K` |
| `src/features/layout/components/AdminShell.tsx` | تسجيل الاختصار العام (`metaKey`/`ctrlKey` + `K`) و`/` للتركيز |

### 3) السلوك

- نتائج مجمّعة بأقسام (مستخدمون / كورسات / مستأجرون / مهام) مع أيقونة لكل نوع.
- Enter ينتقل للصفحة عبر `@/i18n/routing` (يحافظ على اللغة).
- دعم RTL كامل + حالة فارغة و"لا نتائج" + حد أدنى 2 حرف للبحث.

**⏱️ التقدير: 3–4 أيام | الحجم: صغير–متوسط | المخاطر: منخفضة**

---

## 💓 الميزة 2: صفحة صحة النظام (System Health)

### 1) قاعدة البيانات

توسيع RPC `getSystemHealth` الموجود + إضافة RPCs جديدة (كلها super_admin فقط، بنمط فحص الدور داخل `admin_get_jobs`):

```sql
admin_get_queue_depth_by_type()     -- عمق الطابور حسب job_type
admin_get_cron_jobs()               -- حالة مهام cron.job (آخر تشغيل/فشل)
admin_get_recent_slow_queries()     -- من audit.slow_query_log الموجود
admin_get_failed_jobs_24h()         -- المهام dead/failed خلال 24 ساعة
```

### 2) الواجهة

| الملف | الوصف |
|---|---|
| `app/[locale]/system-health/page.tsx` + `layout.tsx` | route جديد مع `page-guard` (super_admin فقط) |
| `features/system-health/components/SystemHealthPage.tsx` | الصفحة الرئيسية |
| `.../HealthOverviewCards.tsx` | بطاقات: حالة عامة (Healthy/Degraded/Down)، عمق الطابور، backlog الأنشطة، زمن قاعدة البيانات |
| `.../QueueDepthChart.tsx` | رسم بياني حسب نوع المهمة |
| `.../CronJobsTable.tsx` | جدول مهام pg_cron مع حالة آخر تشغيل |
| `.../IncidentsTable.tsx` | المهام الفاشلة خلال 24 ساعة + زر إعادة المحاولة (`admin_retry_job` موجود) |

### 3) التكاملات

- تحديث تلقائي كل 15 ثانية (نمط `useSystemHealth`) + اشتراك `postgres_changes` على `job_queue`.
- بانر تنبيه في `AdminShell` (بنمط `MaintenanceBanner`) يظهر عند حالة Degraded.
- رابط من `QueueHealthPanel` الموجود في الداشبورد.
- تحديث `route-access.config.ts` + اختبار الـ lockstep الخاص به.

**⏱️ التقدير: 4–5 أيام | الحجم: متوسط**


---

## 📦 الميزة 3: مركز النسخ الاحتياطي والتصدير (Backup & Export Center)

### 1) البنية الخلفية (تبني على `bulk-export` الموجود)

- **أنواع مهام جديدة** في `job_queue`: `export_users`, `export_courses`, `export_enrollments`, `export_tenant_full`.
- **توسيع Edge Function `bulk-export`**: توليد CSV/JSON على دفعات → رفع إلى **Storage bucket جديد** `exports` (خاص؛ RLS: المالك + super_admin فقط) → حفظ مسار الملف في `payload` الخاص بالمهمة.
- **جدول جديد** `public.export_requests` في `03_tables.sql`:

  ```sql
  id, tenant_id, requester_id, entity, format, filters jsonb,
  job_id → internal.job_queue, file_path, expires_at, created_at
  ```

  + RLS (المستأجر يرى تصديراته فقط) + تنظيف تلقائي عبر pg_cron بعد 7 أيام.

- **RPCs**:
  - `admin_request_export()` — تحقق + rate-limit عبر `check_rate_limit` + enqueue
  - `admin_list_exports()`
  - `admin_get_export_download_url()` — signed URL بمدة 15 دقيقة

### 2) الواجهة

| الملف | الوصف |
|---|---|
| `app/[locale]/exports/page.tsx` + `layout.tsx` | route جديد (super_admin + admin) |
| `features/exports/components/ExportWizard.tsx` | معالج: الكيان → الصيغة (CSV/JSON) → الفلاتر → تأكيد |
| `features/exports/components/ExportsTable.tsx` | سجل التصديرات مع حالة المهمة realtime (نمط `JobsPage`) + زر تنزيل |
| `features/exports/hooks/useExports.ts` | استعلامات + طلب تصدير |

### 3) توضيح مهم

النسخ الاحتياطي على مستوى قاعدة البيانات الكاملة (pg_dump/PITR) هو مسؤولية Supabase/العمليات. هذا المركز يوفّر **تصديراً منطقياً** للبيانات، مع عرض حالة آخر نسخة احتياطية للنظام بشكل read-only.

**⏱️ التقدير: 6–8 أيام | الحجم: الأكبر | المخاطر: تكلفة التخزين (تُحل بانتهاء الصلاحية) + حدود حجم التصدير (تقسيم على دفعات داخل الـ worker)**

---

## 🧩 الميزة 4: لوحة التحكم القابلة للتخصيص

### 1) قاعدة البيانات

```sql
-- 03_tables.sql
CREATE TABLE public.dashboard_layouts (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  layout     JSONB NOT NULL,  -- [{id, x, y, w, visible}]
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

- RLS: المستخدم يقرأ/يكتب تخطيطه فقط.
- RPCs‏ `api_get_dashboard_layout()` / `api_save_dashboard_layout(p_layout)` (بنمط `api_update_profile`).

### 2) الواجهة

| الملف | الوصف |
|---|---|
| `features/dashboard/widgets/registry.tsx` | سجل الودجات: `{id, titleKey, component, defaultSize, roles[]}` — كل بطاقة موجودة في `AdminDashboard` تتحول لودجت |
| `features/dashboard/components/DashboardGrid.tsx` | شبكة `DndContext` + `SortableContext` (dnd-kit مثبتة ✔️) |
| `features/dashboard/components/WidgetWrapper.tsx` | إطار موحد: عنوان + زر إخفاء + مقبض سحب (يظهر في وضع التحرير) |
| `features/dashboard/hooks/useDashboardLayout.ts` | جلب + حفظ debounced (1s) + reset للافتراضي |
| تعديل `AdminDashboard.tsx` و`TeacherDashboard.tsx` | عرض عبر السجل مع افتراضيات مختلفة لكل دور |

### 3) السلوك

- زر "تخصيص" يفعّل وضع التحرير: سحب لإعادة الترتيب + إظهار/إخفاء الودجات.
- الحفظ لكل مستخدم، مع fallback للتخطيط الافتراضي حسب الدور.
- تخزين مؤقت في Zustand للعرض الفوري، والمزامنة مع القاعدة.

**⏱️ التقدير: 4–5 أيام | الحجم: متوسط | المخاطر: منخفضة**

---

## 🗓️ الترتيب المقترح للتنفيذ

| المرحلة | الميزة | المدة | السبب |
|---|---|---|---|
| **1** | البحث الشامل | 3–4 أيام | الأصغر، قيمة فورية، لا يغيّر schema حساس |
| **2** | صحة النظام | 4–5 أيام | يخدم هدف production-readiness + يبني على RPC موجود |
| **3** | لوحة التحكم القابلة للتخصيص | 4–5 أيام | مستقل تماماً، يحسّن الداشبورد الحالي |
| **4** | مركز التصدير | 6–8 أيام | الأكبر والأكثر حساسية (Storage + صلاحيات) — يُترك للنهاية |

**الإجمالي التقريبي: 3.5–4 أسابيع** للميزات الأربع شاملة الاختبارات.

---

## ✅ معايير الجودة لكل ميزة (حسب أعراف المشروع)

- [ ] اختبارات Vitest للـ hooks/services + تحديث MSW handlers في `tests/mocks`
- [ ] اختبارات Playwright e2e (`tests/e2e/`)
- [ ] Storybook stories للمكونات الجديدة (`*.stories.tsx`)
- [ ] تحديث `rpc-catalog.ts` و`VALIDATION.sql` لأي RPC جديد
- [ ] ترجمات عربي/إنجليزي كاملة + تحقق RTL
- [ ] مراجعة RLS لأي جدول جديد
- [ ] تسجيل العمليات الحساسة في سجل التدقيق عبر `log_activity_async`
