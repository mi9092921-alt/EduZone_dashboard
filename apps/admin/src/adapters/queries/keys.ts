/**
 * React Query key factories.
 * Structured as a nested object for easy invalidation at any scope.
 *
 * Usage:
 *   queryKeys.users.list(filters)     → ['users', 'list', filters]
 *   queryKeys.users.all               → ['users']
 *   queryKeys.users.detail(id)        → ['users', 'detail', id]
 */
export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (filters: Record<string, unknown>) => ['users', 'list', filters] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    permissions: (id: string) => ['users', 'permissions', id] as const,
    devices: (id: string) => ['users', 'devices', id] as const,
    sessions: (id: string) => ['users', 'sessions', id] as const,
    warnings: (id: string) => ['users', 'warnings', id] as const,
    locations: (id: string) => ['users', 'locations', id] as const,
  },
  courses: {
    all: ['courses'] as const,
    list: (filters: Record<string, unknown>) => ['courses', 'list', filters] as const,
    detail: (id: string) => ['courses', 'detail', id] as const,
    sections: (courseId: string) => ['courses', 'sections', courseId] as const,
    stats: (courseId: string) => ['courses', 'stats', courseId] as const,
    overviewStats: ['courses', 'overviewStats'] as const,
    objectives: (courseId: string) => ['courses', 'objectives', courseId] as const,
    prerequisites: (courseId: string) => ['courses', 'prerequisites', courseId] as const,
    prerequisiteOptions: (courseId: string) => ['courses', 'prerequisiteOptions', courseId] as const,
  },
  enrollments: {
    all: ['enrollments'] as const,
    byUser: (userId: string) => ['enrollments', 'user', userId] as const,
    byCourse: (courseId: string) => ['enrollments', 'course', courseId] as const,
    list: (filters: Record<string, unknown>) => ['enrollments', 'list', filters] as const,
  },
  settings: {
    all: ['settings'] as const,
    detail: (key: string) => ['settings', key] as const,
  },
  featureFlags: {
    all: ['featureFlags'] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    list: (filters: Record<string, unknown>) => ['jobs', 'list', filters] as const,
    detail: (id: string) => ['jobs', id] as const,
    statusCounts: ['jobs', 'statusCounts'] as const,
  },
  audit: {
    all: ['audit'] as const,
    logs: (filters: Record<string, unknown>) => ['audit', 'logs', filters] as const,
    chainState: ['audit', 'chainState'] as const,
    queue: ['audit', 'queue'] as const,
  },
  rateLimits: {
    all: ['rateLimits'] as const,
    active: ['rateLimits', 'active'] as const,
    rules: ['rateLimits', 'rules'] as const,
    topOffenders: ['rateLimits', 'topOffenders'] as const,
  },
  auth: {
    access: ['auth', 'access'] as const,
  },
  analytics: {
    dashboard: ['analytics', 'dashboard'] as const,
    activity: (filters: Record<string, unknown>) => ['analytics', 'activity', filters] as const,
    userStats: (tenantId?: string) => ['analytics', 'userStats', tenantId] as const,
    courseStats: (tenantId?: string) => ['analytics', 'courseStats', tenantId] as const,
    dailyActivity: (tenantId?: string) => ['analytics', 'dailyActivity', tenantId] as const,
    registrationTrend: (days: number) => ['analytics', 'registrationTrend', days] as const,
    geographic: (tenantId?: string) => ['analytics', 'geographic', tenantId] as const,
    globalCoordinates: ['analytics', 'globalCoordinates'] as const,
  },
  teacher: {
    myCourses: (filters: Record<string, unknown>) => ['teacher', 'myCourses', filters] as const,
    studentProgress: (courseId: string, filters: Record<string, unknown>) =>
      ['teacher', 'studentProgress', courseId, filters] as const,
    analytics: (courseId: string) => ['teacher', 'analytics', courseId] as const,
    students: (teacherId: string) => ['teacher', 'students', teacherId] as const,
  },
  warnings: {
    all: ['warnings'] as const,
    list: (filters: Record<string, unknown>) => ['warnings', 'list', filters] as const,
  },
  tenants: {
    all: ['tenants'] as const,
    list: (filters: Record<string, unknown>) => ['tenants', 'list', filters] as const,
    detail: (id: string) => ['tenants', 'detail', id] as const,
    audit: (id: string, filters: Record<string, unknown>) => ['tenants', 'audit', id, filters] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (page: number, size: number, audience?: string) => ['notifications', 'list', page, size, audience] as const,
    // Per-user inbox keys
    allMine: ['notifications', 'mine'] as const,
    mine: (limit: number, unreadOnly: boolean) =>
      ['notifications', 'mine', limit, unreadOnly] as const,
    unreadCount: ['notifications', 'unreadCount'] as const,
  },
} as const;
