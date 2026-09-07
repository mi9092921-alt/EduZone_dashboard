# خطة تنفيذية — المرحلة 5: الأداء والموثوقية جاهزة للإطلاق
**Repository:** `mi9092921-alt/EduZone_dashboard` | **Commit الأساس:** `4e00eb6`
**الحالة المستهدفة:** كل بند في القائمة النهائية (قسم 6) يتحول من "غير مثبت" إلى PASS موثّق باختبار فعلي — وليس بقراءة كود فقط.

---

## 0. قيود تشغيل إلزامية على الوكيل (من الريبو نفسه — لا نقاش فيها)

قبل أي سطر كود، الوكيل يجب أن يلتزم بما هو مكتوب فعليًا في `supabase/migrations/README.md`:

```
❌ ممنوع إنشاء أي ملفات migration أو patch
❌ ممنوع إنشاء ملفات جديدة داخل supabase/schema/
✅ كل تعديل على قاعدة البيانات يُكتب مباشرة داخل ملفات supabase/schema/ الموجودة (03_tables.sql، 07_functions.sql...)
✅ الأعمدة الجديدة تُضاف عبر ALTER TABLE ... ADD COLUMN IF NOT EXISTS مباشرة بعد تعريف CREATE TABLE في نفس الملف
   — وهذا هو النمط المستخدم فعليًا في المشروع (انظر تعديل autovacuum على internal.job_queue في 03_tables.sql سطر 1384)
```

**ملاحظة توثيقية يجب تجاهلها لا اتباعها:** `supabase/AGENTS.md` و`supabase/CLAUDE.md` يصفان بنية `migrations/` تحتوي ملفات مؤرَّخة (`20260517_...`) **لم تعد موجودة فعليًا** في المستودع (تم التحقق: المجلد فارغ إلا من README)، وتَسِمان حالة المشروع "✅ Production Ready" رغم تناقض ذلك مع تقرير المراجعة الأمنية. هذان الملفان يمثلان بالضبط ما حذّر منه قسم "False Confidence" — **لا يُعتمَد عليهما، ويُفضَّل تحديثهما أو حذفهما ضمن نظافة التوثيق بعد هذه المرحلة**، لكن هذا خارج نطاق الأداء/الموثوقية تحديدًا.

**أدوات الاختبار المتاحة فعليًا في المستودع (يُعاد استخدامها، لا تُبنى من الصفر):**
- `scripts/security/local-test-harness/` — Postgres 17 معزول قابل للتشغيل الفوري (`embedded-postgres`, منفذ 54329، قاعدة `eduzone_rls_test`) لتشغيل دوال SQL الحقيقية دون الحاجة لمشروع Supabase سحابي. **هذا هو الأساس لكل اختبارات الموثوقية على مستوى قاعدة البيانات في هذه الخطة.**
- `apps/admin/src/**/*.test.ts` بنمط `vitest` + `msw` (مرجع: `bulk.service.test.ts`) — لاختبارات الوحدة على طبقة التطبيق.
- `apps/admin/playwright.config.ts` — لاختبارات E2E عند الحاجة.
- **لا توجد** أداة اختبار حمل (k6/artillery/autocannon) — تُبنى في المهمة 7 كأول أداة من نوعها في المشروع.

---

## 1. تسلسل التنفيذ (Dependency-Ordered Waves)

```
الموجة 1 (يوم 1، متوازية، منخفضة المخاطر — كل مهمة بملف معزول)
├── T5: N+1 في tenants.service.ts
├── T6: YouTube batching/timeout
└── T3: سقف طابور المهام لكل tenant

الموجة 2 (يوم 1-2، مستقلة)
└── T1: جدولة release_stale_job_locks عبر pg_cron

الموجة 3 (يوم 2-4، الأثقل — تلمس نفس الملفات فتُنفَّذ كوحدة واحدة)
└── T2+T4: عمود result + تتبع succeeded_ids + إعادة التحقق من العدد
    يمس: 03_tables.sql, 07_functions.sql (worker_update_bulk_job, admin_retry_job,
         admin_get_jobs, admin_get_job), bulk-worker/index.ts, bulk.types.ts,
         jobs.service.ts, bulk.service.ts

الموجة 4 (يوم 4-5، بوابة قبول نهائية — تعتمد على اكتمال 1، 2، 4)
└── T7: بناء أداة اختبار الحمل وتشغيلها ضد الإصلاحات أعلاه
```

