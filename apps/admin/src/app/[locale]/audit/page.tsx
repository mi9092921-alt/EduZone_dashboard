'use client';

import { AdminShell } from '@/features/layout';
import { AuditPage } from '@/features/audit';

export default function AuditRoute() {
  return (
    <AdminShell>
      <AuditPage />
    </AdminShell>
  );
}
