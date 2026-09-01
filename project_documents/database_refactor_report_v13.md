# Database Refactor Report (v13)

## Current Issues

- Canonical schema drift: `Eduzone_schema_v13.sql` كان غير متزامن مع `supabase/migrations/20260517..20260523` لبعض RPCs.
- Job queue root-cause mismatch: `internal.job_queue` يستخدم `locked_by_worker_id` بينما وظائف مثل `internal.dequeue_job` و`public.release_stale_job_locks` كانت تحدث عمود `locked_by`.
- Invalid status transition: `public.admin_cancel_job` كان يكتب `cancelled` رغم أن قيد `internal.job_queue.status` يسمح بـ `pending|processing|done|failed|dead`.
- Missing worker/admin RPCs in canonical baseline: غياب `public.admin_get_job`, `public.admin_enqueue_bulk_job`, و`public.worker_*` من الملف الرئيسي.
- Duplicate view definitions: تكرار تعريفات `public.users_active`, `public.enrollments_active`, `public.courses_active`, `public.lessons_active` داخل نفس schema.
- Security consistency gap: استدعاءات `extensions.encrypt` / `extensions.digest` كانت تعتمد على وجود دوال schema-qualified غير مضمونة في جميع البيئات.
- Supabase local config drift: `supabase/config.toml` كان يحتوي `schema_paths = []` و`sql_paths = ["./seed.sql"]` رغم عدم وجود `supabase/seed.sql`.
- Patch-bloat indicators: وجود integrated patch sections وعبارات grant/drop متكررة يزيد تكلفة الصيانة ويرفع احتمالية drift.

## Structural Improvements

- توحيد منطق Job Queue ليتبع بنية الجدول الفعلية (`locked_by_worker_id`) في كل الدوال الحرجة.
- إدخال RPCs الناقصة في الـ baseline (`Eduzone_schema_v13.sql`) لإلغاء الاعتماد التشغيلي على patch migrations المتسلسلة.
- إزالة التكرار الواضح في تعريفات الـ views والإبقاء على canonical definition واحدة.
- إضافة طبقة توافق آمنة لدوال `extensions.digest/encrypt/decrypt`.
- تفعيل `security_invoker` على views العامة ذات الحساسية الأمنية لخفض مخاطر bypass.
- تهيئة `supabase/config.toml` لاستخدام المصدرين المقدسين:
  - `../Eduzone_schema_v13.sql`
  - `../Eduzone_seed_qa.sql`
- إنشاء ملفات تقسيم بنيوي في `supabase/schema/01..11` كمنظور تنظيمي مشتق من المصدر الرئيسي.

## Removed Redundancies

> لا يوجد حذف فعلي لملفات migrations أو ملفات مقدسة في هذه المرحلة.

- تمت إزالة التكرار الداخلي لتعريفات active views ضمن `Eduzone_schema_v13.sql` (الإبقاء على النسخة canonical).
- عناصر مرشحة للحذف لاحقًا (بعد موافقة صريحة):
  - `supabase/migrations/20260517_create_enqueue_job.sql`
  - `supabase/migrations/20260518_fix_admin_cancel_job.sql`
  - `supabase/migrations/20260519_fix_admin_get_jobs.sql`
  - `supabase/migrations/20260520_fix_dequeue_job.sql`
  - `supabase/migrations/20260521_worker_update_bulk_job.sql`
  - `supabase/migrations/20260522_worker_bulk_user_actions.sql`
  - `supabase/migrations/20260523_admin_get_job.sql`
- سبب الترشيح: وظائفها تم نقلها/توحيدها داخل الـ canonical baseline لتقليل patch chain.

## Migration Strategy

1. اعتماد `Eduzone_schema_v13.sql` + `Eduzone_seed_qa.sql` كمصدر وحيد للحقيقة.
2. دمج fixes/RPCs الحرجة في baseline أولًا (تم).
3. إعادة تهيئة Supabase local عبر `config.toml` لاستهلاك المصدر الرئيسي مباشرة (تم).
4. الحفاظ على ملفات migrations الحالية مؤقتًا إلى حين موافقة صريحة على الحذف.
5. بعد الموافقة:
   - نقل ملفات migrations المرشحة إلى `_archived_patches/` أو حذفها.
   - الإبقاء فقط على migrations المستقبلية الجوهرية.
6. تنفيذ smoke tests على RPCs الأساسية قبل أي تنظيف نهائي.

## Final Architecture

- Canonical source:
  - `Eduzone_schema_v13.sql`
  - `Eduzone_seed_qa.sql`
- Structured mirrors for maintainability:
  - `supabase/schema/01_extensions.sql`
  - `supabase/schema/02_types.sql`
  - `supabase/schema/03_tables.sql`
  - `supabase/schema/04_constraints.sql`
  - `supabase/schema/05_indexes.sql`
  - `supabase/schema/06_views.sql`
  - `supabase/schema/07_functions.sql`
  - `supabase/schema/08_triggers.sql`
  - `supabase/schema/09_rls.sql`
  - `supabase/schema/10_permissions.sql`
  - `supabase/schema/11_seed_reference.sql`
- Runtime alignment:
  - Job worker flow موحد على `internal.workers` + `internal.job_queue`.
  - Admin/worker RPCs موجودة داخل baseline بدل الاعتماد على hotfix migrations.

## Risk Assessment

- Medium: إضافة/تعديل RPCs واسعة التأثير قد تؤثر على clients التي تعتمد signatures قديمة.
- Medium: `security_invoker` على views قد يغير سلوك وصول متوقع في بعض الاستعلامات غير المحمية.
- Low-Medium: ملفات `supabase/schema/01..11` هي مشتقات تنظيمية؛ يجب إعادة توليدها عند أي تعديل على canonical.
- Low: طبقة توافق `extensions.*` تقلل احتمال كسر دوال PII/hash في البيئات المختلفة.
- High if skipped: عدم اختبار job queue end-to-end قد يُبقي تعارضات تشغيلية غير مكتشفة.

## Validation Checklist

- Verify `internal.dequeue_job` writes `locked_by_worker_id`.
- Verify `public.release_stale_job_locks` clears `locked_by_worker_id`.
- Verify `public.admin_cancel_job` writes status `dead`.
- Verify `public.admin_get_job` works for single job polling.
- Verify worker RPCs (`public.worker_*`) executable by `service_role`.
- Verify `supabase db reset` resolves canonical schema + seed paths.
