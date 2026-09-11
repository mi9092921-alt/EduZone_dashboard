'use client';

import { Suspense } from 'react';

import { ActivitiesPage } from '@/features/activities/components/ActivitiesPage';
import { AdminShell } from '@/features/layout';

export default function ActivitiesRoute() {
  return (
    <AdminShell>
      <Suspense>
        <ActivitiesPage />
      </Suspense>
    </AdminShell>
  );
}
