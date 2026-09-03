# Branch Protection — Required Configuration

## هذا الملف يوثق إعداد Branch Protection المطلوب على `main`
## يجب تفعيله يدويًا في GitHub UI عند كل إنشاء جديد للمستودع.

---

## الخطوات (GitHub UI)

```
Settings → Branches → Add branch ruleset
```

| الإعداد | القيمة |
|---|---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Required number of approvals | 1 (minimum) |
| Require status checks to pass before merging | ✅ |
| Required status checks | `build_and_test` (من `ci.yml`) |
| Require branches to be up to date before merging | ✅ |
| Do not allow bypassing the above settings | ✅ |
| Restrict force pushes | ✅ |
| Restrict deletions | ✅ |

## Required Status Check: `build_and_test`

هذا الـcheck يغطي السلسلة الكاملة من `ci.yml`:

```
Secret Scan → Dependency Audit → Architecture Check
→ Lint → Typecheck → Unit Tests → Build → DB Lint
```

## ملاحظة

- لا يمكن تعريف Branch Protection بملف في المستودع — يستلزم فعلًا يدويًا.
- راجع `.github/workflows/ci.yml` للـjob name المطلوب (`build_and_test`).
- تفعيل E2E لاحقًا يُضيف `e2e` كـrequired check بعد تفعيل `vars.E2E_ENABLED`.
