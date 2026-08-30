-- ============================================================================
-- ARCHIVED: 2026-08-30T23:10:44Z
-- Original path: apps/admin/src/adapters/db/dashboard_analytics.sql
-- Reason: stray SQL living outside supabase/schema/ (app-source tree),
--   never referenced by any application code (verified via repo-wide grep),
--   and fully superseded by the canonical schema:
--     * private.mv_user_stats        -> supabase/schema/06_views.sql
--     * private.mv_course_stats      -> supabase/schema/06_views.sql (evolved further: mv_course_stats_tenant, public.vw_course_stats)
--     * private.mv_daily_activity    -> renamed/evolved to private.mv_daily_activity_30d in supabase/schema/06_views.sql
--     * get_dashboard_stats(uuid)    -> supabase/schema/07_functions.sql
--                                       (canonical version adds an explicit is_admin_with_session_validation() permission
--                                        check, a private.dashboard_stats_cache read path, and a narrower
--                                        SET search_path = public, pg_temp; this file's version has no permission
--                                        check and a broader search_path of public, private)
-- Action: archived verbatim per instruction (no deletion of external SQL).
-- Do not apply this file. It is not part of the deployment chain.
-- ============================================================================

-- ══════════════════════════════════════════════════════
-- EduZone Admin Dashboard — Analytics & Stats v1.0
-- Materialized Views + Highly Optimized RPCs
-- ══════════════════════════════════════════════════════

-- Create private schema if missing (from Section 1a)
CREATE SCHEMA IF NOT EXISTS private;

-- 1. mv_user_stats: Tracks user counts and growth
DROP MATERIALIZED VIEW IF EXISTS private.mv_user_stats CASCADE;
CREATE MATERIALIZED VIEW private.mv_user_stats AS
SELECT
    tenant_id,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_users,
    COUNT(*) FILTER (WHERE account_status = 'active' AND deleted_at IS NULL) as active_users,
    COUNT(*) FILTER (WHERE account_status = 'locked' AND deleted_at IS NULL) as locked_users,
    COUNT(*) FILTER (WHERE primary_role = 'student' AND deleted_at IS NULL) as student_count,
    COUNT(*) FILTER (WHERE primary_role = 'teacher' AND deleted_at IS NULL) as teacher_count,
    COUNT(*) FILTER (WHERE primary_role = 'admin' AND deleted_at IS NULL) as admin_count
FROM public.users
GROUP BY tenant_id;

CREATE UNIQUE INDEX idx_mv_user_stats_tenant ON private.mv_user_stats(tenant_id);

-- 2. mv_course_stats: Tracks course distribution
DROP MATERIALIZED VIEW IF EXISTS private.mv_course_stats CASCADE;
CREATE MATERIALIZED VIEW private.mv_course_stats AS
SELECT
    tenant_id,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_courses,
    COUNT(*) FILTER (WHERE status = 'published' AND deleted_at IS NULL) as published_courses,
    COUNT(*) FILTER (WHERE status = 'draft' AND deleted_at IS NULL) as draft_courses,
    COUNT(*) FILTER (WHERE status = 'archived' AND deleted_at IS NULL) as archived_courses,
    COUNT(*) FILTER (WHERE NOT is_free AND deleted_at IS NULL) as paid_courses,
    (SELECT COUNT(*) FROM public.enrollments e WHERE e.tenant_id = c.tenant_id AND e.status = 'active') as total_enrollments
FROM public.courses c
GROUP BY tenant_id;

CREATE UNIQUE INDEX idx_mv_course_stats_tenant ON private.mv_course_stats(tenant_id);

-- 3. mv_daily_activity: Tracks daily engagement (last 30 days)
DROP MATERIALIZED VIEW IF EXISTS private.mv_daily_activity CASCADE;
CREATE MATERIALIZED VIEW private.mv_daily_activity AS
SELECT
    tenant_id,
    created_at::DATE as activity_date,
    COUNT(DISTINCT user_id) as active_users,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE activity_type = 'lesson_view') as lesson_views,
    COUNT(*) FILTER (WHERE activity_type = 'login') as logins
FROM public.activity_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY tenant_id, created_at::DATE;

CREATE UNIQUE INDEX idx_mv_daily_activity_tenant_date ON private.mv_daily_activity(tenant_id, activity_date);

-- 4. RPC: get_dashboard_stats
-- Faster single-point fetching for the Admin Dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
BEGIN
    -- Resolve tenant_id
    v_tenant_id := COALESCE(p_tenant_id, (current_setting('app.tenant_id', true))::UUID);
    
    IF v_tenant_id IS NULL AND NOT is_current_user_super_admin() THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
    END IF;

    SELECT jsonb_build_object(
        'totalUsers',       COALESCE(u.total_users, 0),
        'activeUsers',      COALESCE(u.active_users, 0),
        'studentCount',     COALESCE(u.student_count, 0),
        'teacherCount',     COALESCE(u.teacher_count, 0),
        'activeCourses',    COALESCE(c.published_courses, 0),
        'draftCourses',     COALESCE(c.draft_courses, 0),
        'archivedCourses',  COALESCE(c.archived_courses, 0),
        'totalEnrollments', COALESCE(c.total_enrollments, 0),
        'totalTenants',     (SELECT COUNT(*) FROM tenants),
        'pendingWarnings',  (SELECT COUNT(*) FROM warnings WHERE NOT is_acknowledged AND (v_tenant_id IS NULL OR tenant_id = v_tenant_id)),
        'totalLessons',     (SELECT COUNT(*) FROM lessons l JOIN courses cr ON cr.id = l.course_id WHERE cr.tenant_id = v_tenant_id AND l.deleted_at IS NULL),
        'dailySessions',    (SELECT COALESCE(active_users, 0) FROM private.mv_daily_activity WHERE tenant_id = v_tenant_id AND activity_date = CURRENT_DATE),
        'totalViews',       (SELECT SUM(lesson_views) FROM private.mv_daily_activity WHERE tenant_id = v_tenant_id)
    ) INTO v_result
    FROM private.mv_user_stats u
    FULL OUTER JOIN private.mv_course_stats c ON c.tenant_id = u.tenant_id
    WHERE (v_tenant_id IS NULL OR u.tenant_id = v_tenant_id);

    RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID) TO authenticated;
