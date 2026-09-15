import { useInfiniteQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getUserLocationLogs } from '@/infrastructure/repos/user_location_logs.service';

const PAGE_SIZE = 20;

export function useUserLocationLogs(userId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.locations(userId),
    queryFn: ({ pageParam }) => getUserLocationLogs(userId, PAGE_SIZE, pageParam * PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 30_000, // 30 seconds
  });
}
