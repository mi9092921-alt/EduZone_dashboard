# M13 — Audit & Observability Report (Execution Plan §17)

- **التاريخ:** 2026-09-03
- **المنهجية:** شوف → افحص → فكّر → عدّل → تأكد (حلقة كاملة مع إعادة فحص)
- **الحالة:** ✅ مكتمل — 852/852 اختبارًا أخضر، typecheck نظيف، lint نظيف، 538 architecture guard أخضر

---

## 1. الهدف (من الخطة §17 — P1, M12 في ترتيب التنفيذ)

1. **مصدر حدث الـaudit هو الـUse Case وليس الواجهة:** كل عملية حساسة تصدر إدخال audit يحمل correlation id (`requestId`) من سياق المستدعِ المصرَّح له.
2. **سلسلة الاختبار:** `operation → audit entry → correlation id → observable log` — قابلة للاختبار آليًا.
3. **عدم كسر سلسلة الـhash chain:** كل الكتابات عبر `log_activity_async` (قائمة الانتظار → `flush_activity_logs` → `activity_logs` المترابط بالـhash)، بلا إدراجات مباشرة.
4. **Structured logging:** إدخال JSON واحد لكل حدث بحقول قياسية (`requestId`, `userId`, `tenantId`, `duration`, `result`) مع إخفاء (redaction) لكل المفاتيح الحساسة.

---

## 2. ما الذي وجدناه (شوف + افحص)

| الفجوة | التفصيل |
|---|---|
| مصدر الأحداث هو الـboundary وليس الـuse case | `logActivityAsync` كان يُستدعى فقط من `bulk-action/route.ts`؛ use cases المستخدمين (إنشاء/حذف/تحكم/إنهاء جلسات/إنذار) والإشعارات والـtenants لا تكتب audit إطلاقًا |
| تجاوز قائمة الانتظار | `logSuspension` في `tenant-admin.repository.ts` كان يُدرج مباشرة في `activity_logs` متخطيًا `log_activity_async` والـhash chain |
| `requestId` ميت | معرَّف في `RequestContext` لكن `authorizeCaller` لا يولّده أبدًا |
| `ILogger`/`ITracer` بلا مستخدمين | الـports موجودة لكن كل الـuse cases تستخدم `console.error` خام بلا requestId/tenantId وبلا redaction |
| تغييرات settings غير مدققة | access rules / feature flags / rate limits / حذف الدورات كانت تمر بلا أي audit entry |

---

## 3. ما الذي نُفِّذ (عدّل)

### 3.1 Port جديد — `application/ports/IAuditLogger.ts`
- `IAuditLogger.record(ctx, event)` مع `AuditEventInput` (type, summary, details, riskLevel, targetUserId, outcome).
- عقد **best-effort** موثق: التنفيذ يجب ألا يرمي أخطاء النقل (العملية نجحت بالفعل)، لكن المستدعي ينتظر الوعد ليتمكن الاختبار من ملاحظة الحدث.
- `createRequestId()` — مولّد correlation id (`req_<base36 time>_<random>`).

### 3.2 تنفيذ الـinfrastructure — `infrastructure/observability/audit-logger.service.ts`
- `SupabaseAuditLogger`: يكتب عبر `log_activity_async` (SECURITY DEFINER، مسموح لـauthenticated + service_role) عبر عميل service-role، فيصل كل إدخال إلى `activity_log_queue` ثم `flush_activity_logs` ثم `activity_logs` المترابط.
- الحمولة (details) تحمل دائمًا: `request_id` (correlation)، `actor_role`، `outcome`، وعند الحاجة `summary` و`target_user_id`.
- **لا يرمي أبدًا:** فشل النقل يُسجَّل server-side بصيغة `[audit-logger] log_activity_async failed:` مع السياق — مسار audit مكسور صامتًا يصبح قابلًا للرصد.
- `makeAuditLogger()` — نقطة الإنشاء الوحيدة التي تُحقن من الـboundaries.

### 3.3 Correlation id — `application/authorization/authorization.service.ts`
- `authorizeCaller` يولّد `requestId` واحدًا لكل طلب ويحمله في كل `createRequestContext` الخمسة (super-admin، fast-path، RPC-path) — فيصل تلقائيًا لكل audit event وسجل صادر عن الطلب.

### 3.4 إزالة تجاوز قائمة الانتظار
- حذف `logSuspension` من `ITenantAdminRepository` ومن التنفيذ (الإدراج المباشر في `activity_logs`)؛ استبداله بـ`audit.record` عبر `log_activity_async` داخل `SuspendTenantUseCase` (مع try/catch — فشل الـaudit لا يفشل التعليق، كما كان العقد سابقًا).

### 3.5 Structured logging — `ConsoleLogger` أعيدت كتابته
- إدخال JSON واحد: `{ ts, level, msg, ...context }` عبر `console.info/warn/error/debug`.
- **Redaction:** مفاتيح مطابقة لـ`/password|passwd|secret|token|authorization|auth_header|service_role|apikey|api_key|session_key/i` تُقنَّع بـ`[REDACTED]` قبل التسلسل.
- `error()` يحوّل الـError إلى `{ name, message }` — لا stack dumps في السجل.
- `NoopTracer` أصبح يُصدر span entries عبر الـlogger: `{ traceId, duration, result, error? }` (b願い نفس مسار الـstructured logging؛ استبدال بـSentry/OTel tracer لاحقًا دون تغيير الـport).

### 3.6 الـuse cases كمصدر للأحداث

