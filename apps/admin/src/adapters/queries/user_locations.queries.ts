import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './keys';

import { getUserLocationLogs } from '@/infrastructure/repos/user_location_logs.service';

export function useUserLocationLogs(userId: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.users.locations(userId),
    queryFn: () => getUserLocationLogs(userId, limit),
    staleTime: 30_000, // 30 seconds
  });
}
