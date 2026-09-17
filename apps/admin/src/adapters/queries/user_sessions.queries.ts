import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getUserSessionsForActivityAction } from '@/adapters/actions/activities.actions';

const PAGE_SIZE = 20;

export function useUserSessions(userId: string, limit = 20) {
  return useQuery({
    // M-ACTIVITIES-FULL: sessions is partitioned with deny-all on child
    // partitions for authenticated — browser reads are incomplete. Use the
    // tenant-scoped service-role action instead.
    queryKey: queryKeys.users.sessions(userId),
    queryFn: () => getUserSessionsForActivityAction(userId, limit, 0),
    staleTime: 30_000, // 30 seconds
  });
}

/** Paginated variant for activity views — 20 rows per page, "load more" driven. */
export function useUserSessionsInfinite(userId: string) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.users.sessions(userId), 'infinite'],
    queryFn: ({ pageParam }) =>
      getUserSessionsForActivityAction(userId, PAGE_SIZE, pageParam * PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 30_000, // 30 seconds
  });
}
