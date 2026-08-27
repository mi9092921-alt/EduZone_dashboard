'use client';

import { AdminShell } from '@/features/layout';
import { StudentProgressPage } from '@/features/teacher';

export default function StudentProgressRoute() {
  return (
    <AdminShell>
      <StudentProgressPage />
    </AdminShell>
  );
}