**سبب الترتيب:** T5/T6/T3 لا تلمس `job_queue` إطلاقًا → صفر تعارض، تُنجز أولًا لبناء ثقة سريعة. T1 مستقلة تمامًا (دالة قائمة بالفعل، فقط تحتاج جدولة). T2+T4 تُجمَّعان لأنهما تعدّلان `bulk-worker/index.ts` وبنية `job_queue` بنفس الوقت — فصلهما يعني تعديل نفس الملفات مرتين بلا داعٍ. T7 تأتي أخيرًا لأنها **الاختبار الذي يثبت أن T1/T2/T4 نجحت فعليًا تحت تزامن حقيقي**، لا مجرد قراءة كود.

---

## 2. تفصيل كل مهمة

### T5 — إصلاح N+1 في قائمة المستأجرين
**الملف:** `apps/admin/src/infrastructure/repos/tenants.service.ts:17-43`

**التنفيذ:**
استبدال حلقة `tenants.map(async (tenant) => {...2 count queries...})` باستعلام واحد مجمّع:
```sql
SELECT tenant_id, count(*) FILTER (WHERE ...) 
FROM users WHERE tenant_id = ANY($1) AND deleted_at IS NULL 
GROUP BY tenant_id
```
أو أبسط: RPC واحدة `get_tenants_usage(p_tenant_ids uuid[])` تُرجع `TABLE(tenant_id uuid, user_count bigint, course_count bigint)` بـ `GROUP BY`، تُستدعى مرة واحدة بدل N×2 استعلام. الدالة تُضاف في `07_functions.sql` بنفس نمط `SECURITY DEFINER SET search_path = public, pg_temp` المتّبع في كل الدوال الأخرى بالملف.

**الاختبار:** تحديث/إضافة اختبار في `tenants.service.test.ts` (إن لم يوجد يُنشأ بنفس نمط `bulk.service.test.ts` + `msw`) يتحقق أن `withTenantUsage` لصفحة بها 50 مستأجرًا تستدعي `supabase.rpc`/`from` **مرة واحدة فقط** (spy count)، لا 100 مرة.

**معيار القبول:** عدد استدعاءات الشبكة لصفحة tenants بـ 50 عنصرًا ينخفض من ~100 إلى 1.

**Rollback:** git revert للملف + للدالة الجديدة في 07_functions.sql (لا حالة بيانات متأثرة، الدالة قراءة فقط).

---

### T6 — عزل فشل YouTube API وتقليل استهلاك الحصة
**الملفات:** `apps/admin/src/infrastructure/youtube.service.ts:54-90`, `courses.service.ts:444-483`

**التنفيذ:**
1. دالة جديدة `getYoutubeVideoDetailsBatch(urlOrIds: string[])` تستدعي `videos?id=id1,id2,id3&part=...` **مرة واحدة** لكل دفعة (حتى 50 ID لكل طلب — حد YouTube API)، بدل استدعاء منفصل لكل فيديو.
2. إضافة `AbortController` مع `setTimeout(() => controller.abort(), 8000)` على كل `fetch`.
3. في `createLessons`: استبدال `Promise.all` بـ `Promise.allSettled` عند معالجة النتائج، بحيث فشل فيديو واحد (404، quota exceeded، timeout) لا يُسقط بقية الدفعة — يُسجَّل في نتيجة الاستجابة كـ `partial_failures: [{lesson_index, reason}]` بدل `throw`.
4. عند 429 (rate limit) تحديدًا: retry واحد بعد backoff قصير (2 ثانية) قبل اعتباره فشلًا نهائيًا — نفس نمط الـ retry الموجود مسبقًا في المشروع لأخطاء Supabase المؤقتة (`fix-middleware-getuser-transient-error-retry`).

**الاختبار:** اختبار وحدة (`youtube.service.test.ts` جديد بنمط msw) بثلاثة سيناريوهات: (أ) دفعة كلها صالحة → نجاح كامل باستدعاء شبكة واحد، (ب) فيديو واحد من 10 يرجع 404 → 9 دروس تُنشأ + 1 مسجّل كفشل جزئي، الطلب لا يفشل بالكامل، (ج) استجابة متأخرة >8 ثوانٍ → timeout واضح بدل تعليق غير محدود.

**معيار القبول:** استدعاء شبكة واحد لكل دفعة (بدل N)، صفر حالات "فشلت الدفعة كاملة بسبب فيديو واحد" في الاختبارات.

---

### T3 — سقف طابور مهام bulk لكل tenant وليس عامًا
**الملفات:** `07_functions.sql:3889-3930` (`admin_enqueue_bulk_job`), `bulk-action/index.ts:131`

