# M12 — Transaction / Concurrency / Idempotency Report

- **التاريخ:** 2026-09-03
- **المرحلة:** §16 P1 — Transaction / Concurrency / Idempotency (M12، المرحلة 12 في ترتيب التنفيذ)
- **المنهجية:** شوف → افحص → فكّر → عدّل → تأكد (حلقة كاملة مع إعادة فحص)
- **الحالة:** ✅ مكتملة — tsc صفر أخطاء، lint نظيف، **833/833 اختبار وحدة ناجح** (اختبار الحزمة الرسمي `vitest.unit.config.ts`)

---

## 1. الهدف

ضمان أن كل عملية متعددة الخطوات في التطبيق تسلك أحد المسارات الآمنة الثلاثة:

1. **ذرّية قاعدة بيانات حقيقية** (RPC واحد داخل SQL transaction / عبارة واحدة نسبّية) للعمليات الحرجة.
2. **idempotency واضحة** — إعادة الإرسال (double submit / retry) لا تُنتج نتيجة مزدوجة أو خطأ خام.
3. **تعويض (compensation) صريح ومرئي** عندما تتعذر الذرّية عبر قاعدة البيانات — لا انهيار صامت يترك حالة نصف مكتملة.

القيد الحاكم: **قاعدة بيانات مشتركة (Shared DB)** — أي حل أداء/locking يجب ألا يؤثر على مستأجرين آخرين، ولهذا رُفضت الحلول المعتمدة على `SELECT ... FOR UPDATE` واسعة النطاق لصالح زيادات نسبية ذرّية داخل SQL.

---

## 2. Current State (شوف + افحص)

جرُدت العمليات متعددة الخطوات الرئيسية وتحليل سلوكها تحت: تكرار طلب، انهيار منتصف العمل، وتزامن:

| العملية | المسار | الحالة قبل المرحلة |
|---|---|---|
| Bulk `warn` (job worker) | `app/api/bulk-action/route.ts` | ⚠️ خطوتان: insert تحذير ثم كتابة `warning_count` ملتقط (read-modify-write) |
| Reorder lessons | `courses.service.ts` → `reorderLessons` | ⚠️ N تحديثات منفصلة غير ذرّية لصفوف `lessons` |
| Create tenant | `CreateTenantUseCase` | ⚠️ pre-check للـslug ثم insert — سباق بين الإدارتين يُخرج خطأ DB خام |
| Send notification | `SendNotificationUseCase` | ⚠️ إدراج الإشعار ثم fanout — فشل الـfanout يترك إشعاراً يتيمَ البث |
| Create user | `CreateUserUseCase` | ⚠️ تعويض (deleteAuthUser) قد يفشل بصمت فيُطمر المشكلة |
| Bulk enqueue | `admin_enqueue_bulk_job` | ✅ محصّن مسبقاً: `uq_job_dedupe` (tenant+type+payload_hash خلال نافذة 60ث) + سقف قائمة الانتظار + `mapDbError` يترجم 23505 إلى `ConflictError('DUPLICATE')` |

### Findings

| # | النتيجة | الخطورة |
|---|---|---|
| **F16-1** | bulk `warn` يكتب `warning_count = snapshot + 1` من قيمة قُرئت قبل خطوات أخرى — تحذيران متزامنان لSame user يضيع أحدهما من العداد؛ وفشل الخطوة الثانية يترك تحذيراً مُدرجاً بعداد غير محدّث (نصف مكتمل) | عالية (بيانات خاطئة) |
| **F16-2** | `reorderLessons` يطلق N `UPDATE` مستقلة؛ انهيار أو تعديل متزامن في المنتصف يترك `order_index` مكرراً/متداخلاً — لا rollback | عالية |
| **F16-3** | سباق `CreateTenant`: الفحص المسبق للـslug لا يغلق السباق؛ الخاسر يرى `23505` خام بدل الخطأ المستقر `SLUG_TAKEN` | متوسطة (UX + توقّع عقد الخطأ) |
| **F16-4** | فشل `attachNotificationTargets`/`fanoutToUsers` بعد نجاح إدراج الإشعار يترك إشعاراً غير قابل للوصول لأي مستلم — والإعادة من العميل تُنشئ إشعاراً ثانياً | متوسطة |
| **F16-5** | فشل الحذف التعويضي في `CreateUserUseCase` صامت تماماً — حساب Auth يتيم دون أثر في الاستجابة أو السجلات | متوسطة (تشغيلية) |
| F16-6 | (فحص) enqueue مزدوج محمي بقيد فريد + نافذة زمنية + حد قائمة الانتظار على مستوى SQL | ✅ لا تغيير |

---

## 3. Target State (فكّر)

