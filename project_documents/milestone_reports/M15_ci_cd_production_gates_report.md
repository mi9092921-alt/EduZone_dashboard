# M15 — CI/CD Production Gates Report (Execution Plan §19)

- **التاريخ:** 2026-09-03
- **المنهجية:** شوف → افحص → فكّر → عدّل → تأكد (حلقة كاملة مع إعادة فحص)
- **الترقيم:** M15 في تسلسل التقارير الفعلي (M14 في ترتيب تنفيذ الخطة §25)
- **الحالة:** ✅ الأبواب الملفية مكتملة ومُتحقق منها — باب E2E **مُعرَّف وخامل** (يُفعَّل بمتغير مستودع بعد توفير backend اختباري)، وRLS/Integration/Deployment-Smoke موثقة كمتابعات بإجراءات محددة

---

## 1. الهدف (من الخطة §19 — P1)

سلسلة البوابات المستهدفة، مع قاعدة الإغلاق: **لا يمكن merge إلى `main` إذا فشل أي Production gate**:

```text
PR → Secret Scan → Dependency Audit → Architecture Check → Lint → Typecheck
  → Unit → Integration → Security/RLS → E2E → Build → Deployment Smoke
```

---

## 2. ما الذي وجدناه (شوف + افحص)

| # | البوابة (§19) | الحالة قبل | التفصيل |
|---|---|---|---|
| 1 | Secret Scan | ✅ ci.yml فقط | gitleaks-action@v2 — غير موجودة في deploy.yml (الضغط المباشر على main يتجاوزها) |
| 2 | Dependency Audit | ✅ ci.yml فقط | `pnpm audit --prod --audit-level=high` |
| 3 | Architecture Check | ⚠️ ضمني | القواعد مغطاة داخل باب Lint (M14) + اختبارات vitest داخل باب Test — ليست بوابة صريحة كما في سلسلة §19 |
| 4 | Lint / Typecheck | ✅ | بالترتيب Typecheck→Lint (معكوس لسلسلة الخطة) |
| 5 | Unit | ✅ | `turbo test --coverage` |
| 6 | Integration | ⚠️ جزئي | لا بوابات integration مستقلة؛ اختبارات MSW على مستوى HTTP (repos/services) ضمن جناح Unit |
| 7 | Security/RLS | ❌ | سكربتان موجودان (`scripts/security/rls-smoke-test.ts`, `permission-exhaustive-test.ts`) لكن: يعتمدان `.env.test` غير موجود ((dummy cloud project)، والافتراضات تتطلب backend مُبوَّمًا |
| 8 | E2E | ❌ | `tests/e2e/*.spec.ts` + `playwright.config.ts` موجودة — **بلا أي workflow** يشغلها. **Drift مؤكد:** `auth.setup.ts` يستخدم `Test1234!` مستشهدًا بـschema **v9** بينما الـseed القانوني v13 (`11_seed_reference.sql` bcrypt) وتوثيق AGENTS/CLAUDE/QUICK_START تتفق على `Admin@12345` ⇒ أي تشغيل E2E كان سيفشل في تسجيل الدخول |
| 9 | Build | ✅ | بقيم NEXT_PUBLIC placeholder حتمية |
| 10 | Deployment Smoke | ❌ | `deploy.yml` أصبح **checks-only** («النشر يُدار خارجيًا») — لا pipeline نشر في المستودع يُضاف إليه smoke |
| 11 | drift المسجل قديمًا | ✅ مُصلَح مسبقًا | قيد PRODUCTION_READINESS_PLAN §11 «deploy.yml يستخدم pnpm 9» **لم يعد صحيحًا**: pnpm 10.32.1 + Node 22.19.0 متطابقة في الملفين (تحقق بالقراءة) |
| 12 | Branch protection | ❌ | إعداد GitHub UI — لا يمكن تعريفه بملف؛ وُثِّق إجراء التفعيل |
| 13 | supabase/QUICK_START.md | ⚠️ stale | يشار لـseed files غير موجودة؛ العلامة موجودة أصلًا في رأس الملف |

---

## 3. ما الذي نُفِّذ (عدّل)

### 3.1 `.github/workflows/ci.yml` — سلسلة PR بترتيب الخطة
- **Architecture Check**: خطوة صريحة بعد Dependency Audit وقبل Lint: `pnpm --filter @eduzone/admin exec vitest run --config vitest.unit.config.ts src/architecture` — اختبارات الـboundary (754 assertion) بوصفها بوابة حمراء مستقلة قبل الجناح الكامل.
- إعادة الترتيب لتطابق سلسلة §19: Audit → **Architecture** → Lint → Typecheck → Unit → Build → DB Lint.
- ترويسة توثيقية: سلسلة البوابات، حالة E2E/RLS، وإجراء **Branch Protection** المطلوب (جعل `build_and_test` required status check).

### 3.2 `.github/workflows/deploy.yml` — parity كامل مع بوابات PR
- أُضيفت **Secret Scan (Gitleaks)** + **Dependency Audit** + **Architecture Check** — الضغط المباشر على `main` لم يعد قادرًا على تجاوز أي بوابة إنتاجية.

### 3.3 `.github/workflows/e2e.yml` — بوابة E2E (مُعرَّفة/خاملة)
- شرط التشغيل: `if: vars.E2E_ENABLED == 'true'` (+ `workflow_dispatch`).
- السلسلة: تثبيت pnpm/Node (نفس الإصدارات) → Supabase CLI → `supabase start` + `supabase db reset` (يطبّق `supabase/schema/*.sql` عبر `schema_paths` — قراءة للـschema القانوني دون تغيير عقد §20) → استخراج `supabase status -o env` إلى `NEXT_PUBLIC_*` → build → `playwright install --with-deps chromium` → `playwright test --project=chromium` → رفع تقرير artifact عند الفشل.
- سبب الشرطية (سابقة المستودع نفسها في باب audit): تشغيله دون backend حقيقي = بوابة حمراء دائمًا تحمي لا شيء؛ الخمول الواعي أفضل، مع checklist تفعيل موثقة داخل الملف.

### 3.4 `apps/admin/playwright.config.ts`
- `webServer.command`: `pnpm run start` على CI (ضد production build مبني في خطوة سابقة) و`pnpm run dev` محليًا — سلوك محلي دون تغيير.
- `reporter`: `github` + `html` على CI (annotations في الـPR + artifact)، `html` محليًا.

### 3.5 `apps/admin/tests/e2e/auth.setup.ts` — إصلاح drift
- كلمة المرور `Test1234!` → **`Admin@12345`** مع توثيق المصدر (`11_seed_reference.sql` v13 + جدول حسابات QA في `supabase/AGENTS.md`). القرينة الإضافية: hash الـadmin في الـseed مطابق حرفيًا لـhash `admin@test.eduzone.local` الموثق بأن كلمته `Admin@12345`.

---

## 4. القرارات المعمارية (فكّر)

1. **Architecture Check كبوابة صريحة لا مجرد تضمين:** سلسلة §19 تعده بوابة قائمة بذاتها؛ فصله جعل الانتهاك يظهر كـcheck أحمر مسمّى قبل الجناح الكامل (≈3 ثوانٍ) — دون إلغاء التغطية المزدوجة من Lint/Test.
2. **E2E شرطي لا دائم:** بدون backend حقيقي (تسجيل دخول فعلي ضد Supabase) كل التشغيلات ستفشل — البوابة الحمراء الدائمة تُعطَّل وتحمي لا شيء (نفس منطق تعليق `--prod` في باب audit). الشرطية تجعل التفعيل قرارًا واعيًا بمتغير مستودع.
3. **RLS/Integration مؤجلة بإجراءات محددة — لا wiring الآن:** السكربتات تعتمد `console.assert` الذي **لا يفشل العملية** في Node (تصل `exit(0)` حتى مع breach) — ربطها كبوابة الآن يوهم بحماية غير موجودة. المطلوب أولًا: hardening (تتبع فشل + `exit(1)`) ثم توفير `.env.test`/backend مُبوَّم.
4. **Deployment Smoke غير قابل للتعريف حاليًا:** لا يوجد pipeline نشر في المستودع (deploy.yml checks-only عمدًا) — البوابة تُعرَّف عند عودة النشر للمستودع أو توثيق مساره الخارجي.
5. **Parity بين PR وmain:** أي بوابة تُتاح للـPR تُكرَّر على الـpush المباشر لـ`main` — قاعدة §19 («لا merge بفشل gate») لا تنفذ إلا بإغلاق الطريقين.
6. **قيم next/public placeholder كما هي:** حتمية البناء دون أسرار — النمط القائم موثق داخل ci.yml.

---

## 5. ملفات التغيير

**معدّلة (4):**
- `.github/workflows/ci.yml` — Architecture Check + ترتيب سلسلة §19 + ترويسة توثيقية (gates + branch protection)
- `.github/workflows/deploy.yml` — parity: Gitleaks + Dependency Audit + Architecture Check
- `apps/admin/playwright.config.ts` — webServer/reporter لباب CI
- `apps/admin/tests/e2e/auth.setup.ts` — إصلاح كلمة مرور الـseed (v13)

**جديدة (1):**
- `.github/workflows/e2e.yml` — بوابة E2E الخاملة (شرط `vars.E2E_ENABLED`)

---

## 6. التحقق (تأكد)

| الفحص | الأمر / الوسيلة | النتيجة |
|---|---|---|
| Architecture Check **كما سيُنفَّذ في CI حرفيًا** | `pnpm --filter @eduzone/admin exec vitest run --config vitest.unit.config.ts src/architecture` (من الجذر) | ✅ **754/754 PASS — exit=0** |
| صلاحية YAML للملفات الثلاثة | `python -c "import yaml; …safe_load…" ci/deploy/e2e` | ✅ **YAML_OK** |
| Typecheck (كامل الـworkspace) | `pnpm typecheck` | ✅ 4/4 tasks — exit=0 (يغطي `playwright.config.ts` و`auth.setup.ts` بترجمة strict) |
| Lint (كامل الـworkspace) | `pnpm lint` | ✅ 4/4 tasks — exit=0 |
| Unit | لم يتغير كود التطبيق — جناح vitest غير متأثر | ✅ آخر تشغيل: 43 ملفًا / 1068 (في M14 على نفس الشجرة) |
| تشغيل E2E فعليًا | — | ⛔ **غير قابل محليًا** (يتطلب Docker + Supabase CLI) — البوابة **مُعرَّفة غير مُتحقق تشغيلها**، مفعّلة عبر checklist §3.3 |
| Merge protection | إعداد GitHub UI | 📋 موثق في ترويسة ci.yml: جعل `build_and_test` (+`e2e` بعد التفعيل) required checks |

**failing tests before/after:** لا اختبارات فاشلة قبل أو بعد (المرحلة بنية تحتية CI) — إثبات الأبواب: باب Architecture صريح وأخضر محليًا بنفس أمر CI.

---

## 7. ما تبقّى (خارج نطاق هذه المرحلة — بإجراءات محددة)

1. **تفعيل E2E:** تشغيل `e2e.yml` مرة واحدة مراقَبة (Docker على الـrunner) ← ضبط أي فجوات runtime env ← `E2E_ENABLED=true` ← إضافة `e2e` كـrequired check.
2. **بوابة Security/RLS:** hardening `scripts/security/*.ts` (استبدال `console.assert` بتتبع فشل + `exit(1)`)، ثم توصيلها بـSupabase محلي في CI بنفس نمط e2e.yml (بدل `.env.test` السحابي).
3. **Integration gate مستقلة:** فصل اختبارات MSW-level إلى مشروع vitest خاص كبوابة مسماة (حاليًا داخل Unit).
4. **Deployment Smoke:** عند وجود pipeline نشر في المستودع (أو توثيق المسار الخارجي) — health endpoint + فحص صفحة دخول.
5. **Branch protection** (إجراء GitHub UI، خارج الملفات): required checks = `build_and_test` الآن، `e2e` بعد التفعيل.