**التنفيذ (SQL):**
```sql
-- داخل admin_enqueue_bulk_job، استبدال:
SELECT count(*) INTO v_pending_count FROM internal.job_queue WHERE status = 'pending';
-- بـ:
SELECT count(*) INTO v_pending_count 
FROM internal.job_queue 
WHERE status = 'pending' AND tenant_id = v_tenant_id;
```
مع الإبقاء على `max_pending_jobs constant int := 10` كسقف **لكل tenant** (يمكن رفعه لاحقًا كإعداد لكل tenant عبر `tenants.settings` إن استدعت الحاجة تفاوتًا بين الخطط، لكن هذا خارج نطاق هذه المرحلة).

**التنفيذ (TS):** حذف الثابت الميت `MAX_PENDING_JOBS = 10_000` من `bulk-action/index.ts:131` (غير مستخدم فعليًا)، أو ربطه فعليًا برسالة الخطأ المعروضة للمستخدم بدل رقم مكتوب يدويًا في نص الخطأ، لمنع تضارب مستقبلي بين الطبقتين.

**الاختبار:** على `local-test-harness`: seed لمستأجرين A وB، تعبئة طابور A بـ 10 مهام `pending`، محاولة enqueue من B → يجب أن تنجح. محاولة enqueue حادية عشرة من A → يجب أن ترجع `JOB_QUEUE_FULL`.

**معيار القبول:** اختبار SQL مباشر (pg client ضد المنفذ 54329) يمرّ بالسيناريو أعلاه دون تعديل يدوي.

---

### T1 — جدولة تحرير الأقفال العالقة
**الملف:** `07_functions.sql` (بعد تعريف `release_stale_job_locks` في السطر 2368، بنفس نمط جدولة `manage_partitions` الموجود بالسطر 4362)

**التنفيذ:**
```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-stale-job-locks')
  THEN
    PERFORM cron.schedule(
      'release-stale-job-locks',
      '* * * * *',  -- كل دقيقة
      $cron$ SELECT public.release_stale_job_locks(); $cron$
    );
  END IF;
END $$;
```
(نفس البنية الشرطية الدفاعية المستخدمة فعليًا في المشروع لجدولة `manage_partitions` — لا نمط جديد يُدخَل).

**قيد مهم:** `pg_cron` غير متاح داخل `embedded-postgres` المستخدم في `local-test-harness` (يتطلب `shared_preload_libraries` على مستوى الـ cluster، غير مدعوم في الحزمة المدمجة). لذلك الاختبار على مستويين:
1. **صحة الدالة نفسها** (قابلة للاختبار محليًا الآن): على `local-test-harness`، إدراج job بحالة `processing` و`lock_expires_at` بالماضي، استدعاء `release_stale_job_locks()` يدويًا، والتحقق أنه يعيدها `pending`.
2. **صحة الجدولة** (تتطلب بيئة staging حقيقية بها `pg_cron`، لا يمكن إثباتها في `local-test-harness`): بعد النشر على staging، `SELECT * FROM cron.job WHERE jobname = 'release-stale-job-locks'` يجب أن يُظهر صفًا واحدًا، و`cron.job_run_details` يجب أن يُظهر تشغيلات ناجحة متكررة كل دقيقة.

**معيار القبول:** كلا الاختبارين PASS — لا يكفي إثبات الدالة فقط، لأن الفجوة الأصلية (F-01) كانت أن الدالة **موجودة لكن غير مستدعاة**؛ إثبات الجدولة على staging إلزامي لإغلاق البند فعليًا.

---

### T2 + T4 — تتبع succeeded_ids وإعادة التحقق من العدد عند التنفيذ
**الأثقل في الخطة. الملفات:** `03_tables.sql`, `07_functions.sql` (`worker_update_bulk_job`, `admin_retry_job`, `admin_get_jobs`, `admin_get_job`), `bulk-worker/index.ts`, `apps/admin/src/domain/types/bulk.types.ts`, `jobs.service.ts`, `bulk.service.ts`

