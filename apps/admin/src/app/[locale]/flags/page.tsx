'use client';

import { AdminShell } from '@/features/layout';
import { FeatureFlagsPage } from '@/features/settings';

export default function FlagsRoute() {
  return (
    <AdminShell>
      <FeatureFlagsPage />
    </AdminShell>
  );
}
