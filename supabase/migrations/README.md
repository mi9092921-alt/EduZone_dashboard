# Agent Task Prompt — EduZone Bug Fixes

## ⚠️ MANDATORY CONSTRAINTS — READ BEFORE ANY ACTION

These rules are **absolute and non-negotiable**. Violating any of them will invalidate the entire task.

```
❌ NO migrations of any kind
❌ NO patch files
❌ NO architectural changes
❌ NO new abstractions, services, or layers
❌ NO discussions, questions, or alternative proposals
❌ DO NOT modify any file inside /supabase/ unless explicitly stated below
❌ DO NOT touch schema files
✅ ONLY modify existing Flutter/Dart project files
✅ Apply only the minimum change required to fix the reported issue
✅ Fix code, not infrastructure
```

**If you are about to create a migration, patch, or new architecture — STOP. That action is forbidden.**

---

والاهم
###قاعدة البيانات في مرحلة التطوير، لذا يجب تطبيق كافة الإصلاحات والتعديلات مباشرة على الملفات المرجعية الأساسية لمخطط القاعدة داخل المجلد `supabase/schema/` من الجذور، ويمنع منعاً باتاً إنشاء أي ملفات هجرة (migrations) أو رقع (patches) أو حلول مؤقتة.
##المتطلبات الأساسية المطلوبة:

1. إصلاح الثغرات الأمنية من الجذور:
2. توحيد وتأمين جميع جداول الميزات داخل المخطط الرئيسي:
3. حظر ملفات SQL الخارجية وأرشفتها:

- توحيد كافة ملفات SQL الفعالة حصرياً داخل `supabase/schema/`.
- عدم حذف أي ملف SQL خارجي أو مسودة أو ملف ثانوي بل أرقامها ونقلها بالكامل إلى مجلد النسخ الاحتياطية `supabase/_archived_patches/`.

4. لا اريد ملفات جديدة داخل `supabase/schema/`.
