'use client';

import { AdminShell } from '@/features/layout';
import { JobsPage } from '@/features/jobs';

export default function JobsRoute() {
  return (
    <AdminShell>
      <JobsPage />
    </AdminShell>
  );
}
