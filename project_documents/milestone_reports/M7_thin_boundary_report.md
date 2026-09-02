# M7 — Route / Server Action Thin Boundary — تقرير تنفيذ

> المرحلة: **#11 / P0 — Route / Server Action Thin Boundary** (M7 في ترتيب التنفيذ)
> التاريخ: 2026-09-02
> المنهجية: شوف → افحص → فكّر → عدّل → تأكد (نُفِّذت الحلقة كاملة مع إعادة فحص)

---

## 1. Current State (قبل التنفيذ)

ملفات الـServer Actions في `application/actions/` كانت تحتوي منطقًا تجاريًا وorchestration لقاعدة البيانات مباشرة:

| الملف | الحجم | التصنيف | الحالة |
|---|---|---|---|
| `admin.actions.ts` | 500 سطر | READ/WRITE/ADMIN | 24 action رقيق (تفويض لخدمات infrastructure) ✓ + 9 actions سمينة في نطاق الإشعارات ✗ |
| `user.actions.ts` | 292 سطر | WRITE/ADMIN | `createUserAction` و`deleteUserAction` سمينتان ✗ + 3 RPC actions |
| `session.actions.ts` | 104 أسطر | SESSION | `recordCurrentSessionAction` سمينة بالكامل ✗ |
| `tenants.actions.ts` | 110 أسطر | TENANT | عمليات CRUD + audit داخل الـaction ✗ |
| `video.actions.ts` | 17 سطر | VIDEO | رقيقة ✓ (لم تُمسّ) |

## 2. Findings (المخالفات الفعلية)

1. **service_role داخل الحدود**: `createAdminClient()` كان مستوردًا ومستخدمًا مباشرة داخل ملفات actions — مخالفة مباشرة لهدف M4/M7.
2. **Business rules داخل actions**: حسم مستلمي الإشعارات (3 جداول) + fanout + push worker؛ إنشاء مستخدم مع **compensation**؛ slug uniqueness + defaults المنصة؛ جلسة heartbeat (touch/create + عدّاد تسجيل).
3. **DB orchestration كبير**: `getNotificationsAction` (استعلامان + تجميع إحصائيات)، `getMyNotificationsAction` (استعلامان + mapping).
4. **Authorization مكرر**: ثلاث نسخ (`requirePermission`/`verifyCallerPermission`/`requireSuperAdmin`).
5. **اختراق طبقات**: application (actions) تستورد أنواعًا من adapters.

## 3. Risk

- كسر عقود الاستدعاء الحالية (adapters/features/tests تعتمد على توقيعات الـactions).
- تغيير رسائل الأخطاء المعروضة للعميل.
- **قاعدة البيانات المشتركة**: لم يُغيَّر أي schema/RPC/RLS — لا أثر على `EduZone_App`.

## 4. Target State

```
Action (validate → authenticate/authorize → use case → map response)
    ↓
UseCase (application/use-cases — business rules فقط)
    ↓
Port (application/ports — interface)
    ↓
Repository Impl (infrastructure/repos — Supabase + admin client حصريًا)
```

## 5. Files Changed

### جديدة — Ports (application/ports/)
- `INotificationAdminRepository.ts` — broadcast + inbox
- `IUserAdminRepository.ts` — دورة حياة المستخدم المتميزة
- `ISessionRepository.ts` — heartbeat
- `ITenantAdminRepository.ts` — إدارة المستأجرين
- تحديث `index.ts` (barrel)

### جديدة — Repository Implementations (infrastructure/repos/)
- `notifications.repository.ts` — يملك `createAdminClient()` لنطاق الإشعارات
- `user-admin.repository.ts` — auth admin API + RPCs المتميزة (`issueWarning` عبر server client كما كان)
- `session.repository.ts`
- `tenant-admin.repository.ts`

كل مستودع يقبول `SupabaseClient` كمعامل اختياري للاختبار، ويستخدم `createAdminClient()` افتراضيًا — **أصبح إنشاء service_role محصورًا في infrastructure**.

### جديدة — Use Cases (application/use-cases/)
- `notifications/send-notification.use-case.ts` — حسم المستلمين + fanout + push best-effort
- `notifications/manage-notifications.use-case.ts` — قائمة admin + حذف (tenant-scoped)
- `notifications/inbox.use-case.ts` — inbox + mark read + unread count (degrade gracefully)
- `users/create-user.use-case.ts` — إنشاء مع compensation كامل
- `users/delete-user.use-case.ts` — حذف + soft-delete fallback دائم
- `users/account-control.use-case.ts` — control/terminate/warning (RPC mapping)
- `auth/record-current-session.use-case.ts` — heartbeat (metadata تُمرَّر من الحدود)
- `tenants/manage-tenants.use-case.ts` — create/update/suspend(+audit)/delete

### جديدة — Boundary مشترك
- `application/actions/boundary.ts` — `requirePermission` / `requireUser` / `requireSuperAdmin` (deny-by-default)

### مُعدَّلة — Actions (أصبحت رقيقة)
- `admin.actions.ts`: 500 → ~260 سطرًا. **لم يعد يستورد `createAdminClient` إطلاقًا.**
- `user.actions.ts`: 292 → ~140 سطرًا (validate → authorize → use case).
- `session.actions.ts`: validate + auth + استخراج headers → use case.
- `tenants.actions.ts`: super-admin gate → use case.

