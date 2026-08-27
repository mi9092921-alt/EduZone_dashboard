'use client';

import { AdminShell } from '@/features/layout';
import { NotificationsPage } from '@/features/notifications';

export default function NotificationsRoute() {
  return (
    <AdminShell>
      <NotificationsPage />
    </AdminShell>
  );
}
