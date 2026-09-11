# EduZone — خطة النشر على Vercel

## 1. نطاق الخطة

التطبيق القابل للنشر هو لوحة الإدارة الموجودة في:

```text
apps/admin
```

المشروع مبني باستخدام Next.js 15 داخل Monorepo يعتمد على Turborepo وpnpm، ويتصل بـ Supabase وSentry.

## 2. بوابة الجاهزية قبل النشر

يجب تنفيذ الأوامر التالية من جذر المستودع:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @eduzone/admin build
```

يجب أن تمر جميع الفحوصات محليًا وداخل GitHub Actions قبل الدمج إلى `main`.

## 3. إعداد مشروع Vercel

يُنشأ مشروع مستقل باسم:

```text
eduzone-admin
```

الإعداد المقترح:

| الإعداد | القيمة |
|---|---|
| Framework | Next.js |
| Production Branch | `main` |
| Node.js | Node 20 أو الإصدار المعتمد في المشروع |
| Package Manager | pnpm |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm --filter @eduzone/admin build` |
| Output Directory | تلقائي لـ Next.js |
| Root Directory | جذر المستودع |

يفضل إبقاء `Root Directory` على جذر المستودع حتى تعمل حزم Workspace الموجودة في:

```text
packages/ui
packages/types
packages/utils
```

إذا تم اختيار `apps/admin` كـ Root Directory، يجب التأكد أن Vercel يستطيع الوصول إلى `pnpm-workspace.yaml` و`pnpm-lock.yaml`، ثم اختبار Preview قبل Production.

## 4. ملف Vercel الحالي

يوجد ملف الإعداد هنا:

```text
apps/admin/vercel.json
```

ويحتوي على:

- Cron endpoint: `/api/cron/routine`
- تشغيل Cron كل 5 دقائق
- Security Headers
- Content Security Policy
- HSTS
- حماية من Clickjacking وMIME sniffing

يجب التأكد أثناء إعداد المشروع من أن Vercel يقرأ هذا الملف. إذا كان Root Directory هو جذر المستودع، يجب نقل إعدادات Vercel إلى ملف `vercel.json` في الجذر أو ضبط إعداد المشروع بما يضمن تطبيق الملف الموجود داخل `apps/admin`.

## 5. متغيرات البيئة

تضاف المتغيرات من:

```text
Vercel Dashboard → Project Settings → Environment Variables
```

يجب فصل القيم بين `Preview` و`Production`.

### Production

```env
NEXT_PUBLIC_SUPABASE_URL=https://<production-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
NEXT_PUBLIC_APP_ENV=production
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
YOUTUBE_API_KEY=<youtube-api-key>
NEXT_PUBLIC_SENTRY_DSN=<sentry-dsn>
SENTRY_AUTH_TOKEN=<sentry-auth-token>
SENTRY_ORG=eduzone
SENTRY_PROJECT=admin
```

### Preview

