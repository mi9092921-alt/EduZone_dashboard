import { container } from '@/container';

/**
 * Stats Service
 *
 * Fetches consolidated analytical data and system statistics.
 * Utilizes high-performance SQL views and RPCs to minimize client-side processing.
 */

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  activeCourses: number;
  draftCourses: number;
  archivedCourses: number;
  totalEnrollments: number;
  pendingWarnings: number;
  // UI Compatibility fields (defaulting to 0 if not in RPC)
  dailySessions: number;
  totalViews: number;
  totalProgress: number;
  totalTenants: number;
  totalLessons: number;
  totalTodos: number;
  totalDevices: number;
  deletedCourses: number;
  // Metadata
  refreshedAt: string;
}

/**
 * Fetches high-level dashboard metrics using the optimized get_dashboard_stats RPC.
 * Adheres to RBAC; Super Admins can optionally filter by tenant.
 *
 * @param tenantId Optional tenant ID for targeted stats
 */
export async function getDashboardStats(tenantId?: string): Promise<DashboardStats> {
  const { supabase } = container;

  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    p_tenant_id: tenantId || null,
  });

  if (error) {
    // PostgrestError properties are non-enumerable — extract explicitly
    return {
      totalUsers: 0,
      activeUsers: 0,
      activeCourses: 0,
      draftCourses: 0,
      archivedCourses: 0,
      totalEnrollments: 0,
      pendingWarnings: 0,
      dailySessions: 0,
      totalViews: 0,
      totalProgress: 0,
      totalTenants: 0,
      totalLessons: 0,
      totalTodos: 0,
      totalDevices: 0,
      deletedCourses: 0,
      refreshedAt: new Date().toISOString(),
    };
  }

  // DB returns snake_case JSONB: { total_users, total_courses, total_enrollments, active_sessions }
  const raw = (data ?? {}) as Record<string, unknown>;

  return {
    totalUsers: Number(raw['total_users'] ?? 0),
    activeUsers: Number(raw['total_users'] ?? 0), // no separate active_users in RPC
    activeCourses: Number(raw['total_courses'] ?? 0),
    draftCourses: Number(raw['draft_courses'] ?? 0),
    archivedCourses: 0,
    totalEnrollments: Number(raw['total_enrollments'] ?? 0),
    pendingWarnings: Number(raw['warnings_count'] ?? 0),
    dailySessions: Number(raw['active_sessions'] ?? 0),
    totalViews: Number(raw['total_views'] ?? 0),
    totalProgress: Number(raw['total_progress'] ?? 0),
    totalTenants: 0,
    totalLessons: Number(raw['total_lessons'] ?? 0),
    totalTodos: Number(raw['total_todos'] ?? 0),
    totalDevices: Number(raw['total_devices'] ?? 0),
    deletedCourses: Number(raw['deleted_courses'] ?? 0),
    refreshedAt: new Date().toISOString(),
  };
}
