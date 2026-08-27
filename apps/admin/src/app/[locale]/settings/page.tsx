'use client';

import { AdminShell } from '@/features/layout';
import { SettingsPage } from '@/features/settings';

export default function SettingsRoute() {
  return (
    <AdminShell>
      <SettingsPage />
    </AdminShell>
  );
}
