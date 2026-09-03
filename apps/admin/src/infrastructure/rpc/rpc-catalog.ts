/**
 * RPC Catalog (M11 — RPC Boundary, Execution Plan §15).
 *
 * The single source of truth for every Postgres RPC the dashboard calls.
 * Each entry records the security classification verified against
 * `supabase/schema/07_functions.sql` (SECURITY DEFINER/INVOKER) and
 * `supabase/schema/10_permissions.sql` (EXECUTE grants) on 2026-09-02.
 *
 * Classifications:
 *   public          — executable by anon (no auth)
 *   authenticated   — EXECUTE granted to authenticated; function enforces its own auth checks
 *   tenant-scoped   — privileged function whose logic pins mutations/reads to
 *                     get_current_tenant_id() / caller permissions per tenant
 *   privileged      — admin/session-validated functions (is_admin_with_session_validation)
 *   service-role    — EXECUTE granted to service_role only; callable ONLY via
 *                     createAdminClient() inside infrastructure/repos
 *
 * Rules enforced by architecture/layer-boundaries.test.ts (M11):
 *   1. `.rpc(` calls are allowed ONLY inside `infrastructure/` and the
 *      documented exception `application/authorization/authorization.service.ts`.
 *   2. service-role classified RPCs must be called on an admin client.
 */

export type RpcClassification =
  | 'public'
  | 'authenticated'
  | 'tenant-scoped'
  | 'privileged'
  | 'service-role';

export interface RpcDefinition {
  /** Postgres function name as called via .rpc() */
  name: string;
  classification: RpcClassification;
  /** The infrastructure module that owns the call site(s). */
  owner: string;
  /** Required permission (function-enforced) for privileged/tenant-scoped RPCs. */
  requiredPermission?: string;
  /** Notes about grant status or caller constraints. */
  notes?: string;
}

