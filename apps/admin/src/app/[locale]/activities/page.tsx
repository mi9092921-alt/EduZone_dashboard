'use client';

import { ActivitiesPage } from '@/features/activities/components/ActivitiesPage';
import { AdminShell } from '@/features/layout';

export default function ActivitiesRoute() {
  return (
    <AdminShell>
      <ActivitiesPage />
    </AdminShell>
  );
}
