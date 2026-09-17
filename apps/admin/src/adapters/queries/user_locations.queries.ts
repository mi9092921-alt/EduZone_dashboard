import { useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getUserLocationLogsForActivityAction } from '@/adapters/actions/activities.actions';

const PAGE_SIZE = 20;

export function useUserLocationLogs(userId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.locations(userId),
    // M-ACTIVITIES-FULL: user_location_logs is partitioned with deny-all on
    // child partitions for authenticated — browser reads are incomplete. Use
    // the tenant-scoped service-role action instead.
    queryFn: ({ pageParam }) =>
      getUserLocationLogsForActivityAction(userId, PAGE_SIZE, pageParam * PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 30_000, // 30 seconds
  });
}
