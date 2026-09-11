'use client';

import { Suspense } from 'react';

import { AuditPage } from '@/features/audit';
import { AdminShell } from '@/features/layout';

export default function AuditRoute() {
  return (
    <AdminShell>
      <Suspense>
        <AuditPage />
      </Suspense>
    </AdminShell>
  );
}
