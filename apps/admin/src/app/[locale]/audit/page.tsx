'use client';

import { AuditPage } from '@/features/audit';
import { AdminShell } from '@/features/layout';

export default function AuditRoute() {
  return (
    <AdminShell>
      <AuditPage />
    </AdminShell>
  );
}