يفضل استخدام مشروع Supabase منفصل للـ Preview/QA:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<preview-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<preview-anon-key>
NEXT_PUBLIC_APP_ENV=preview
SUPABASE_SERVICE_ROLE_KEY=<preview-service-role-key>
NEXT_PUBLIC_SENTRY_DSN=<preview-sentry-dsn>
```

### قواعد الأسرار

- أي متغير يبدأ بـ `NEXT_PUBLIC_` يمكن أن يصل إلى المتصفح.
- لا يوضع أي Secret داخل متغير `NEXT_PUBLIC_*`.
- `SUPABASE_SERVICE_ROLE_KEY` يجب أن يبقى Server-only.
- لا يتم رفع `.env.local` أو `.env.test` إلى Git.
- بعد تعديل أي Environment Variable يجب إنشاء Deployment جديد حتى تطبق القيمة.

## 6. تجهيز Supabase

قبل Production Deployment:

1. تجهيز مشروع Supabase Production.
2. تطبيق migrations الموجودة في مجلد `supabase`.
3. نشر Edge Functions المطلوبة.
4. تفعيل RLS والسياسات والـ RPCs.
5. مراجعة Auth Redirect URLs.
6. إضافة نطاق Preview والنطاق النهائي إلى Allowed Origins وCORS.
7. تنفيذ اختبارات RLS على بيئة Production أو بيئة مطابقة لها.
8. أخذ Backup قبل كل Migration.

يُمنع تشغيل `supabase db reset` على Production.

## 7. إعداد Supabase Auth

يجب إضافة النطاقات التالية حسب البيئة:

```text
https://<preview-url>.vercel.app/**
https://admin.eduzone.com/**
```

كما يجب اختبار:

- تسجيل الدخول.
- تسجيل الخروج.
- إعادة تحميل الصفحة بعد تسجيل الدخول.
- انتهاء الجلسة وتجديدها.
- إعادة التوجيه بعد المصادقة.
- عزل المستخدم بين Tenants.

## 8. إعداد Sentry

يجب التأكد من وصول Events من Production وPreview إلى مشاريع Sentry الصحيحة.

يفضل ضبط البيئة صراحة في إعدادات Sentry:

```ts
environment: process.env.NEXT_PUBLIC_APP_ENV
```

يجب تنفيذ Probe بعد النشر والتأكد من ظهور الحدث في Sentry.

## 9. Cron Job

الإعداد الحالي هو:

```json
"schedule": "0 3 * * *"
```

وهذا يعني تشغيل المهمة يوميًا 3 صباحًا UTC    .

يجب التأكد من استخدام خطة Vercel Pro أو Enterprise، لأن خطة Hobby لا تسمح بالـ Cron المتكرر يوميًا 3 صباحًا UTC    .

قبل التفعيل:

- حماية `/api/cron/routine` من الاستدعاء غير المصرح.
- استخدام Cron Secret للتحقق من الطلب.
- جعل العملية Idempotent حتى لا تتكرر المعالجة عند إعادة المحاولة.
- تسجيل نتيجة كل تشغيل وسبب الفشل إن وجد.
- تذكر أن توقيت Vercel Cron يعتمد على UTC.
- اختبار endpoint يدويًا في Preview.

## 10. نشر Preview

يتم إنشاء Pull Request من Feature Branch إلى `main`.

يجب فحص Preview Deployment قبل الدمج، ويشمل ذلك:

- تسجيل الدخول والخروج.
- لوحة Admin.
- لوحة Teacher.
- تبديل اللغة.
- عمليات المستخدمين والكورسات.
- الصلاحيات وTenant isolation.
- التنبيهات وRealtime.
- الصور وSupabase Storage.
- endpoint الخاص بالـ Cron.
- عدم وجود أخطاء Runtime أو Hydration.
- وصول الأخطاء إلى Sentry.
- صحة Security Headers وCSP.

أوامر مفيدة:

```bash
vercel logs --environment preview
vercel curl / --deployment <preview-url>
```

## 11. النشر إلى Production

بعد نجاح CI وموافقة مراجعة الكود:

1. دمج Pull Request إلى `main`.
2. انتظار Production Deployment.
3. التأكد من أن Deployment مبني من Commit الدمج الصحيح.
4. ربط النطاق:

   ```text
   admin.eduzone.com
   ```

5. تحديث DNS.
6. التحقق من SSL.
7. تحديث Supabase Redirect URLs بالنطاق النهائي.
8. تنفيذ Smoke Test من خارج بيئة التطوير.

## 12. فحوصات ما بعد النشر

```bash
curl -I https://admin.eduzone.com
```

قائمة التحقق:

- [ ] الصفحة الرئيسية ترجع HTTP 200.
- [ ] تسجيل الدخول يعمل.
- [ ] عمليات Admin وTeacher تعمل.
- [ ] لا توجد أخطاء 5xx في Vercel Logs.
- [ ] Sentry يستقبل الأحداث.
- [ ] Cron يعمل بنجاح.
- [ ] لا يوجد تسريب لـ `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] CSP وHSTS مفعّلان.
- [ ] لا توجد أخطاء Hydration أو Runtime.
- [ ] مراقبة التطبيق لمدة 30–60 دقيقة بعد الإطلاق.

## 13. Rollback

عند وجود أخطاء 5xx أو Regression واضح:

1. فتح Vercel → Deployments.
2. اختيار آخر Deployment ناجح.
3. اختيار `Promote to Production`.
4. فحص النطاق وتنفيذ Smoke Test.
5. إذا كانت المشكلة مرتبطة بـ Database Migration، اتباع:

   ```text
   project_documents/rollback-plan.md
   ```

لا يتم عمل Rollback للكود فقط إذا كان الإصدار الجديد نفذ Migration غير قابلة للعكس.

## 14. ترتيب التنفيذ

| المرحلة | شرط الإنجاز |
|---|---|
| مراجعة Build وCI | جميع الفحوصات ناجحة |
| إنشاء Vercel Project | المشروع مربوط بالمستودع |
| إضافة Preview Variables | القيم متاحة للـ Preview |
| تجهيز Supabase Preview | Auth وRLS وmigrations جاهزة |
| نشر Preview | Deployment ناجح |
| الاختبار الوظيفي والأمني | لا توجد مشاكل حرجة |
| إضافة Production Variables | كل الأسرار مضافة بشكل صحيح |
| إعداد Domain وDNS | SSL فعال |
| Production Deployment | النشر ناجح |
| Smoke Test وMonitoring | لا توجد أخطاء حرجة |
| تجربة Rollback على Staging | الإجراء قابل للتنفيذ |

## 15. ملاحظات ومراجع

- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Environments](https://vercel.com/docs/deployments/environments)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Cron Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [EduZone Rollback Plan](./rollback-plan.md)
- [EduZone Production Closure Report](./production-closure-report.md)
