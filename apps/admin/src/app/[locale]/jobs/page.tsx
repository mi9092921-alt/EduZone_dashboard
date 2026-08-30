'use client';

import { JobsPage } from '@/features/jobs';
import { AdminShell } from '@/features/layout';

export default function JobsRoute() {
  return (
    <AdminShell>
      <JobsPage />
    </AdminShell>
  );
}
