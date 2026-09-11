'use client';

import { Suspense } from 'react';

import { AdminShell } from '@/features/layout';
import { FeatureFlagsPage } from '@/features/settings';

export default function FlagsRoute() {
  return (
    <AdminShell>
      <Suspense>
        <FeatureFlagsPage />
      </Suspense>
    </AdminShell>
  );
}