#### 2.أ — عمود `result` مستقل عن `error_message` (03_tables.sql)
```sql
-- يُضاف مباشرة بعد كتلة ALTER TABLE الخاصة بـ autovacuum على internal.job_queue (بعد السطر ~1386):
ALTER TABLE internal.job_queue ADD COLUMN IF NOT EXISTS result jsonb;
COMMENT ON COLUMN internal.job_queue.result IS
  'Structured progress/outcome: {processed, total, succeeded_ids, failed_ids, truncated}. '
  'error_message stays reserved for actual fatal errors, not progress data.';
```
هذا يفصل دلاليًا بين "خطأ" و"تقدّم" — حاليًا `error_message` يُستخدَم لتخزين JSON تقدّم أثناء `processing` (`bulk-worker/index.ts:227-236`)، وهو ما يجعل عمود مخصص للأخطاء يعرض بيانات ليست أخطاء في واجهة الأدمن. هذا إصلاح نظافة كود بجانب كونه أساس T4.

#### 2.ب — bulk-worker: تتبع succeeded_ids وتخطي ما سبق تنفيذه عند إعادة المحاولة
```
- عند بدء معالجة job بـ attempts > 1 (أي retry): قراءة job.result.succeeded_ids الحالية (إن وجدت)
  من الصف المُدخَل عبر dequeue_job، واستبعادها من userIds قبل حلقة المعالجة.
- تحديث updateBulkJob لكتابة { processed, total, succeeded_ids, failed_ids, truncated } في عمود result
  الجديد بدل error_message.
- استبدال المعالجة التسلسلية for..of بمعالجة على دفعات متوازية داخل كل batch:
      await Promise.allSettled(batch.map(userId => processAction(...)))
  مع تجميع النتائج — يقلل زمن تنفيذ batch الـ 50 من (50 × RPC latency) إلى (latency واحد تقريبًا)،
  وهو ما يقلل مباشرة احتمال تجاوز سقف تنفيذ Edge Function المرتبط بـ F-01.
```

#### 2.ج — admin_retry_job: عدم مسح النتائج السابقة
```sql
-- حاليًا: error_message = NULL عند retry، ما يمحو succeeded_ids فعليًا.
-- التعديل: الإبقاء على result كما هو (لا تصفير)، تصفير error_message فقط (فعلاً خطأ سابق):
UPDATE internal.job_queue
SET status = 'pending', run_at = now(), attempts = 0, error_message = NULL, updated_at = now()
-- result يبقى بدون تعديل عمدًا
WHERE id = p_id AND (...نفس شرط IDOR الحالي بدون تغيير...);
```

#### 2.د — إعادة التحقق من العدد داخل bulk-worker (T4)
```
- بعد applyUserFilters وقبل .limit(500): تنفيذ استعلام count منفصل (head: true) لمعرفة
  العدد الحقيقي الآن، مقارنة بـ payload.estimated_count المحفوظ وقت الإرسال.
- إن كان العدد الفعلي > 500: تنفيذ أول 500 كالمعتاد، لكن كتابة truncated: true
  وعدد المتبقين الفعلي داخل result بدل الصمت الكامل الحالي.
```

#### 2.هـ — تحديث دوال القراءة والواجهة
`admin_get_jobs`/`admin_get_job` (07_functions.sql:3696، 3858): إضافة `result jsonb` كحقل عائد منفصل عن `error_msg` في `RETURNS TABLE`. `bulk.types.ts`, `jobs.service.ts`, `bulk.service.ts`: تحديث الأنواع وواجهة التقدّم لقراءة `result.succeeded_ids/failed_ids/truncated` بدل تفكيك (`JSON.parse`) حقل `error_msg` كما يحدث حاليًا.

**الاختبار (على local-test-harness مباشرة، سيناريو end-to-end حقيقي):**
1. seed: tenant A، 30 مستخدمًا مطابقين لفلتر، job بنوع `bulk_warn`.
2. تشغيل نصف المعالجة يدويًا (معالجة 15 مستخدمًا فقط ثم قطع المحاكاة عمدًا) لتحاكي سقوط الـ Edge Function في المنتصف — تحديث `result.succeeded_ids` لهؤلاء الـ 15 يدويًا في الاختبار، ترك الحالة `processing`.
3. استدعاء `release_stale_job_locks()` (T1) → الحالة تعود `pending`.
4. محاكاة إعادة تشغيل `bulk-worker` منطقيًا (استدعاء دالة المعالجة من جديد في بيئة الاختبار) → **التحقق أن الـ 15 مستخدمًا الأوائل لا يُستدعى لهم `worker_issue_warning` مرة ثانية**، فقط الـ 15 المتبقون.
5. سيناريو منفصل: فلتر ينمو من 300 إلى 600 مستخدم بين الإرسال والتنفيذ → التحقق أن النتيجة النهائية تحمل `truncated: true` وعدد المتبقين، وليست صامتة.