### مُعدَّلة — Types & Adapters
- `domain/types/notification.types.ts` (جديد) — المصدر الموحد للأنواع.
- `adapters/queries/notifications.queries.ts` + `adapters/mutations/notifications.mutations.ts` — re-export للتوافق الخلفي (لا تغيير على أي مستهلك UI).

### اختبارات جديدة (8 ملفات)
- `send-notification.use-case.test.ts`, `manage-notifications.use-case.test.ts`, `inbox.use-case.test.ts`
- `create-user.use-case.test.ts`, `delete-user.use-case.test.ts`, `account-control.use-case.test.ts`
- `record-current-session.use-case.test.ts`, `manage-tenants.use-case.test.ts`

## 6. Dependency Impact

- توقيعات جميع الـactions **لم تتغير** → `notifications.service.ts`, `tenants.service.ts`, `users.mutations.ts`, `useSessionCheck.ts`, `AuthProvider`, `LoginPage`, `NotificationBell`, `NotificationsPage` تعمل دون تعديل.
- الاختبارات الحالية التي تعمل mock للـactions لم تتأثر.

## 7. Shared DB Impact

**صفر** — لا تعديل على `supabase/schema/` ولا على RPCs ولا على RLS. نفس الاستعلامات نُقلت verbatim. لا يتطلب cross-repo verification مع `EduZone_App`.

## 8. Implementation Notes (قرارات معمارية)

1. بوابة الحدود المشتركة تُلغي الـauthorization المكرر.
2. نقل أنواع الإشعارات إلى domain يصلح اختراق application → adapters.
3. `createUserAction`: tenant المدير يُقرأ من `RequestContext` (authorizeCaller يجلبه من نفس الجدول وبنفس الشروط) — أُزيل استعلام مكرر؛ رسالة `'Could not determine admin tenant ID'` محفوظة.
4. سلوك الـlogging محفوظ: نفس البادئات في console.error.
5. سلوك degrade في inbox (إرجاع قيمة فارغة عند الفشل) محفوظ.
6. اختلاف وحيد مقصود: أخطاء authorization في user.actions تُسجَّل الآن server-side عبر catch الحدود (كانت تُبتلع). الاستجابة للعميل مطابقة.

## 9. Validation (أوامر + نتائج)

| الفحص | قبل | بعد |
|---|---|---|
| `pnpm --filter @eduzone/admin typecheck` | PASS | PASS |
| `pnpm --filter @eduzone/admin lint` | PASS | PASS |
| `pnpm --filter @eduzone/admin test` (unit) | PASS | PASS (شامل اختبارات use cases الجديدة) |

## 10. Regression Check + Grep Proof

```
admin.actions.ts   : createAdminClient=False(from code) from=False rpc=False
boundary.ts        : createAdminClient=False from=False rpc=False
session.actions.ts : createAdminClient=False from=False rpc=False
tenants.actions.ts : createAdminClient=False from=False rpc=False
user.actions.ts    : createAdminClient=False from=False rpc=False
video.actions.ts   : createAdminClient=False from=False rpc=False
```

`createAdminClient` محصور بعد التنفيذ في: `infrastructure/supabase/admin.ts` (المصدر)، `infrastructure/repos/*` (المستودعات والخدمات)، ومسارات API المصرّح بها (bulk-action, cron, audit-cleanup — نطاق M4).

## 11. Remaining Risks / Follow-ups (للمرحلات التالية)

1. **[M8]**: خدمات `infrastructure/repos/*.service.ts` الوسيطة (notifications/tenants/warnings/feature-flags) لا تزال تفوّض إلى الـactions (علاقة معكوسة تاريخية). يجب عكس اتجاهها أو اعتبارها transport adapters، مع architecture tests.
2. **[M8/M13]**: ربط Use Cases بالـports عبر wiring مركزي بدل التركيب داخل الـaction.
3. **[M9 — Error Architecture]**: `session.actions` و`user.actions` يعيدان رسائل DB خام في حقول `error` (سلوك قائم) — يلزم external-safe mapping.
4. **[أمني — P1]**: `deleteUserAction` يحذف عبر service_role دون تأكيد tenant للمستخدم الهدف. سلوك قائم **لم يُغيَّر** (ممنوع تغيير السلوك دون ضرورة في M7)؛ يوصى بإضافة target-tenant assertion في `DeleteUserUseCase`.
5. **[M11]**: fanout الإشعارات وإنشاء المستخدم عمليات multi-step بلا transaction واحدة — الـcompensation يدوي.

## 12. Exit Criteria — الحالة

```
[x] business rules اختفت من actions        → انتقلت إلى use cases مختبرة
[x] service_role creation اختفت من actions  → محصورة في infrastructure/repos
[x] duplicated authorization اختفت          → application/actions/boundary.ts
[x] large DB orchestration اختفت من actions → repositories
[x] typecheck + lint + tests PASS
[x] لا تغيير في عقود الاستدعاء العامة ولا في قاعدة البيانات المشتركة
```