| # | الحل المختار (أقل تغيير آمن) | لماذا هذا الحل |
|---|---|---|
| F16-1 | استبدال الخطوتين بـRPC واحد `worker_issue_warning` (SECURITY DEFINER, service_role فقط) يُدرج التحذير ويزيد العداد **بزيادة نسبية داخل SQL** ويعيد التحقق من صلاحية `warnings.write` والـtenant للـinitiator | ذرّية حقيقية بلا أقفال تطبيقية؛ لا تأثير على مستأجرين آخرين (صف واحد)؛ server-side re-check يمنع التحايل على المسار |
| F16-2 | استخدام RPC `reorder_section_lessons` الموجود في الـschema (يتحقق أن القائمة تغطي دروس القسم بالضبط ثم يطبق `order_index` بعبارة واحدة) وحذف المسار غير الذرّي بالكامل | نفس نمط `reorder_course_sections` المُصلح في M11؛ فشل القائمة الablystale يفشل بصوت عالٍ بدل نصف تطبيق |
| F16-3 | التقاط فشل الـinsert وإعادة فحص الـslug → `ConflictError('SLUG_TAKEN')` المستقر | القيد الفريد `uq_tenants_slug_active` هو الضمانة الحقيقية؛ الاستخدام-كيس يوحّد عقد الخطأ للسباق والمسار العادي |
| F16-4 | عند فشل الـfanout: soft-delete تعويضي للإشعار اليتيم + إعادة إلقاء الخطأ الأصلي | الإشعار بلا fanout غير مرئي للجميع — الأصلح أن تفشل العملية كلها وأن تبدأ الإعادة نظيفة |
| F16-5 | فشل التعويض يُسجَّل server-side ويُلحق برسالة الخطأ المُعادة (id الحساب اليتيم) | قابلية تشغيل: المشكلة تُرى فوراً بدل ضياع الحساب |
| F16-6 | لا تغيير | محصّن على مستوى SQL |

**مرفوض صراحةً:** transactions عبر عميل Supabase متعددة الخطوات (غير مدعومة في postgrest-js)، وأقفال صفوف طويلة عبر `FOR UPDATE` من التطبيق (خطر على مستأجرين آخرين في Shared DB).

---

## 4. Dependency Impact / Shared DB Impact

- **لا تغيير في جداول ولا أعمدة ولا فهارس** — كل الحلول تستخدم دوال RPC موجودة أصلاً في `07_functions.sql` (`worker_issue_warning`, `reorder_section_lessons`) وقيداً فريداً موجوداً (`uq_tenants_slug_active`, `uq_job_dedupe`).
- `worker_issue_warning` لا قيد EXECUTE صريح لها في `10_permissions.sql`، لكن لا يوجد `REVOKE` شامل على دوال `public` — و`service_role` يملك EXECUTE عبر PUBLIC، والدالة ترفض غير `service_role` داخلياً (نفس نمط بقية دوال worker). ✅
- الزيادة النسبية داخل SQL = صف واحد لكل عملية → **صفر تأثير** على مستأجرين آخرين (Shared DB-safe).
- `feature flags` (آخر commit) خارج نطاق هذه المرحلة — upsert بالـkey مع version trigger لا يُظهر سباقاً عملياً في مسار الإدارة الحالي.

## 5. Files to Change (ما نُفّذ فعلياً)

### معدلة (9)

| الملف | التغيير |
|---|---|
| `infrastructure/repos/jobs-rpc.service.ts` | إضافة `workerIssueWarning()` — wrapper موثّق للـRPC الذرّي |
| `app/api/bulk-action/route.ts` | حالة `warn` تستخدم الـwrapper بدل خطوتي insert+count (F16-1) |
| `infrastructure/rpc/rpc-catalog.ts` | تسجيل `worker_issue_warning` (service-role) + `reorder_section_lessons` (tenant-scoped) |
| `infrastructure/repos/courses.service.ts` | `reorderLessons(sectionId, orderedIds)` عبر `reorder_section_lessons` (F16-2) |
| `adapters/mutations/courses.mutations.ts` | `useReorderLessons` يمرر `{courseId, sectionId, orderedIds}` |
| `features/courses/components/curriculum-builder/SectionCard.tsx` | يرسل الـordered ids كاملة بدل `order_index` يدوي |
| `application/use-cases/tenants/manage-tenants.use-case.ts` | fallthrough لسباق الـslug → `ConflictError` مستقر (F16-3) |
| `application/use-cases/notifications/send-notification.use-case.ts` | تعويض soft-delete عند فشل الـfanout (F16-4) |
| `application/use-cases/users/create-user.use-case.ts` | فشل التعويض غير صامت — سجل + رسالة تشمل id الحساب اليتيم (F16-5) |

### اختبارات محدثة (3)

- `courses.service.test.ts` — إعادة كتابة اختبار reorder على الـRPC.
- `manage-tenants.use-case.test.ts` — +2 اختبار سباق slug وفشل غير مرتبط.
- `send-notification.use-case.test.ts` — +3 اختبارات تعويض/فشل تعويض/لا مستلمين.
- `create-user.use-case.test.ts` — +2 اختبار فشل تعويض وحساب مفقود مسبقاً.