| Use case | الحدث | riskLevel |
|---|---|---|
| `CreateUserUseCase` | `user_created` (نجاح/فشل/compensation-clean/compensation-failed→**critical**) | medium/high/critical |
| `DeleteUserUseCase` | `user_deleted` (نجاح وفشل) | high |
| `ControlUserAccountUseCase` | `account_controlled` (يشمل action/reason/resulting_status) | high |
| `TerminateUserSessionsUseCase` | `sessions_terminated` (مع العدد) | high |
| `IssueWarningUseCase` | `warning_issued` (severity≥3→high) | medium/high |
| `SendNotificationUseCase` | `notification_sent` / `notification_send_failed` (عدد المستلمين فقط — لا body) | medium |
| `DeleteNotificationUseCase` | `notification_deleted` | medium |
| `Create/Update/Suspend/DeleteTenantUseCase` | `tenant_created/updated/suspended/deleted` | high |
| `manage-notifications` boundary | `notification_deleted` عبر الـaudit logger المحقون | medium |

### 3.7 تغييرات settings في `admin.actions.ts` (audit على مستوى الـboundary مع ctx)

`access_rule_upserted/deleted/toggled`، `feature_flag_created/updated/deleted/toggled`، `rate_limit_rule_toggled`، `rate_limit_block_cleared`، `course_deleted` (high) — كلها بعد نجاح العملية، مع الحفاظ على `assertSameTenant` كما هو.

### 3.8 `bulk-action/route.ts`
- `requestId` مولّد واحد يُحمَل في `bulk_action_queued` و`bulk_action_completed` (تفسير دالة `processInlineBulkJob` توسّع بارامتر `requestId?`) — الربط بين إدخالي الانتظار والإكمال لنفس المهمة أصبح ممكنًا.

---

## 4. القرارات المعمارية (فكّر)

1. **الحقن لا الاستيراد:** application ممنوع من `@/container` و`infrastructure` (guard §533) — لذا `IAuditLogger` port + حقن من الـserver actions/boundaries.
2. **الافتراضي في الـimpl وليس الـevent:** `riskLevel ?? 'low'` و`outcome ?? 'success'` يُطبقان في `SupabaseAuditLogger` عند بناء الحمولة — الـuse case يصدر الحدث الخام والاختبارات تحقق على ما يُصدره الـuse case (والافتراضيات مغطاة في اختبار الـinfra).
3. **إبقاء try/catch للاستدعاءات الحساسة:** تعليق الـtenant (Suspend) يحافظ على السلوك القديم «فشل الـaudit لا يفشل العملية» عبر المستوى المزدوج (الـimpl لا يرمي + try/catch في الـuse case كحزام أمان).
4. **إخفاء password/body من الحمولة:** اختبارات صريحة ترفض وجود كلمة المرور أو نص الإشعار في أي audit event.
5. **لا تغييرات على قاعدة البيانات:** `log_activity_async` و`flush_activity_logs` موجودان ومُصرَّح لهما (RPC catalog entries 79/265) — المهمة كانت ربط المصدر فقط.

---

## 5. ملفات التغيير

**جديدة:**
- `apps/admin/src/application/ports/IAuditLogger.ts`
- `apps/admin/src/infrastructure/observability/audit-logger.service.ts`
- `apps/admin/src/infrastructure/observability/audit-logger.service.test.ts`

**معدّلة (تطبيق):**
- `application/ports/index.ts` (تصدير الـport)
- `application/ports/ITenantAdminRepository.ts` (+`infrastructure/repos/tenant-admin.repository.ts`): حذف `logSuspension`
- `application/authorization/authorization.service.ts`: توليد `requestId`
- `infrastructure/observability/ConsoleLogger.ts` (structured + redaction)، `NoopTracer.ts` (span entries)
- use cases: `users/create-user`، `users/delete-user`، `users/account-control`، `notifications/send-notification`، `notifications/manage-notifications`، `tenants/manage-tenants`
- boundaries: `adapters/actions/user.actions.ts`، `tenants.actions.ts`، `admin.actions.ts`، `app/api/bulk-action/route.ts`

**معدّلة (اختبارات):**
- `create-user.use-case.test.ts` (+4 اختبارات M13)، `delete-user.use-case.test.ts` (أُعيد بناؤه)، `account-control.use-case.test.ts` (+audit assertions)، `manage-tenants.use-case.test.ts` (+audit assertions)، `send-notification.use-case.test.ts` (+3 اختبارات M13)، `manage-notifications.use-case.test.ts` (+audit)

---

## 6. التحقق (تأكد)

| الفحص | النتيجة |
|---|---|
| `pnpm typecheck` | ✅ نظيف |
| `pnpm lint` (`eslint . --max-warnings=0`) | ✅ نظيف |
| `pnpm test` (unit كاملة) | ✅ **43 ملفًا / 852 اختبارًا** ناجحة |
| Architecture guards (`layer-boundaries.test.ts`) | ✅ 538 assertions — application لا يزال محظورًا من container/infrastructure |
| اختبار العقد الجديد | ✅ `operation → audit entry → correlation id` مؤكد آليًا (request_id في الحمولة) |
| best-effort | ✅ فشل النقل لا يرمي ولا يفشل العملية (مُختبر) |
| redaction | ✅ لا password/body في أي audit event (مُختبر) |

---

## 7. ما تبقّى (خارج نطاق هذه المرحلة)

- `INotificationAdminRepository` الحقيقي يُبنى من `notifications.repository.ts` — الحقن تم عبر الـactions القائمة دون تغيير الـrepository نفسه.
- استبدال `NoopTracer` بـSentry/OTel tracer حقيقي عند تفعيل distributed tracing (نفس الـport، drop-in).
- حذف الإشعارات الجماعية (`deleteAllMyNotificationsAction` مسار self-service) لم يُدرَج كحدث audit لكونه عملية self على الصندوق الشخصي — يمكن إضافته لاحقًا عند توسيع نطاق الأحداث.
