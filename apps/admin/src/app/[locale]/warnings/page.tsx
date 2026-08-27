'use client';

import { AdminShell } from '@/features/layout';
import { WarningsPage } from '@/features/teacher';

export default function WarningsRoute() {
  return (
    <AdminShell>
      <WarningsPage />
    </AdminShell>
  );
}
