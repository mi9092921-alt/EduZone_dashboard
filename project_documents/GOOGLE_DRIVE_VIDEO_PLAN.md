# خطة تنفيذ: فيديوهات Google Drive — نموذج إصدار التوكن (Token Issuance)

> **الحالة:** مقترح معتمد للتنفيذ | **التاريخ:** 2026-09-24 | **الفرع:** production-readiness
>
> **الهدف:** السماح للمعلم باستضافة فيديوهاته على Google Drive الخاص به، بحيث يشاهدها الطلاب المشتركون فقط، **بدون بثّ أي بايتات عبر Edge Function** — التحميل يتم مباشرة من خوادم Google.

---

## 🎯 النموذج المعتمد

```
المعلم Y عنده فيديوهات على Google Drive بحسابه الشخصي
        │
        │ يشارك المجلد مع البريد X (صلاحية "عارض/Viewer" فقط)
        ▼
X = حساب خدمة (Service Account) تملكه المنصة
   eduzone-drive@<project>.iam.gserviceaccount.com
        │
        │ مفتاح X مخزّن في أسرار Supabase (لا يراه أحد)
        ▼
Edge Function خفيفة: تتحقق من اشتراك الطالب ← ثم تُصدر توكن Google مؤقتاً (~60 دقيقة)
        │
        ▼
المتصفح يشغّل الفيديو مباشرة من:
https://www.googleapis.com/drive/v3/files/{FILE_ID}?alt=media&access_token={TOKEN}
```

**نقطة تقنية جوهرية:** Google Drive لا يوفّر Signed URLs مثل S3. البدائل المرفوضة: `webContentLink` (يتطلب مشاركة عامة = تسريب دائم) ورابط المعاينة `/preview` (يفتح واجهة Google مع زر تنزيل). الحل الوحيد الآمن للرابط المباشر هو **توكن OAuth قصير العمر يُمرَّر كمعامل `access_token`** — وهو ما يبنى عليه هذا التصميم.

---

## ✅ لماذا هذا النموذج (وليس البث عبر الـ Function)

| المعيار | بثّ عبر Edge Function | إصدار توكن + رابط مباشر (المعتمد) |
|---|---|---|
| الحمل على الـ Function | كل بايتات الفيديو تمر منها | رد JSON واحد صغير لكل جلسة مشاهدة |
| التكلفة | عالية وتتضخم مع عدد المشاهدين | شبه معدومة |
| زمن بدء التشغيل | أبطأ (قفزة شبكة إضافية) | أسرع (Google مباشرة) |
| التقديم/التأخير (Seek) | يتطلب proxy لـ Range requests | يعمل تلقائياً — Google يدعم Range |
| إلغاء الوصول لحظياً | فوري | خلال مدة التوكن (ساعة كحد أقصى) |
| الحماية من التسريب | قوية جداً | جيدة — نافذة تسريب محدودة بساعة |

---

## 🛠️ الخطوة 0 — الإعداد (مرة واحدة)

1. إنشاء مشروع في **Google Cloud Console** → تفعيل **Drive API**.
2. إنشاء **Service Account** (هذا هو البريد X) بصلاحية scope واحدة فقط:
   ```
   https://www.googleapis.com/auth/drive.readonly
   ```
3. تحميل مفتاح JSON وتخزينه في أسرار Supabase:
   ```
   supabase secrets set GOOGLE_SA_CLIENT_EMAIL=... \
                        GOOGLE_SA_PRIVATE_KEY=...
   ```
4. توثيق قيم الأسرار (بدون قيمها) في `supabase/functions/README.md`.

---

## 🗄️ قاعدة البيانات

### جدول جديد في `supabase/schema/03_tables.sql`

```sql
CREATE TABLE public.teacher_drive_folders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  folder_id    TEXT NOT NULL,          -- Google Drive folder ID
  folder_name  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'verified', 'revoked')),
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, folder_id)
);
```