**ملفات جديدة:** لا شيء (التزاماً بأقل تغيير).

---

## 6. Implementation — سيناريوهات إعادة الفحص (تأكد)

| السيناريو | قبل | بعد |
|---|---|---|
| **Double submit** (نفس bulk action مرتين) | job ثانٍ يُرفض بـ`uq_job_dedupe` → `DUPLICATE` | كما هو (محصّن) — و`warn` الذرّي يعني لا عداد مزدوج حتى لو تجاوزت النافذة |
| **Concurrent update** (تحذيران متزامنان لنفس المستخدم) | العداد يضيع زيادة (read-modify-write) | `warning_count + 1` نسبّي داخل SQL واحد — لا خسارة |
| **Retry** (fanout فشل ثم أُعيد الإرسال) | إشعار يتيم + إشعار جديد = ازدواج | الإشعار اليتيم يُحذف تعويضياً؛ الإعادة نظيفة |
| **Partial failure** (reorder ينقطع في المنتصف) | `order_index` مكرر/متداخل دائم | الـRPC يرفض القائمة غير المطابقة ثم يطبّقها بعبارة واحدة — الكل أو لا شيء |
| **Compensation failure** (حذف auth user يفشل) | صمت تام | سجل خطأ + الرسالة تحمل id الحساب اليتيم |

---

## 7. Validation — الأوامر والنتائج

| الأمر | النتيجة |
|---|---|
| `pnpm exec vitest run <5 ملفات متأثرة>` (أول تشغيل) | فشل 1: توكيد `q.update` في اختبار reorder (منطق الاختبار، ليس الكود) → صُحح التوكيد |
| `pnpm exec vitest run src/infrastructure/repos/courses.service.test.ts` (إعادة) | ✅ 13/13 |
| `pnpm test` (الحزمة الرسمية `vitest.unit.config.ts`) | ✅ **833/833** (42 ملف) — بما فيها 533 اختبار architecture guard |
| `pnpm typecheck` (`tsc --noEmit`) | ✅ صفر أخطاء |
| `pnpm lint` (`eslint . --max-warnings=0`) | ✅ نظيف |
| إعادة فحص شامل | لا `.rpc()` خارج `infrastructure/` (guard M11 ضمن الـ833)؛ لا استخدام لقيم ملتقطة في كتابة عدادات |

**failing tests before:** 1 (توكيد اختبار reorder بعد تغيير التوقيع — أُصلح فوراً)
**failing tests after:** 0
**ملاحظة:** تشغيل `vitest run` الافتراضي (شامل storybook) يُظهر ~10 فشل pre-existing في بيئة browser (jsdom/MSW) غير مرتبطة بهذه المرحلة — نفس نمط ما وُثّق في تقرير M11، ومعالجته موصى بها في مرحلة CI/QA.

---

## 8. Regression Check

- `createLesson/updateLesson/deleteLesson` لم تُمس — اختباراتها خضراء.
- `reorderSections` (M11) سليم؛ أُضيف شقيقه `reorder_section_lessons` للكتالوج بنفس التصنيف.
- مسارات bulk الأخرى (`suspend`, `activate`, `delete`) لم تُغير منطقها.
- architecture guard (533 اختبار) أخضر → لا `.rpc()` عشوائية ولا تسريب طبقات.

## 9. Exit Criteria — قاعدة إغلاق المرحلة §27

```text
Observed  ✓ جرد العمليات متعددة الخطوات الخمس + مسار enqueue
Inspected ✓ تحليل double submit / mid-flight crash / concurrency لكل عملية
Reasoned  ✓ اختيار أقل تغيير آمن لكل finding (وإقصاء الحلول المرفوضة صراحة)
Changed   ✓ 9 ملفات + 4 ملفات اختبار (F16-1..F16-5؛ F16-6 محصّن أصلاً)
Verified  ✓ tsc صفر / lint نظيف / 833/833 وحدة
Re-scanned✓ جدول السيناريوهات §6 أعيد فحصه بعد التعديل — كلها خضراء
```

## 10. Remaining Risks

1. **فجوة EXECUTE صريحة:** `worker_issue_warning` (وبقية دوال worker) بلا سطر GRANT صريح في `10_permissions.sql` — تعمل عبر PUBLIC؛ يُوصى بإضافة GRANT/REVOKE صريح في مرحلة الـSQL lint (P1 لاحقة).
2. **اختبارات storybook/jsdom pre-existing** (~10): خارج النطاق — مرحلة CI/QA.
3. **fanout تعويضي وليس ذرّياً:** `insertNotification` و`fanoutToUsers` ما زالا منفصلين (قيود postgrest-js)؛ التعويض يغطي الفجوة عملياً. الحل الجذري (RPC واحد admin_send_notification) مرشّح لمرحلة تحسين لاحقة إن ظهرت مشاكل فعلية.
4. **تحديث Execution Plan:** تعليم بند Transaction/Idempotency كمكتمل + M12 في جدول التتبع.