export const RPC_CATALOG: readonly RpcDefinition[] = [
  // ── Auth / session lifecycle (authenticated) ─────────────────────
  {
    name: 'check_dashboard_access',
    classification: 'authenticated',
    owner: 'infrastructure/repos/auth-rpc.service.ts',
    notes:
      'SECURITY DEFINER, STABLE. Granted to authenticated + service_role (10_permissions.sql:299-300). ' +
      'Returns session status jsonb; role gate (admin/teacher/super_admin) enforced inside.',
  },
  {
    name: 'logout_current_user',
    classification: 'authenticated',
    owner: 'infrastructure/repos/auth-rpc.service.ts',
    notes:
      'SECURITY DEFINER. Granted to authenticated + service_role (10_permissions.sql:350-351). ' +
      'Bumps token_version and revokes sessions for auth.uid() only.',
  },
  {
    name: 'bind_device_for_current_user',
    classification: 'authenticated',
    owner: 'infrastructure/repos/users.service.ts',
    notes:
      'SECURITY DEFINER. Granted to authenticated (10_permissions.sql:364-365). ' +
      'Validates session + tenant of auth.uid(); enforces max_devices_per_user.',
  },

  // ── Telemetry / activity (authenticated, self-scoped) ────────────
  {
    name: 'log_app_open_location',
    classification: 'authenticated',
    owner: 'infrastructure/telemetry-service.ts',
    notes:
      'SECURITY INVOKER. Uses auth.uid() + get_current_tenant_id(); throttled server-side.',
  },
  {
    name: 'log_activity_async',
    classification: 'tenant-scoped',
    owner: 'infrastructure/repos/jobs-rpc.service.ts',
    notes:
      'SECURITY DEFINER. Granted to authenticated (10_permissions.sql:163-166). ' +
      'Function enforces service_role OR p_user_id = auth.uid() OR admin-with-session.',
  },

  // ── Authorization helper ─────────────────────────────────────────
  {
    name: 'user_has_permission',
    classification: 'authenticated',
    owner: 'application/authorization/authorization.service.ts (documented exception)',
    notes:
      'SECURITY DEFINER, STABLE. For non-service_role callers the function ' +
      'hard-rejects p_user_id <> auth.uid() and validates the session; the caller ' +
      'cannot query anyone else\u2019s permissions. Called by the centralized ' +
      'authorization service (M5) — the only non-infrastructure call site allowed.',
  },

  // ── User lifecycle (privileged — called via admin client in repos) ──
  {
    name: 'control_user_account',
    classification: 'privileged',
    owner: 'infrastructure/repos/user-admin.repository.ts (admin client)',
    requiredPermission: 'users.lock',
    notes:
      'SECURITY DEFINER. Function enforces user_has_permission(users.lock). ' +
      'Called via service-role admin client inside the repository (M8 port).',
  },
  {
    name: 'terminate_user_sessions',
    classification: 'privileged',
    owner: 'infrastructure/repos/user-admin.repository.ts (admin client)',
    requiredPermission: 'sessions.manage',
    notes:
      'SECURITY DEFINER. EXECUTE granted to service_role ONLY (10_permissions.sql:498-500) — ' +
      'authenticated callers get permission-denied. Tenant scoping inside the UPDATE.',
  },
  {
    name: 'issue_warning',
    classification: 'tenant-scoped',
    owner: 'infrastructure/repos/user-admin.repository.ts (server client)',
    requiredPermission: 'warnings.write',
    notes:
      'SECURITY DEFINER. Function enforces warnings.write and pins the target user ' +
      'to get_current_tenant_id().',
  },
  {
    name: 'reset_user_device',
    classification: 'privileged',
    owner: 'infrastructure/repos/users.service.ts',
    requiredPermission: 'devices.manage',
    notes: 'SECURITY DEFINER. Function enforces devices.manage + tenant scoping.',
  },

  // ── Courses / enrollment (tenant-scoped) ─────────────────────────
  {
    name: 'enroll_in_course',
    classification: 'authenticated',
    owner: 'infrastructure/enrollment-service.ts',
    notes:
      'SECURITY DEFINER. Self-enrollment for auth.uid(); validates tenant + published + not revoked.',
  },
  {
    name: 'enroll_student',
    classification: 'tenant-scoped',
    owner: 'infrastructure/repos/courses.service.ts',
    requiredPermission: 'courses.manage',
    notes:
      'SECURITY DEFINER. Function enforces courses.manage and tenant match of user AND course.',
  },
  {
    name: 'revoke_enrollment',
    classification: 'tenant-scoped',
    owner: 'infrastructure/repos/courses.service.ts',
    requiredPermission: 'courses.manage',
    notes: 'SECURITY DEFINER. Tenant-pinned UPDATE on enrollments.',
  },
  {
    name: 'reorder_course_sections',
    classification: 'tenant-scoped',
    owner: 'infrastructure/repos/courses.service.ts',
    notes:
      'SECURITY DEFINER. Signature (p_course_id uuid, p_ordered_ids uuid[]); allows the ' +
      'course teacher or an admin-with-session; tenant-pinned. M11 fixed the app-side ' +
      'parameter mismatch (was sending p_section_updates).',
  },
  {
    name: 'reorder_section_lessons',
    classification: 'tenant-scoped',
    owner: 'infrastructure/repos/courses.service.ts',
    notes:
      'SECURITY DEFINER. Signature (p_section_id uuid, p_ordered_ids uuid[]); allows the ' +
      'course teacher or an admin-with-session; tenant-pinned. Validates that ordered_ids ' +
      'exactly covers the section\'s non-deleted lessons, then applies order_index in one ' +
      'UPDATE. M16 (F16-2): replaced the non-atomic per-lesson update loop.',
  },

  // ── Analytics (privileged reads) ─────────────────────────────────
  {
    name: 'get_dashboard_stats',
    classification: 'privileged',
    owner: 'infrastructure/stats-service.ts',
    notes:
      'SECURITY DEFINER, STABLE. is_admin_with_session_validation(); tenant pinned unless super_admin.',
  },
  {
    name: 'get_user_stats_summary',
    classification: 'privileged',
    owner: 'infrastructure/repos/users.service.ts + analytics.service.ts',
    requiredPermission: 'users.read',
    notes: 'SECURITY INVOKER, STABLE. users.read required; tenant pinned unless super_admin.',
  },
  {
    name: 'get_daily_activity',
    classification: 'privileged',
    owner: 'infrastructure/repos/analytics.service.ts',
    requiredPermission: 'reports.read',
    notes: 'SECURITY DEFINER, STABLE. reports.read required; tenant pinned.',
  },
  {
    name: 'get_system_health',
    classification: 'privileged',
    owner: 'infrastructure/repos/analytics.service.ts',
    notes: 'SECURITY DEFINER, STABLE. is_admin_with_session_validation().',
  },

  // ── Job queue (service-role only) ────────────────────────────────
  {
    name: 'admin_get_jobs',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs.service.ts (admin client)',
  },
  {
    name: 'admin_get_job',
    classification: 'service-role',
    owner: 'infrastructure/repos/bulk.service.ts (admin-granted authenticated)',
    notes:
      'is_admin_with_session_validation() inside; granted to authenticated implicitly via ' +
      'default-privilege model. Called from bulk.service on the browser client for progress polling.',
  },
  {
    name: 'admin_get_job_counts',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs.service.ts (admin client)',
  },
  {
    name: 'admin_retry_job',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs.service.ts (admin client)',
  },
  {
    name: 'admin_cancel_job',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs.service.ts + bulk.service.ts',
  },
  {
    name: 'release_stale_job_locks',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs.service.ts (admin client)',
  },
  {
    name: 'admin_enqueue_bulk_job',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts',
  },
  {
    name: 'worker_update_bulk_job',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts',
    notes: 'Function rejects anything but service_role.',
  },
  {
    name: 'worker_issue_warning',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts (workerIssueWarning)',
    notes:
      'SECURITY DEFINER. Function rejects non-service_role, re-verifies the initiator\'s ' +
      'warnings.write permission and tenant, and atomically inserts the warning + ' +
      'bumps warning_count (relative increment) in one SQL statement. M16 (F16-1): ' +
      'replaces the bulk two-step insert+count path that lost concurrent increments.',
  },

  // ── Audit chain (privileged) ─────────────────────────────────────
  {
    name: 'flush_activity_logs',
    classification: 'privileged',
    owner: 'infrastructure/repos/audit.service.ts',
    requiredPermission: 'audit.read',
    notes:
      'SECURITY DEFINER. service_role OR audit.read; advisory-locked hash chain flush.',
  },

  // ── Notifications / cron (service-role only) ─────────────────────
  {
    name: 'process_notification_fanout_jobs',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts + notifications.repository.ts',
    notes: 'Granted to service_role ONLY (10_permissions.sql:402-405).',
  },
  {
    name: 'invoke_notification_push_worker',
    classification: 'service-role',
    owner: 'infrastructure/repos/notifications.repository.ts (admin client)',
    notes: 'internal schema function wrapper; service_role only (10_permissions.sql:389-391).',
  },
  {
    name: 'manage_partitions',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts (cron route)',
    notes: 'maintenance schema routine invoked by the cron route with CRON_SECRET.',
  },
  {
    name: 'prune_expired_access_cache',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts (cron route)',
  },
  {
    name: 'process_update_enrollment_totals_jobs',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts (cron route)',
  },
  {
    name: 'process_cache_purges',
    classification: 'service-role',
    owner: 'infrastructure/repos/jobs-rpc.service.ts (cron route)',
  },
] as const;

/** Fast lookup by RPC name. */
export const RPC_INDEX: ReadonlyMap<string, RpcDefinition> = new Map(
  RPC_CATALOG.map((def) => [def.name, def]),
);

/** Names allowed to be called outside `infrastructure/` (documented exceptions). */
export const NON_INFRA_RPC_EXCEPTIONS: ReadonlySet<string> = new Set([
  // Centralized authorization service (M5) — application layer, verified caller-self check.
  'application/authorization/authorization.service.ts',
]);

/** Guard: classification requires an admin (service-role) client at the call site. */
export function requiresAdminClient(def: RpcDefinition): boolean {
  return def.classification === 'service-role';
}