### تعديل جدول الدروس

```sql
ALTER TABLE public.lessons
  ADD COLUMN video_provider TEXT NOT NULL DEFAULT 'youtube'
    CHECK (video_provider IN ('youtube', 'drive')),
  ADD COLUMN drive_file_id TEXT;   -- يُملأ فقط عند video_provider = 'drive'
```

### RLS في `09_rls.sql`

- `teacher_drive_folders`: المعلم يدير صفوفه فقط (`teacher_id = auth.uid()`)؛ الأدمن/super_admin قراءة ضمن نطاقه.
- `lessons.drive_file_id`: لا يتغير شيء — الصلاحيات الحالية على الدروس تغطيه.

### الفهارس والأذونات

- فهرس على `teacher_drive_folders(teacher_id, status)` في `05_indexes.sql`.
- تحديث `10_permissions.sql` و`VALIDATION.sql` و`rpc-catalog.ts`.

---

## ⚡ Edge Functions

### 1) `drive-folder-verify` — ربط مجلد المعلم

```
المدخل:  { folder_url_or_id }   (من صفحة إعدادات المعلم)
الخطوات:
  1. التحقق من JWT + أن المستخدم معلم
  2. استخراج folder_id من الرابط
  3. توليد access token من مفتاح X (JWT → Google OAuth2)
  4. Drive API: files.get(folder_id) + files.list(داخل المجلد)
  5. نجاح → upsert في teacher_drive_folders بـ status='verified'
          + إرجاع قائمة الفيديوهات المكتشفة (الاسم/الحجم/المدة)
     فشل  → رسالة: "شارك المجلد مع X بصلاحية عارض أولاً"
  6. تسجيل العملية عبر log_activity_async
```

### 2) `drive-video-token` — إصدار توكن المشاهدة (قلب النظام)

```
المدخل:  { lesson_id }   + JWT الطالب
الخطوات:
  1. التحقق من JWT
  2. rate limit عبر check_rate_limit الموجود (مثلاً 30/ساعة لكل مستخدم)
  3. التحقق من الاشتراك عبر validate-course-access الموجودة
  4. قراءة lessons.drive_file_id — رفض إن كان youtube أو فارغاً
  5. توليد/إعادة استخدام access token مخزّن مؤقتاً في ذاكرة الـ Function
     (عمره 60 دقيقة — نُعيد استخدامه حتى الدقيقة 50)
  6. تسجيل الإصدار عبر log-download-attempt الموجودة
  7. الإرجاع:
     {
       url: "https://www.googleapis.com/drive/v3/files/{fileId}?alt=media",
       token: "ya29....",
       expiresAt: "..."        // يستخدمه المشغّل للتحديث الاستباقي
     }
```

**ملاحظة أداء:** توكن X واحد مشترك لكل الطلبات — لا نولّد JWT جديداً لكل طالب، بل نخزّن الـ access token في ذاكرة الـ isolate ونحدّثه كل ~50 دقيقة. النتيجة: زمن استجابة < 100ms.

---

## 🖥️ الواجهة

| الملف | الوصف |
|---|---|
| `features/teacher/components/DriveFolderSettings.tsx` | قسم "Google Drive" في إعدادات المعلم: عرض بريد X + زر نسخ + تعليمات المشاركة + حقل لصق رابط المجلد + زر تحقق + قائمة الفيديوهات |
| تعديل محرر الدرس | اختيار مصدر الفيديو: YouTube (الحالي) أو Drive → قائمة منسدلة من فيديوهات المجلد المُتحقق منه |
| `components/VideoPlayer.tsx` (أو توسيع المشغّل الحالي) | عند `video_provider='drive'`: جلب التوكن من `drive-video-token` → وضع الرابط في `<video>` → عند 401/انتهاء الصلاحية يجلب توكناً جديداً تلقائياً |
| ترجمات `messages/ar.json` و`en.json` | كل النصوص الجديدة + دعم RTL |

