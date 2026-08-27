import { AdminShell } from '@/features/layout';
import { TenantDetailPage } from '@/features/tenants';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <TenantDetailPage tenantId={id} />
    </AdminShell>
  );
}
