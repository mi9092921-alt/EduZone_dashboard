import { Suspense } from 'react';

import { AdminShell } from '@/features/layout';
import { TenantsPage } from '@/features/tenants';

export default function Page() {
  return (
    <AdminShell>
      <Suspense>
        <TenantsPage />
      </Suspense>
    </AdminShell>
  );
}