### رحلة المعلم (3 خطوات)

1. ينسخ بريد X من صفحة الإعدادات.
2. في Google Drive: مشاركة المجلد مع X بصلاحية **عارض**.
3. يلصق رابط المجلد في الداشبورد → "تحقق" → تظهر فيديوهاته ويربطها بالدروس.

### رحلة الطالب

يفتح الدرس → الفيديو يعمل مباشرة. لا يرى أي شيء متعلق بـ Drive، ولا يمكنه الوصول بدون اشتراك فعّال.

---

## 🔐 الأمان والمخاطر

| الخطر | التخفيف |
|---|---|
| طالب ينسخ الرابط ويوزّعه | التوكن يموت خلال ~60 دقيقة — نافذة تسريب محدودة |
| توكن X يفتح كل مجلدات المعلمين المشاركة معه | scope مقيّد `drive.readonly` + rate limiting + تدقيق كل إصدار + عمر قصير |
| التوكن في سجل المتصفح/الشبكة | مقبول عملياً (قصير العمر) + تحديث استباقي قبل الانتهاء |
| إلغاء اشتراك طالب أثناء المشاهدة | يسري عند أول تجديد توكن (خلال ساعة كحد أقصى) |
| حدود Google (Quotas/خنق الملفات كثيفة التحميل) | مراقبة أخطاء 403/429 في السجلات + خطة ترحيل مستقبلية |

### خيار أمني أقوى (مستقبلاً — اختياري)

OAuth لكل معلم بدل حساب خدمة واحد: المعلم يربط حساب Google مرة واحدة، ويُخزَّن refresh token مشفّراً في Supabase Vault. التوكن المسروق يكشف فيديوهات معلم واحد فقط. **لا يُنفَّذ في النسخة الأولى** — يُدرج في خارطة الطريق.

### حدود يجب معرفتها

- Drive ليس CDN: لا HLS/بث متكيّف، والملفات الكبيرة قد تتقطع على اتصالات ضعيفة.
- Google قد يخنق ملفاً يُحمَّل بكثافة عالية — مناسب لعشرات/مئات المشاهدين، لا آلاف متزامنين.
- خارطة الطريق: عند النمو، الانتقال لخدمة فيديو (Cloudflare Stream / Mux) مع إبقاء نفس واجهة `drive-video-token` — لن يتغير شيء على الطلاب.

---

## 🗓️ مراحل التنفيذ

| المرحلة | العمل | المدة |
|---|---|---|
| 1 | إعداد Google Cloud + Service Account + الأسرار | 0.5 يوم |
| 2 | Schema: الجدول + تعديل lessons + RLS + أذونات | 0.5 يوم |
| 3 | `drive-folder-verify` + صفحة إعدادات المعلم | 1.5 يوم |
| 4 | `drive-video-token` + المشغّل + ربط الدرس | 2 يوم |
| 5 | اختبارات + ترجمات + توثيق | 1 يوم |

**الإجمالي التقريبي: 5–6 أيام.**

---

## ✅ معايير الجودة (حسب أعراف المشروع)

- [ ] اختبارات Vitest لمنطق استخراج folder_id ودورة حياة التوكن (توليد/تخزين/تجديد)
- [ ] اختبارات e2e: معلم يربط مجلداً → طالب مشترك يشاهد → طالب غير مشترك يُرفض (403)
- [ ] تحديث `rpc-catalog.ts` و`VALIDATION.sql` و`supabase/functions/README.md`
- [ ] ترجمات عربي/إنجليزي كاملة + تحقق RTL
- [ ] مراجعة RLS على `teacher_drive_folders`
- [ ] تدقيق كامل: ربط المجلدات + كل إصدار توكن في سجل الأنشطة
- [ ] التأكد أن المفتاح السري لا يظهر في أي ردّ أو سجل (secrets فقط)

