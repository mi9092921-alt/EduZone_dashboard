'use client';

import { AdminShell } from '@/features/layout';
import { ActivitiesPage } from '@/features/activities/components/ActivitiesPage';

export default function ActivitiesRoute() {
  return (
    <AdminShell>
      <ActivitiesPage />
    </AdminShell>
  );
}
