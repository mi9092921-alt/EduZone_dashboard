import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/adapters/queries/keys';
import { AdminShell } from '@/features/layout';
import { UsersPage } from '@/features/users';
import { getUserStats } from '@/infrastructure/repos/users.service';
import { createServerClient } from '@/infrastructure/supabase/server';

export default async function UsersRoute() {
  const queryClient = new QueryClient();

  // Initialize server client to fetch admin's current tenant context
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Determine tenant_id from the base table.
    const { data: adminProfile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .single();

    if (adminProfile) {
      await queryClient.prefetchQuery({
        queryKey: [...queryKeys.users.all, 'stats', adminProfile.tenant_id],
        queryFn: () => getUserStats(adminProfile.tenant_id),
      });
    } else {
      await queryClient.prefetchQuery({
        queryKey: [...queryKeys.users.all, 'stats', undefined],
        queryFn: () => getUserStats(),
      });
    }
  }

  return (
    <AdminShell>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <UsersPage />
      </HydrationBoundary>
    </AdminShell>
  );
}
