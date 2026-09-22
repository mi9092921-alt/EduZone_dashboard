'use client';

import { AdminShell } from '@/features/layout';
import { InboxPage } from '@/features/notifications';

/**
 * Personal notification inbox — every authenticated user, no permission
 * gate (all actions inside are requireUser-scoped to the caller's own
 * rows). The admin broadcast management surface lives at /notifications.
 */
export default function InboxRoute() {
  return (
    <AdminShell>
      <InboxPage />
    </AdminShell>
  );
}
