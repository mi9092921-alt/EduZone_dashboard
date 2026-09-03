# Milestone Report — M17: Accessibility & UX Regression (§23 P2)
**تاريخ التنفيذ:** 2026-09-04  
**الفرع المستهدف:** main  
**المنهجية المتبعة:** شوف → افحص → فكّر → عدّل → تأكد  

---

## 1. أهداف المرحلة (§23 من وثيقة الخطة المعمارية)

التحقق من سلامة الواجهة وسلوك التفاعل للمسارات الحساسة بعد استقرار البنية التحتية، والتأكد من مطابقة المتطلبات التالية:
- **Arabic / English / RTL**: دعم كامل لاتجاه الصفحة `dir="rtl"` للغة العربية و`dir="ltr"` للغة الإنجليزية دون كسر التنسيق أو تداخل العناصر.
- **Keyboard & Focus**: إمكانية التنقل التسلسلي الكامل عبر لوحة المفاتيح (`Tab` / `Shift+Tab`) ومؤشرات التركيز الواضحة.
- **Modal & Focus Trap**: حبس التركيز داخل النوافذ المنبثقة (`role="dialog"`, `aria-modal="true"`)، وإغلاقها بواسطة مفتاح `Escape` مع استعادة التركيز للعنصر المشغِّل (WCAG 2.4.3 / 2.1.2).
- **Destructive Confirmation**: التأكيد الصريح والمميز بصرياً للإجراءات التدميرية (`ConfirmDialog` مع `confirmColor="error"`).
- **UI State Coverage**: تغطية حالات التحميل (`loading`)، الفراغ (`empty`)، الخطأ (`error`)، والتعطيل (`disabled`).
- **Automated Accessibility Audit**: فحص آلي لمعايير WCAG 2.1 AA باستخدام `@axe-core/playwright`.

---

## 2. ما تم إنجازه في هذه المرحلة

### 2.1. اختبارات الوحدة المعمارية للواجهة (Unit Testing)
1. **RTL / LTR Direction Mapping (`direction.test.ts`)**:
   - اختبار خريطة الاتجاهات `getDir(locale)` لتأكيد إرجاع `rtl` لـ `ar` و `ltr` لـ `en` والاحتياطي الافتراضي.
   - النتيجة: ✅ **3/3 اختبارات ناجحة**.

2. **Keyboard Focus Trapping & Accessibility (`useFocusTrap.test.tsx`)**:
   - اختبار نقل التركيز للعنصر الأول عند الفتح.
   - اختبار حبس التركيز ومنع التسرب لخلفية الصفحة عند الضغط على `Tab` (الدوران من الأخير إلى الأول).
   - اختبار الدوران العكسي عند الضغط على `Shift+Tab` (من الأول إلى الأخير).
   - اختبار معالج مفتاح `Escape` للإغلاق الفوري.
   - اختبار استعادة التركيز للزر المشغِّل الأصلي عند إغلاق النافذة.
   - النتيجة: ✅ **5/5 اختبارات ناجحة**.

### 2.2. اختبارات الانحدار الشاملة للـE2E (`tests/e2e/ux-regression.spec.ts`)
إضافة حزمة اختبارات Playwright موسعة تفحص متطلبات §23:
- **Arabic Locale**: التحقق من صفات `dir="rtl"` و `lang="ar"` على وسم `<html>`.
- **English Locale**: التحقق من صفات `dir="ltr"` و `lang="en"` على وسم `<html>`.
- **Axe Accessibility Scan**: فحص صفحات الدخول وخلوها من مخالفات `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
- **Responsive Viewports**: التحقق من انعدام التمرير الأفقي الزائد على شاشات الجوال (375x667).
- **Sequential Tab Navigation**: التنقل التسلسلي عبر حقول النموذج وزر الإرسال.
- **Error & Disabled States**: التحقق من ظهور رسائل الخطأ ذات التباين المعتمد ودور التنبيه المناسب.
- **Modal Dialog Semantics**: التحقق من صفات `role="dialog"` و `aria-modal="true"` والاستجابة لمفتاح `Escape`.

---

## 3. التحقق المباشر (Verification Evidence)

| الفحص | الأداة | النتيجة |
|---|---|---|
| فحص الأنواع | `pnpm typecheck` | ✅ **PASS** (4/4 packages) |
| فحص الـLint | `pnpm lint` | ✅ **PASS** (`--max-warnings=0`) |
| اختبارات الوحدة للـA11y/Direction | `vitest run` | ✅ **PASS** (8/8 اختبارات) |
| إجمالي اختبارات المشروع | `vitest run` | ✅ **PASS** (1064/1064 اختبارات) |
| بناء التطبيق للإنتاج | `pnpm build` | ✅ **PASS** (exit code 0) |

---

## 4. الحالة المعمارية

المرحلة M17 مكتملة وموثقة، والتطبيق جاهز للمرحلة الختامية: **M18 — §24 Final Production Architecture Certification**.
