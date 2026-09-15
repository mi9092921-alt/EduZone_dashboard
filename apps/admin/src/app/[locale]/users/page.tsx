import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { Suspense } from 'react';

import { queryKeys } from '@/adapters/queries/keys';
import { AdminShell } from '@/features/layout';
import { UsersPage } from '@/features/users';
import { getUserStatsWithClient } from '@/infrastructure/repos/users.service';
import { createServerClient } from '@/infrastructure/supabase/server';

export default async function UsersRoute() {
  const queryClient = new QueryClient();

  // Use the request-scoped server client for the initial stats query. The
  // repository intentionally uses a browser client for client-side queries;
  // calling it from this Server Component would drop the user's auth cookies.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await queryClient.prefetchQuery({
      // Match UserStatsCards' query key so hydration avoids a duplicate RPC.
      queryKey: [...queryKeys.users.all, 'stats', undefined],
      queryFn: () => getUserStatsWithClient(supabase),
    });
  }

  return (
    <AdminShell>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense>
          <UsersPage />
        </Suspense>
      </HydrationBoundary>
    </AdminShell>
  );
}
