# M16 — Performance Baseline Report (Execution Plan §21)

- **التاريخ:** 2026-09-03
- **المنهجية:** شوف → افحص → فكّر → عدّل → تأكد (حلقة كاملة مع إعادة فحص)
- **الترقيم:** M16 في تسلسل التقارير الفعلي (M15 في ترتيب تنفيذ الخطة §25؛ §20 Database Lifecycle مؤجلة بذاتها في الخطة — ليست Dashboard-only)
- **الحالة:** ✅ خط أساس مقاس ومُسجَّل (bundle sizes بالكامل + web-vitals للصفحة العامة + تقييم ساكن للـhotspots الثمانية) — قياسات الصفحات المحمية وINP وquery latency مرتبطة بتفعيل بوابة E2E (M15)
- **قاعدة المرحلة:** لا optimization — الأرقام أولًا («لا نبدأ optimization قبل measurement»)

---

## 1. الهدف (من الخطة §21 — P2)

قياس خط الأساس وتسجيله بأرقام قابلة للمقارنة (قبل/بعد) في المجالات: `TTFB, LCP, INP, CLS, bundle sizes, query latency`، وفحص الـhotspots الثمانية المسمّاة، دون أي تغيير أداء في هذه المرحلة.

---

## 2. بيئة القياس (لتكرار الأرقام)

| البند | القيمة |
|---|---|
| Commit / التاريخ | `main` @ ما قبل commit M16 مباشرة / 2026-09-03 |
| Build | `next build` (Next.js 15.5.19) بنفس قيم CI: `NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co` + anon key placeholder |
| Runtime | `next start` محليًا (PORT=3100) بنفس القيم — middleware يتسامح مع فشل Supabase (try/catch → زائر مجهول)، كافٍ للصفحات العامة |
| المتصفح | Playwright Chromium (المثبّت للمستودع)، 3 تشغيلات لكل صفحة |
| ملاحظة حتمية | كل الأرقام على جهاز تطوير محلي — قابلة للتكرار بنفس الأوامر؛ مقارنة قبل/بعد تتم بنفس البيئة |

**أوامر إعادة القياس** (موثقة داخل رأسي السكربتين):

```bash
pnpm --filter @eduzone/admin build          # بنفس قيم CI أعلاه
node scripts/perf/bundle-baseline.mjs project_documents/performance/bundle-baseline-<date>.json
# سيرفر: next start (PORT=3100) بنفس القيم، ثم:
node scripts/perf/web-vitals.mjs http://localhost:3100 /login 3   # VITALS_OUT=<path>.json
```

---

## 3. النتائج (شوف)

### 3.1 Bundle sizes — خط الأساس (كل المسارات، من مخرجات البناء)

**First Load JS المشترك بين كل المسارات: 180 kB** — **Middleware: 229 kB**

| المسار | First Load JS | | المسار | First Load JS |
|---|---|---|---|---|
| `/[locale]/courses` | **539 kB** (الأثقل) | | `/[locale]/jobs` | 427 kB |
| `/[locale]/courses/[id]` | 531 kB | | `/[locale]/activities` | 438 kB |
| `/[locale]/courses/[id]/analytics` | 531 kB | | `/[locale]/audit` | 436 kB |
| `/[locale]/courses/[id]/students` | 531 kB | | `/[locale]/tenants` (+`[id]`) | 432 kB |
| `/[locale]/warnings` | 531 kB | | `/[locale]/dashboard [locale]` | 422 kB |
| `/[locale]/flags` | 477 kB | | `/[locale]/analytics` | 419 kB |
| `/[locale]/settings` | 477 kB | | `/[locale]/login` | **306 kB** (الأخف) |
| `/[locale]/users` | 476 kB | | `/api/*` (5 مسارات) | 180 kB |
| `/[locale]/notifications` | 474 kB | | `/_not-found` | 181 kB |

- المقاس الدقيق لكل chunks (عبر `scripts/perf/bundle-baseline.mjs` → JSON): إجمالي `.next/static` = **2935.8 KB**؛ أثقل مسار بمجموع chunks المُصدَرة له (شاملة lazy): `courses/page` = 1170.9 KB؛ المشترك الحرفي في كل مسار = 573.7 KB (4 ملفات).
- **قراءة أولية (للمرحلة القادمة لا لهذه):** مسارات courses/warnings فوق 530 kB First Load — مرشحة لتفتيت استيرادات (dnd-kit curriculum builder, MUI) بعد القياس على بيئة حقيقية.

### 3.2 Web Vitals — صفحة `/login` (العامة، placeholder backend — 3 تشغيلات chromium)

| المقياس | median | ملاحظة |
|---|---|---|
| **TTFB** | **75.9 ms** | محلي (لا يمثل شبكة production) |
| **FCP** | **524 ms** | تشغيل أول (بارد): 3020 ms — تأثير أول serve/compile |
| **LCP** | **524 ms** | ممتاز (< 2500 ms حد Good) |
| **CLS** | **0** | مستقر تخطيطيًا (أقصى تشغيل: 0.015) |
| DCL / Load | 511.7 / 761.9 ms | — |
| نقل الجذر | 17.9 KB | — |

الملف: `project_documents/performance/web-vitals-baseline-2026-09-03.json` (العينات الخام + الوسيط).

### 3.3 ما لم يُقس بعد (مرتبط بمتطلبات بنية تحتية — انظر §7)

- **INP**: يتطلب سيناريوهات تفاعل مبرمَجة على صفحات محمية.
- **vitals الصفحات المحمية** (dashboard, users, courses…): تتطلب تسجيل دخول فعلي — نفس شرط تفعيل بوابة E2E (M15 §7.1) — السكربت جاهز ويقبل route المحمية بعد التفعيل.
- **query latency**: تتطلب DB حية ببيانات تمثيلية (`EXPLAIN ANALYZE` على استعلامات الـhotspots) — بعد توفير backend الاختبار (خارج §20 الموقوفة).
