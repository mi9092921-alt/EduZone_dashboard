'use client';

import { AdminShell } from '@/features/layout';
import { CourseAnalyticsPage } from '@/features/teacher';

export default function AnalyticsRoute() {
  return (
    <AdminShell>
      <CourseAnalyticsPage />
    </AdminShell>
  );
}
