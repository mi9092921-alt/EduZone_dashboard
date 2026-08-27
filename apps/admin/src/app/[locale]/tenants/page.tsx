import { AdminShell } from '@/features/layout';
import { TenantsPage } from '@/features/tenants';

export default function Page() {
  return (
    <AdminShell>
      <TenantsPage />
    </AdminShell>
  );
}