**معيار القبول:** الخطوة 4 و5 أعلاه PASS بشكل آلي (سكريبت اختبار محفوظ في `scripts/` قابل لإعادة التشغيل).

**Rollback:** إن ظهرت مشكلة بعد النشر — `result` عمود جديد إضافي (لا يُحذَف أي عمود قائم)، لذا التراجع هو git revert لمنطق `bulk-worker/index.ts` والدوال المعدَّلة فقط؛ العمود الإضافي يبقى غير ضار (nullable) حتى لو أُلغي استخدامه مؤقتًا.

---

### T7 — أداة اختبار حمل لمسارات bulk (أول أداة من نوعها في المشروع)
**مكان جديد:** `scripts/perf/bulk-load-test.mjs` (يُبنى فوق `local-test-harness` القائم، لا Docker ولا حساب Supabase سحابي مطلوب لهذه الطبقة).

**السيناريوهات الإلزامية:**
| # | السيناريو | ما يُقاس | حد القبول |
|---|---|---|---|
| 1 | مهمة واحدة بـ 500 مستخدم (الحد الأقصى المسموح) | زمن الاكتمال الكلي end-to-end | يجب ألا يقترب من سقف تنفيذ Edge Function (تُوثَّق القيمة الفعلية من إعدادات مشروع Supabase الحقيقي، لا تُفترض) |
| 2 | 5 مهام متزامنة من 5 tenants مختلفين، كل واحدة 100 مستخدم | تضارب على الطابور، صحة FOR UPDATE SKIP LOCKED تحت تزامن حقيقي (لا نظري) | صفر ازدواج معالجة لنفس job_id |
| 3 | قتل عملية معالجة قسريًا في المنتصف (محاكاة timeout حقيقية) ثم قياس زمن الاسترداد | من لحظة السقوط حتى عودة الحالة pending | ≤ الزمن المحدد في `LOCK_TTL_SECONDS` + دورة cron واحدة (~دقيقة) بعد تفعيل T1 |
| 4 | tenant يحاول إشباع الطابور بعد أن tenant آخر ملأ طابوره | fairness | tenant الثاني غير متأثر (يثبت T3) |

**معيار القبول النهائي لهذه المرحلة كاملة:** السيناريوهات الأربعة أعلاه PASS، موثّقة بأرقام فعلية (زمن بالمللي ثانية، لا "يبدو سريعًا")، محفوظة كـ baseline في `project_documents/performance/` بنفس نمط `bundle-baseline-2026-09-03.json` الموجود مسبقًا، لتصبح مرجعًا لأي انحدار أداء مستقبلي.

---

## 3. قائمة القبول النهائية (Definition of Done لهذه المرحلة)

| البند | قبل هذه الخطة | بعد التنفيذ المطلوب |
|---|---|---|
| استرداد المهام العالقة | لا آلية تلقائية (F-01) | مجدولة + مُثبتة على staging عبر `cron.job_run_details` |
| ازدواج التأثير عند retry | مؤكد لإجراء `warn` (F-02) | صفر ازدواج، مُثبت باختبار end-to-end |
| عدالة الطابور بين tenants | سقف عام مشترك (F-03) | سقف لكل tenant، مُثبت باختبار تزامن |
| صمت عند تجاوز 500 مستخدم فعليًا | صمت كامل (F-04) | `truncated: true` صريح في النتيجة |
| N+1 في tenants list | 100 استعلام/صفحة (F-05) | 1 استعلام/صفحة |
| فشل دفعة استيراد دروس بفيديو واحد | فشل كامل (F-06) | فشل جزئي معزول فقط |
| بنية اختبار حمل | غير موجودة إطلاقًا | 4 سيناريوهات موثّقة بأرقام حقيقية |

**لا يُعلَن "المرحلة 5 جاهزة للإطلاق" إلا إذا كانت كل صفوف هذا الجدول في العمود الأيمن PASS فعليًا** — بنفس منهجية "لا دليل ≠ سلامة" التي اعتمدها تقرير المراجعة الأمنية الأصلي.

## 4. خارج نطاق هذه الخطة عمدًا (يُذكَر صراحة لا يُخفى)
- `bulk-export` لم يُفتح بعمق في هذه الجولة — يحتاج فحصًا مماثلًا منفصلًا.
- قياس استهلاك الذاكرة الفعلي لـ Edge Functions تحت حمل يحتاج تشغيلًا فعليًا على Supabase (لا يُحاكى بـ `local-test-harness`).
- Storage/signed URLs تحت حمل — خارج نطاق الأداء أصلًا حسب تصنيف التقرير الأمني.
