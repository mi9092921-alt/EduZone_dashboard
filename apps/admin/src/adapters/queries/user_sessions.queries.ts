import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getUserSessions } from '@/infrastructure/repos/user_sessions.service';

const PAGE_SIZE = 20;

export function useUserSessions(userId: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.users.sessions(userId),
    queryFn: () => getUserSessions(userId, limit),
    staleTime: 30_000, // 30 seconds
  });
}

/** Paginated variant for activity views — 20 rows per page, "load more" driven. */
export function useUserSessionsInfinite(userId: string) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.users.sessions(userId), 'infinite'],
    queryFn: ({ pageParam }) => getUserSessions(userId, PAGE_SIZE, pageParam * PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    staleTime: 30_000, // 30 seconds
  });
}
