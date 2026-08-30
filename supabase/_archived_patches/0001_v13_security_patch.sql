-- ============================================================================
-- ARCHIVED: 2026-08-30T23:10:44Z
-- Original path: apps/admin/src/infrastructure/patches/v13_security_patch.sql
-- Reason: stray SQL living outside supabase/schema/ (app-source tree),
--   never referenced by any application code (verified via repo-wide grep),
--   and fully superseded by the canonical schema:
--     * access_rules_admin        -> supabase/schema/09_rls.sql (hardened: tenant-scoped, no cross-tenant super-admin bypass)
--     * user_access_rules_admin   -> supabase/schema/09_rls.sql (hardened)
--     * courses_select            -> superseded by courses_select_merged / courses_select_policy in 09_rls.sql
--                                    (this file's version, if reapplied, would OR-widen authenticated access and
--                                     reintroduce the cross-tenant leak documented at 09_rls.sql courses_select_policy)
--     * users_select              -> superseded by users_select_merged in 09_rls.sql
--     * audit_access_rule_change  -> supabase/schema/07_functions.sql + trigger tr_audit_access_rules in 08_triggers.sql
--     * user_access_cache.computed_at column -> already present in supabase/schema/03_tables.sql
-- Action: archived verbatim per instruction (no deletion of external SQL).
-- Do not apply this file. It is not part of the deployment chain.
-- ============================================================================

-- ============================================================================
-- EduZone v13 Security Hardening Patch
-- Resolves RLS blockers for Super Admins on access gating tables.
-- ============================================================================

BEGIN;

-- Fix missing column in user_access_cache (common migration gap in v13)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'private' 
          AND table_name = 'user_access_cache' 
          AND column_name = 'computed_at'
    ) THEN
        ALTER TABLE private.user_access_cache ADD COLUMN computed_at timestamptz NOT NULL DEFAULT now();
    END IF;
END $$;

-- Fix access_rules RLS to allow Super Admins to see and manage rules across all tenants
DROP POLICY IF EXISTS access_rules_admin ON public.access_rules;
CREATE POLICY access_rules_admin ON public.access_rules
    FOR ALL TO authenticated
    USING (
      public.is_current_user_super_admin() 
      OR (
        tenant_id = public.get_current_tenant_id()
        AND public.is_current_user_admin()
      )
    )
    WITH CHECK (
      public.is_current_user_super_admin()
      OR (
        tenant_id = public.get_current_tenant_id()
        AND public.is_current_user_admin()
      )
    );

-- Fix user_access_rules RLS
DROP POLICY IF EXISTS user_access_rules_admin ON public.user_access_rules;
CREATE POLICY user_access_rules_admin ON public.user_access_rules
    FOR ALL TO authenticated
    USING (
      public.is_current_user_super_admin()
      OR public.is_current_user_admin()
    )
    WITH CHECK (
      public.is_current_user_super_admin()
      OR public.is_current_user_admin()
    );

-- Ensure materialized views are accessible via a secure proxy in public if needed
-- (Optional: uncomment if frontend must access stats directly)
-- CREATE OR REPLACE VIEW public.user_stats AS SELECT * FROM private.mv_user_stats;
-- GRANT SELECT ON public.user_stats TO authenticated;

-- Fix courses RLS for Super Admins
DROP POLICY IF EXISTS courses_select ON public.courses;
CREATE POLICY courses_select ON public.courses
    FOR SELECT TO authenticated
    USING (
      public.is_current_user_super_admin()
      OR (
        tenant_id = public.get_current_tenant_id()
        AND deleted_at IS NULL
        AND (
          status = 'published'
          OR teacher_id = auth.uid()
          OR public.has_course_access(auth.uid(), id)
          OR public.user_has_permission(auth.uid(), 'course.read', tenant_id)
        )
      )
    );

-- Fix users RLS for Super Admins
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
    FOR SELECT TO authenticated
    USING (
      public.is_current_user_super_admin()
      OR (
        tenant_id = public.get_current_tenant_id()
        AND deleted_at IS NULL
      )
    );

-- ============================================================================
-- Automated Auditing for Access Rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_access_rule_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.log_activity_async(
    auth.uid(),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'access_rule_created'
      WHEN TG_OP = 'UPDATE' THEN 'access_rule_updated'
      WHEN TG_OP = 'DELETE' THEN 'access_rule_deleted'
    END,
    jsonb_build_object(
      'rule_id', coalesce(NEW.id, OLD.id),
      'rule_type', coalesce(NEW.rule_type, OLD.rule_type),
      'tenant_id', coalesce(NEW.tenant_id, OLD.tenant_id),
      'is_active', NEW.is_active
    ),
    'medium'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_access_rules ON public.access_rules;
CREATE TRIGGER tr_audit_access_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.access_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_access_rule_change();

COMMIT;
