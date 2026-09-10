import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getUserSessions } from '@/infrastructure/repos/user_sessions.service';

export function useUserSessions(userId: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.users.sessions(userId),
    queryFn: () => getUserSessions(userId, limit),
    staleTime: 30_000, // 30 seconds
  });
}
