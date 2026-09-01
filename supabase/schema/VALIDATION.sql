-- ============================================================================
-- Schema Validation & Health Check
-- Run this AFTER applying schema and seed data
-- ============================================================================

CREATE TEMP TABLE validation_results (
  check_name text,
  status text,
  details text
);

-- Check 1: System Tenant Exists
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.tenants 
    WHERE id = '00000000-0000-0000-0000-000000000001'
  ) INTO v_exists;
  
  INSERT INTO validation_results VALUES (
    'System Tenant Exists',
    CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_exists 
      THEN 'System tenant created successfully'
      ELSE 'CRITICAL: System tenant missing - auth will fail'
    END
  );
END $$;

-- Check 2: System Roles Created
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.roles 
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
  
  INSERT INTO validation_results VALUES (
    'System Roles Exist',
    CASE WHEN v_count >= 4 THEN 'PASS' ELSE 'FAIL' END,
    'Found ' || v_count || ' system roles (expected >= 4)'
  );
END $$;

-- Check 3: RLS Enabled on Mutable Tables
DO $$
DECLARE
  v_tables_without_rls text[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT c.relname)
  INTO v_tables_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;
  
  INSERT INTO validation_results VALUES (
    'RLS Enabled on All Mutable Tables',
    CASE WHEN v_tables_without_rls IS NULL OR array_length(v_tables_without_rls, 1) = 0 
      THEN 'PASS' ELSE 'WARN' END,
    COALESCE('Tables with RLS disabled: ' || array_to_string(v_tables_without_rls, ', '),
             'RLS is enabled on all public tables')
  );
END $$;

-- Check 4: check_student_app_access / check_dashboard_access RPCs Exist
-- (replaces the old single check_user_access RPC)
DO $$
DECLARE
  v_fn text;
  v_exists boolean;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['check_student_app_access', 'check_dashboard_access']
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.routines
      WHERE routine_name = v_fn
        AND routine_schema = 'public'
    ) INTO v_exists;

    INSERT INTO validation_results VALUES (
      v_fn || ' RPC Exists',
      CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_exists
        THEN 'RPC is available'
        ELSE 'CRITICAL: RPC missing - auth hydration will fail'
      END
    );
  END LOOP;
END $$;

-- Check 4b: Dashboard access gate allows staff roles
-- (replaces the previous check, which inspected check_user_access's
-- definition text for a hard-coded student-only clause; that function no
-- longer exists. Staff access now goes through the dedicated
-- check_dashboard_access() gate, and student-only access is enforced
-- separately by check_student_app_access(), so the two can no longer
-- collide.)
DO $$
DECLARE
  v_dashboard_def text;
  v_student_def text;
  v_dashboard_allows_staff boolean;
  v_student_is_student_only boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_dashboard_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'check_dashboard_access'
    AND p.pronargs = 0;

  SELECT pg_get_functiondef(p.oid)
    INTO v_student_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'check_student_app_access'
    AND p.pronargs = 0;

  v_dashboard_allows_staff := v_dashboard_def IS NOT NULL
    AND position('admin' IN lower(v_dashboard_def)) > 0
    AND position('teacher' IN lower(v_dashboard_def)) > 0
    AND position('super_admin' IN lower(v_dashboard_def)) > 0;

  v_student_is_student_only := v_student_def IS NOT NULL
    AND position('v_role <> ''student''' IN lower(v_student_def)) > 0;

  INSERT INTO validation_results VALUES (
    'Dashboard Access Gate Allows Staff Roles',
    CASE WHEN v_dashboard_allows_staff AND v_student_is_student_only
      THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_dashboard_allows_staff AND v_student_is_student_only
      THEN 'check_dashboard_access allows admin/teacher/super_admin while check_student_app_access stays student-only'
      ELSE 'CRITICAL: dashboard/student access gates are missing or no longer role-scoped as expected'
    END
  );
END $$;

-- Check 5: check_student_app_access / check_dashboard_access Grants
DO $$
DECLARE
  v_fn text;
  v_authenticated_grant boolean;
  v_anon_grant boolean;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['check_student_app_access', 'check_dashboard_access']
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.role_routine_grants
      WHERE routine_name = v_fn
        AND grantee = 'authenticated'
    ) INTO v_authenticated_grant;

    SELECT EXISTS(
      SELECT 1 FROM information_schema.role_routine_grants
      WHERE routine_name = v_fn
        AND grantee = 'anon'
    ) INTO v_anon_grant;

    INSERT INTO validation_results VALUES (
      v_fn || ' Permissions',
      CASE
        WHEN v_authenticated_grant AND NOT v_anon_grant THEN 'PASS'
        WHEN NOT v_anon_grant THEN 'WARN'
        ELSE 'FAIL'
      END,
      CASE
        WHEN v_authenticated_grant AND NOT v_anon_grant
          THEN 'authenticated: GRANT, anon: REVOKE (correct)'
        WHEN v_authenticated_grant AND v_anon_grant
          THEN 'WARNING: anon has access to ' || v_fn || ' (should be revoked)'
        WHEN NOT v_authenticated_grant
          THEN 'CRITICAL: authenticated cannot execute ' || v_fn
        ELSE 'anon only has access (incorrect)'
      END
    );
  END LOOP;
END $$;

-- Check 6: check_user_access has been fully removed (no dangling gate)
DO $$
DECLARE
  v_still_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'check_user_access'
      AND routine_schema = 'public'
  ) INTO v_still_exists;

  INSERT INTO validation_results VALUES (
    'check_user_access Removed',
    CASE WHEN v_still_exists THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN v_still_exists
      THEN 'CRITICAL: legacy check_user_access() still deployed alongside the new gates'
      ELSE 'Legacy gate fully removed'
    END
  );
END $$;

-- Check 6: Core Tables Exist
DO $$
DECLARE
  v_missing_tables text[];
  v_required_tables text[] := ARRAY['users', 'tenants', 'roles', 'courses', 'sections', 'lessons', 'audit_logs'];
BEGIN
  SELECT ARRAY_AGG(t)
  INTO v_missing_tables
  FROM UNNEST(v_required_tables) t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t
  );
  
  INSERT INTO validation_results VALUES (
    'Core Tables Exist',
    CASE WHEN v_missing_tables IS NULL OR array_length(v_missing_tables, 1) = 0 
      THEN 'PASS' ELSE 'FAIL' END,
    COALESCE('Missing tables: ' || array_to_string(v_missing_tables, ', '),
             'All core tables present')
  );
END $$;

-- Check 7: System Settings Exist
DO $$
DECLARE
  v_settings_count int;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) INTO v_table_exists;
  
  IF v_table_exists THEN
    SELECT COUNT(*) INTO v_settings_count FROM public.system_settings;
    
    INSERT INTO validation_results VALUES (
      'System Settings Table Populated',
      CASE WHEN v_settings_count > 0 THEN 'PASS' ELSE 'WARN' END,
      'Found ' || v_settings_count || ' system settings'
    );
  ELSE
    INSERT INTO validation_results VALUES (
      'System Settings Table Populated',
      'WARN',
      'system_settings table does not exist (may be optional)'
    );
  END IF;
END $$;

-- Check 8: SECURITY DEFINER Functions Have search_path
DO $$
DECLARE
  v_unsafe_functions text[];
BEGIN
  SELECT ARRAY_AGG(p.proname)
  INTO v_unsafe_functions
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (p.proconfig IS NULL OR p.proconfig::text NOT LIKE '%search_path%');
  
  INSERT INTO validation_results VALUES (
    'SECURITY DEFINER Functions Have search_path',
    CASE WHEN v_unsafe_functions IS NULL OR array_length(v_unsafe_functions, 1) = 0
      THEN 'PASS' ELSE 'WARN' END,
    COALESCE('Unsafe functions (need SET search_path): ' || array_to_string(v_unsafe_functions, ', '),
             'All SECURITY DEFINER functions have proper search_path')
  );
END $$;

-- Check 9: Todos Soft Delete RLS Is Safe
DO $$
DECLARE
  v_rls_enabled boolean;
  v_rls_forced boolean;
  v_policy_count int;
  v_for_all_count int;
  v_delete_count int;
  v_expected_count int;
  v_canonical_count int;
  v_can_delete boolean;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity
  INTO v_rls_enabled, v_rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'todos';

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'todos';

  SELECT count(*) INTO v_for_all_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'todos'
    AND cmd = 'ALL';

  SELECT count(*) INTO v_delete_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'todos'
    AND cmd = 'DELETE';

  SELECT count(*) INTO v_expected_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'todos'
    AND policyname = 'todos_access';

  SELECT count(*) INTO v_canonical_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'todos'
    AND policyname = 'todos_access'
    AND cmd = 'ALL'
    AND roles = ARRAY['authenticated'::name];

  SELECT has_table_privilege('authenticated', 'public.todos', 'DELETE')
  INTO v_can_delete;

  INSERT INTO validation_results VALUES (
    'Todos Soft Delete RLS Safe',
    CASE
      WHEN v_rls_enabled
        AND v_rls_forced
        AND v_policy_count = 2
        AND v_expected_count = 1
        AND v_canonical_count = 1
        AND v_for_all_count = 2
        AND v_delete_count = 0
        AND NOT v_can_delete
        THEN 'PASS'
      ELSE 'FAIL'
    END,
    'rls_enabled=' || COALESCE(v_rls_enabled::text, 'null')
      || ', rls_forced=' || COALESCE(v_rls_forced::text, 'null')
      || ', policy_count=' || v_policy_count
      || ', expected_policies=' || v_expected_count
      || ', canonical_policy=' || v_canonical_count
      || ', for_all_policies=' || v_for_all_count
      || ', delete_policies=' || v_delete_count
      || ', authenticated_can_delete=' || COALESCE(v_can_delete::text, 'null')
  );
END $$;

-- Check 10: Tenant authorization is DB-authoritative.
DO $$
DECLARE
  v_tenant_fn text;
  v_assert_fn text;
  v_match_fn text;
  v_unsafe boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_tenant_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_current_tenant_id'
     AND pg_get_function_identity_arguments(p.oid) = ''
   LIMIT 1;

  SELECT pg_get_functiondef(p.oid)
    INTO v_assert_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'assert_tenant'
     AND pg_get_function_identity_arguments(p.oid) = ''
   LIMIT 1;

  SELECT pg_get_functiondef(p.oid)
    INTO v_match_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'tenant_matches_jwt'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid'
   LIMIT 1;

  v_unsafe := coalesce(v_tenant_fn, '') ILIKE '%auth.jwt()%tenant_id%'
           OR coalesce(v_assert_fn, '') ILIKE '%auth.jwt()%tenant_id%'
           OR coalesce(v_match_fn, '') ILIKE '%auth.jwt()%tenant_id%'
           OR coalesce(v_match_fn, '') ILIKE '%app_metadata%tenant_id%';

  INSERT INTO validation_results VALUES (
    'Tenant Authorization Is DB-Authoritative',
    CASE
      WHEN v_tenant_fn IS NOT NULL
       AND v_assert_fn IS NOT NULL
       AND v_match_fn IS NOT NULL
       AND NOT v_unsafe
      THEN 'PASS' ELSE 'FAIL'
    END,
    CASE WHEN v_unsafe
      THEN 'CRITICAL: tenant authorization still depends on JWT tenant claims'
      ELSE 'Tenant context helpers resolve authorization from database state'
    END
  );
END $$;

-- Check 11: Every public RLS-protected table has the canonical session baseline.
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname)
    INTO v_missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND c.relrowsecurity
     AND NOT EXISTS (
       SELECT 1
         FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
          AND p.policyname LIKE 'auth_session_required_%'
     );

  INSERT INTO validation_results VALUES (
    'Canonical Auth Session Baseline Coverage',
    CASE WHEN v_missing IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'Missing baseline policies: ' || array_to_string(v_missing, ', '),
      'Every public RLS-protected table has a restrictive session-validity policy'
    )
  );
END $$;



-- Check 12A: Session revocation is tied to the real Supabase Auth session.
DO $$
DECLARE
  v_has_session_helper boolean;
  v_has_session_check boolean;
  v_helper_public boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.routines
    WHERE routine_schema = 'private'
      AND routine_name = 'revoke_auth_sessions'
  ) INTO v_has_session_helper;

  SELECT pg_get_functiondef(p.oid) ILIKE '%auth.sessions s%session_id%'
  INTO v_has_session_check
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_user_session'
    AND pg_get_function_identity_arguments(p.oid) = '';

  SELECT has_function_privilege(
    'authenticated',
    'private.revoke_auth_sessions(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'private.revoke_auth_sessions(uuid)',
    'EXECUTE'
  ) INTO v_helper_public;

  INSERT INTO validation_results VALUES (
    'Auth Session Revocation Boundary',
    CASE
      WHEN v_has_session_helper
       AND coalesce(v_has_session_check, false)
       AND NOT v_helper_public
      THEN 'PASS' ELSE 'FAIL'
    END,
    'private.revoke_auth_sessions exists; validate_user_session checks auth.sessions; helper is not API-callable'
  );
END $$;

-- Check 12B: All server-side token-version revocation paths also revoke
-- the underlying Supabase Auth sessions, preventing a refresh from minting
-- a fresh JWT after an application-level revocation.
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(routine_name ORDER BY routine_name)
    INTO v_missing
  FROM (VALUES
    ('trg_increment_token_version_on_role_change'),
    ('increment_token_version'),
    ('control_user_account'),
    ('worker_control_user_account'),
    ('logout_current_user'),
    ('reset_user_device'),
    ('worker_reset_user_device')
  ) AS expected(routine_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = expected.routine_name
      AND pg_get_functiondef(p.oid) ILIKE '%private.revoke_auth_sessions(%'
  );

  INSERT INTO validation_results VALUES (
    'Token Revocation Paths Revoke Auth Sessions',
    CASE WHEN v_missing IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'Missing auth-session revocation calls in: ' || array_to_string(v_missing, ', '),
      'All token/device/account revocation paths invalidate Supabase Auth sessions'
    )
  );
END $$;

-- Check 12: Authentication hook is callable only by Supabase Auth / trusted backend.
DO $$
DECLARE
  v_hook_exists boolean;
  v_schema_usage boolean;
  v_auth_admin_exec boolean;
  v_anon_exec boolean;
  v_authenticated_exec boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'custom_access_token'
      AND specific_name LIKE 'custom_access_token%'
  ) INTO v_hook_exists;

  SELECT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE')
    INTO v_schema_usage;
  SELECT has_function_privilege(
    'supabase_auth_admin',
    'public.custom_access_token(jsonb)',
    'EXECUTE'
  ) INTO v_auth_admin_exec;
  SELECT has_function_privilege(
    'anon',
    'public.custom_access_token(jsonb)',
    'EXECUTE'
  ) INTO v_anon_exec;
  SELECT has_function_privilege(
    'authenticated',
    'public.custom_access_token(jsonb)',
    'EXECUTE'
  ) INTO v_authenticated_exec;

  INSERT INTO validation_results VALUES (
    'Custom Access Token Hook Permissions',
    CASE
      WHEN v_hook_exists
       AND v_schema_usage
       AND v_auth_admin_exec
       AND NOT v_anon_exec
       AND NOT v_authenticated_exec
      THEN 'PASS' ELSE 'FAIL'
    END,
    'hook=' || COALESCE(v_hook_exists::text, 'null')
      || ', schema_usage=' || COALESCE(v_schema_usage::text, 'null')
      || ', auth_admin_execute=' || COALESCE(v_auth_admin_exec::text, 'null')
      || ', anon_execute=' || COALESCE(v_anon_exec::text, 'null')
      || ', authenticated_execute=' || COALESCE(v_authenticated_exec::text, 'null')
  );
END $$;

-- Check 13: Sensitive tenant tables must not use permissive tenant-wide
-- authorization through tenant_matches_jwt(). Multiple permissive policies
-- are OR-combined by PostgreSQL, so one broad policy can defeat a narrower one.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(tablename || ':' || policyname ORDER BY tablename, policyname)
    INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('users', 'user_roles', 'courses', 'enrollments', 'user_progress')
    AND (
      coalesce(qual, '') ILIKE '%tenant_matches_jwt(%'
      OR coalesce(with_check, '') ILIKE '%tenant_matches_jwt(%'
    );

  INSERT INTO validation_results VALUES (
    'Sensitive Tables Avoid Tenant-Only JWT Authorization',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: permissive tenant_matches_jwt policies remain: '
        || array_to_string(v_bad, ', '),
      'No sensitive-table policy delegates row authorization to tenant_matches_jwt()'
    )
  );
END $$;

-- Check 14: Self-service writes must remain bound to the authenticated
-- tenant. This guards against policies that check auth.uid() but omit tenant
-- equality in either USING or WITH CHECK.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(tablename || ':' || policyname ORDER BY tablename, policyname)
    INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('enrollments', 'user_progress')
    AND (
      coalesce(qual, '') ILIKE '%user_id = (select auth.uid())%'
      OR coalesce(qual, '') ILIKE '%user_id = public.get_auth_user_id()%'
      OR coalesce(with_check, '') ILIKE '%user_id = (select auth.uid())%'
      OR coalesce(with_check, '') ILIKE '%user_id = public.get_auth_user_id()%'
    )
    AND coalesce(qual || ' ' || with_check, '') NOT ILIKE '%get_current_tenant_id()%'
    AND coalesce(qual || ' ' || with_check, '') NOT ILIKE '%assert_tenant()%';

  INSERT INTO validation_results VALUES (
    'Self-Service Writes Are Tenant-Bound',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: self-service policy lacks tenant binding: '
        || array_to_string(v_bad, ', '),
      'Self-service enrollment/progress policies require canonical tenant context'
    )
  );
END $$;


-- Check 15: Tenant-scoped privileged writes must bind target rows to the
-- current database tenant, with super_admin as the only cross-tenant exception.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(tablename || ':' || policyname ORDER BY tablename, policyname)
    INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'users', 'roles', 'role_permissions', 'user_roles',
      'tenant_settings', 'security_settings'
    )
    AND policyname IN (
      'users_admin_insert', 'users_admin_delete',
      'roles_admin_insert', 'roles_admin_update', 'roles_admin_delete',
      'role_permissions_admin_insert', 'role_permissions_admin_update',
      'role_permissions_admin_delete',
      'user_roles_admin_insert', 'user_roles_admin_update',
      'user_roles_admin_delete',
      'tenant_settings_admin_insert', 'tenant_settings_admin_update',
      'tenant_settings_admin_delete',
      'security_settings_admin_all'
    )
    AND NOT (
      (
        coalesce(qual, '') ILIKE '%is_current_user_super_admin()%'
        OR coalesce(with_check, '') ILIKE '%is_current_user_super_admin()%'
      )
      AND (
        coalesce(qual, '') ILIKE '%tenant_id = public.get_current_tenant_id()%'
        OR coalesce(with_check, '') ILIKE '%tenant_id = public.assert_tenant()%'
        OR coalesce(qual, '') ILIKE '%get_current_tenant_id()%'
        OR coalesce(with_check, '') ILIKE '%get_current_tenant_id()%'
        OR coalesce(with_check, '') ILIKE '%assert_tenant()%'
        OR (
          tablename = 'role_permissions'
          AND (
            coalesce(qual, '') ILIKE '%r.tenant_id = %get_current_tenant_id()%'
            OR coalesce(with_check, '') ILIKE '%r.tenant_id = %get_current_tenant_id()%'
          )
        )
      )
    );

  INSERT INTO validation_results VALUES (
    'Tenant-Scoped Privileged Writes Are Row-Bound',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: privileged policy lacks tenant-row binding: '
        || array_to_string(v_bad, ', '),
      'Tenant-scoped privileged writes require current tenant or explicit super_admin authority'
    )
  );
END $$;

-- Check 16: Global authorization/control-plane tables are not writable by
-- tenant admins. These tables affect every tenant or define authorization itself.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(tablename || ':' || policyname ORDER BY tablename, policyname)
    INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'permissions' AND policyname IN (
        'permissions_super_admin_insert',
        'permissions_super_admin_update',
        'permissions_super_admin_delete'
      ))
      OR
      (tablename = 'feature_flags' AND policyname IN (
        'feature_flags_admin_insert',
        'feature_flags_admin_update',
        'feature_flags_admin_delete'
      ))
      OR
      (tablename = 'settings_kv' AND policyname IN (
        'settings_admin_insert',
        'settings_admin_update',
        'settings_admin_delete'
      ))
      OR
      (tablename = 'rate_limit_rules' AND policyname = 'rate_limit_rules_admin')
      OR
      (tablename = 'tenants' AND policyname IN (
        'tenants_write_insert',
        'tenants_write_update',
        'tenants_write_delete'
      ))
    )
    AND NOT (
      (cmd = 'INSERT'
        AND coalesce(with_check, '') ILIKE '%is_current_user_super_admin()%')
      OR
      (cmd = 'UPDATE'
        AND coalesce(qual, '') ILIKE '%is_current_user_super_admin()%'
        AND coalesce(with_check, '') ILIKE '%is_current_user_super_admin()%')
      OR
      (cmd = 'DELETE'
        AND coalesce(qual, '') ILIKE '%is_current_user_super_admin()%')
      OR
      (cmd = 'ALL'
        AND coalesce(qual, '') ILIKE '%is_current_user_super_admin()%'
        AND coalesce(with_check, '') ILIKE '%is_current_user_super_admin()%')
    );

  INSERT INTO validation_results VALUES (
    'Global Authorization Tables Are Super-Admin Controlled',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: global control-plane policy is not restricted to super_admin: '
        || array_to_string(v_bad, ', '),
      'Global authorization/configuration mutations require server-validated super_admin authority'
    )
  );
END $$;

-- Check 17: Canonical auth function definitions must be unique.
-- Duplicate CREATE OR REPLACE definitions are dangerous because a partial
-- execution could leave an older, weaker implementation active.
DO $$
DECLARE
  v_logout_count int;
  v_bind_count int;
BEGIN
  SELECT COUNT(*) INTO v_logout_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'logout_current_user';

  SELECT COUNT(*) INTO v_bind_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'bind_device_for_current_user';

  INSERT INTO validation_results VALUES (
    'Canonical Auth Function Definitions Are Unique',
    CASE WHEN v_logout_count = 1 AND v_bind_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE
      WHEN v_logout_count = 1 AND v_bind_count = 1
        THEN 'logout_current_user and bind_device_for_current_user each have exactly one canonical definition'
      ELSE
        'CRITICAL: expected exactly one canonical definition; logout='
          || v_logout_count || ', bind_device=' || v_bind_count
    END
  );
END $$;


-- Check 18: Directly addressed sensitive partitions must be RLS-protected.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(
           child_ns.nspname || '.' || child.relname
           ORDER BY child_ns.nspname, child.relname
         )
    INTO v_bad
  FROM pg_inherits i
  JOIN pg_class parent ON parent.oid = i.inhparent
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
  JOIN pg_class child ON child.oid = i.inhrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
  WHERE parent_ns.nspname IN ('public', 'audit')
    AND parent.relname IN (
      'sessions',
      'session_snapshots',
      'video_views',
      'user_location_logs',
      'activity_logs',
      'lesson_access_log',
      'alert_log'
    )
    AND NOT child.relrowsecurity;

  INSERT INTO validation_results VALUES (
    'Sensitive Partition Children Require RLS',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: direct partition access remains without RLS: '
        || array_to_string(v_bad, ', '),
      'All sensitive partition children have RLS enabled'
    )
  );
END $$;

-- Check 19: Sensitive partition children must not be directly granted to
-- PostgREST client roles. Normal access is through the parent table policies.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(
           c.relname
           ORDER BY c.relname
         )
    INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_inherits i ON i.inhrelid = c.oid
  JOIN pg_class parent ON parent.oid = i.inhparent
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
  WHERE n.nspname IN ('public', 'audit')
    AND parent_ns.nspname IN ('public', 'audit')
    AND parent.relname IN (
      'sessions',
      'session_snapshots',
      'video_views',
      'user_location_logs',
      'activity_logs',
      'lesson_access_log',
      'alert_log'
    )
    AND (
      has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('anon', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'UPDATE')
      OR has_table_privilege('anon', c.oid, 'DELETE')
      OR has_table_privilege('authenticated', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'INSERT')
      OR has_table_privilege('authenticated', c.oid, 'UPDATE')
      OR has_table_privilege('authenticated', c.oid, 'DELETE')
    );

  INSERT INTO validation_results VALUES (
    'Sensitive Partition Children Have No Client Grants',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: client grants remain on sensitive partitions: '
        || array_to_string(v_bad, ', '),
      'anon/authenticated have no direct DML privileges on sensitive partition children'
    )
  );
END $$;


-- Check 20: Storage buckets and client write boundaries are explicit.
DO $$
DECLARE
  v_bad_buckets text[];
  v_avatar_policies int;
  v_non_avatar_client_policies int;
BEGIN
  SELECT array_agg(id ORDER BY id)
    INTO v_bad_buckets
  FROM storage.buckets
  WHERE (id IN ('reports', 'exports', 'videos') AND public IS DISTINCT FROM false)
     OR (id = 'avatars' AND public IS DISTINCT FROM true);

  SELECT COUNT(*)
    INTO v_avatar_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'avatars_select_own_folder',
      'avatars_insert_own_folder',
      'avatars_update_own_folder',
      'avatars_delete_own_folder'
    );

  SELECT COUNT(*)
    INTO v_non_avatar_client_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname NOT LIKE 'avatars_%'
    AND (
      policyname ILIKE '%report%'
      OR policyname ILIKE '%export%'
    );

  INSERT INTO validation_results VALUES (
    'Storage Buckets And Client Write Boundaries',
    CASE
      WHEN v_bad_buckets IS NULL
       AND v_avatar_policies = 4
       AND v_non_avatar_client_policies = 0
      THEN 'PASS' ELSE 'FAIL' END,
    CASE
      WHEN v_bad_buckets IS NULL
       AND v_avatar_policies = 4
       AND v_non_avatar_client_policies = 0
      THEN 'avatars is intentionally public with owner-only read+writes (select/insert/update/delete); reports/exports are private and have no report/export client policies'
      ELSE 'CRITICAL: storage bucket visibility or client policy boundaries are not in the expected hardened state'
    END
  );
END $$;

-- Check 21: Rate-limit RPC has explicit least-privilege grants.
DO $$
DECLARE
  v_auth boolean;
  v_anon boolean;
  v_deprecated_auth boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.check_rate_limit(text, uuid, inet, uuid)',
    'EXECUTE'
  ) INTO v_auth;

  SELECT has_function_privilege(
    'anon',
    'public.check_rate_limit(text, uuid, inet, uuid)',
    'EXECUTE'
  ) INTO v_anon;

  SELECT has_function_privilege(
    'authenticated',
    'public.check_rate_limit(text, integer, integer)',
    'EXECUTE'
  ) INTO v_deprecated_auth;

  INSERT INTO validation_results VALUES (
    'Rate-Limit RPC Least Privilege',
    CASE
      WHEN v_auth AND NOT v_anon AND NOT v_deprecated_auth
        THEN 'PASS'
      ELSE 'FAIL'
    END,
    'check_rate_limit(authenticated)= ' || v_auth
      || ', anon= ' || v_anon
      || ', deprecated overload authenticated= ' || v_deprecated_auth
  );
END $$;

-- Check 22: get_lesson_content()/check_lesson_access() must be callable by
-- authenticated (see SECTION-09 FIX in 10_permissions.sql). Without this,
-- the get-lesson-content edge function's authorization RPC call fails
-- outright rather than actually being enforced.
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(fn ORDER BY fn)
    INTO v_missing
  FROM (VALUES
    ('public.get_lesson_content(uuid, inet, uuid)'),
    ('public.check_lesson_access(uuid)')
  ) AS f(fn)
  WHERE NOT has_function_privilege('authenticated', f.fn, 'EXECUTE');

  INSERT INTO validation_results VALUES (
    'Lesson Content RPCs Executable By Authenticated',
    CASE WHEN v_missing IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: authenticated cannot EXECUTE: ' || array_to_string(v_missing, ', '),
      'get_lesson_content and check_lesson_access are callable by authenticated'
    )
  );
END $$;

-- Check 23: sessions_admin_all / devices_admin_all must not grant
-- unscoped cross-tenant access via is_admin_with_session_validation() /
-- is_current_user_admin_lite() alone. The policy definition text must
-- reference the strictly-super_admin, tenant-unscoped helper
-- (is_current_user_super_admin_lite) for its cross-tenant branch.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(polname ORDER BY polname)
    INTO v_bad
  FROM (
    SELECT pol.polname,
           pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('sessions', 'devices')
      AND pol.polname IN ('sessions_admin_all', 'devices_admin_all')
  ) p
  WHERE using_expr IS NULL
     OR using_expr NOT ILIKE '%is_current_user_super_admin_lite%';

  INSERT INTO validation_results VALUES (
    'Sessions/Devices Admin Policy Is Tenant-Scoped',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: cross-tenant admin bypass not using super_admin-only check: '
        || array_to_string(v_bad, ', '),
      'sessions_admin_all / devices_admin_all restrict the unscoped branch to super_admin'
    )
  );
END $$;

-- Check 24: Section 12 offline-entitlement boundary is intact end-to-end —
-- RLS shape, RPC volume bounds (P6.25), state-machine trigger, and the
-- KMS fail-closed fix all present at once. Written as evidence for the
-- project's own "Evidence Gate" (Section 12, phase 20): each sub-item
-- below must independently PASS, not just "no analyzer errors".
DO $$
DECLARE
  v_bad_policies text[];
  v_missing_rules text[];
  v_trigger_ok boolean;
  v_kms_def text;
  v_kms_fails_closed boolean;
BEGIN
  -- (a) offline_download_entitlements: RLS enabled+forced, and the client
  -- (authenticated) has SELECT-own only — no INSERT/UPDATE/DELETE policy
  -- for authenticated. Writes must remain RPC-only (SECURITY DEFINER).
  SELECT array_agg(DISTINCT x) INTO v_bad_policies
  FROM (
    SELECT 'RLS not enabled/forced' AS x
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'offline_download_entitlements'
      AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
    UNION ALL
    SELECT 'unexpected policy: ' || pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'offline_download_entitlements'
      AND pol.polname NOT IN ('offline_entitlements_select_own', 'offline_entitlements_service_all')
      AND pol.polname NOT LIKE 'auth_session_required_%'
    UNION ALL
    SELECT 'authenticated has a non-SELECT policy: ' || pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'offline_download_entitlements'
      AND pol.polname = 'offline_entitlements_select_own'
      AND pol.polcmd <> 'r'
  ) s;

  INSERT INTO validation_results VALUES (
    'Section 12: offline_download_entitlements RLS shape',
    CASE WHEN v_bad_policies IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE('CRITICAL: ' || array_to_string(v_bad_policies, '; '),
      'RLS enabled+forced; authenticated has SELECT-own only; writes are RPC-only')
  );

  -- (b) P6.25 rate-limit rules for both offline-entitlement RPCs are
  -- seeded and active.
  SELECT array_agg(missing) INTO v_missing_rules
  FROM unnest(ARRAY['offline_download_authorize', 'offline_entitlement_revalidate']) missing
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rate_limit_rules r
    WHERE r.action = missing AND r.is_active
  );

  INSERT INTO validation_results VALUES (
    'Section 12: P6.25 rate-limit rules seeded',
    CASE WHEN v_missing_rules IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE('CRITICAL: missing/inactive rate_limit_rules row(s): '
        || array_to_string(v_missing_rules, ', '),
      'offline_download_authorize and offline_entitlement_revalidate both active')
  );

  -- (c) The entitlement state-transition guard trigger exists and fires
  -- BEFORE UPDATE — this is what stops any RPC (present or future) from
  -- moving a row through an undocumented status sequence.
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'offline_download_entitlements'
      AND t.tgname = 'trg_offline_entitlement_transition'
      AND NOT t.tgisinternal
      AND (t.tgtype & 2) = 2  -- BEFORE
      AND (t.tgtype & 16) = 16 -- UPDATE
  ) INTO v_trigger_ok;

  INSERT INTO validation_results VALUES (
    'Section 12: entitlement state-transition guard is wired',
    CASE WHEN v_trigger_ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_trigger_ok
      THEN 'trg_offline_entitlement_transition fires BEFORE UPDATE'
      ELSE 'CRITICAL: state-machine trigger missing or misconfigured — a row could move through an invalid status sequence'
    END
  );

  -- (d) private.get_kms_key() no longer contains the removed hardcoded
  -- fallback key literal. Guards against the fix being silently reverted
  -- by a future edit — checked by inspecting the live function body, not
  -- just trusting this file wasn't touched again.
  SELECT pg_get_functiondef(p.oid) INTO v_kms_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private' AND p.proname = 'get_kms_key';

  v_kms_fails_closed := v_kms_def IS NOT NULL
    AND v_kms_def NOT ILIKE '%eduzone-dev-kms-key%'
    AND v_kms_def ILIKE '%RAISE EXCEPTION%';

  INSERT INTO validation_results VALUES (
    'Section 12: get_kms_key has no hardcoded fallback key',
    CASE WHEN v_kms_fails_closed THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_kms_def IS NULL THEN 'CRITICAL: private.get_kms_key() not found'
      WHEN v_kms_fails_closed THEN 'fails closed with RAISE EXCEPTION when eduzone_kms_key is unprovisioned'
      ELSE 'CRITICAL: hardcoded fallback key literal is back, or function no longer fails closed'
    END
  );
END $$;

-- ============================================================================
-- Feature Flags — production readiness validation
-- ============================================================================

DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'feature_flags'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'tenant_feature_flags'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'feature_flag_users'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'feature_flag_roles'
  )
  INTO v_ok;

  INSERT INTO validation_results VALUES (
    'Feature Flag Core Tables Exist',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_ok THEN 'All Feature Flag tables exist' ELSE 'Feature Flag tables are incomplete' END
  );
END $$;

DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_rollout_pct')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_status')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_key_format')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_feature_flags_override_present')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_feature_flag_users_tenant_user')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_feature_flag_roles_tenant_role')
  INTO v_ok;

  INSERT INTO validation_results VALUES (
    'Feature Flag Constraints',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_ok THEN 'Core rollout/status/tenant invariants are present' ELSE 'Feature Flag constraints are incomplete' END
  );
END $$;

DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT
    c1.relrowsecurity
    AND c2.relrowsecurity
    AND c3.relrowsecurity
    AND c4.relrowsecurity
  INTO v_ok
  FROM pg_class c1
  JOIN pg_namespace n1 ON n1.oid = c1.relnamespace
  JOIN pg_class c2 ON c2.relname = 'tenant_feature_flags'
  JOIN pg_class c3 ON c3.relname = 'feature_flag_users'
  JOIN pg_class c4 ON c4.relname = 'feature_flag_roles'
  WHERE n1.nspname = 'public'
    AND c1.relname = 'feature_flags';

  INSERT INTO validation_results VALUES (
    'Feature Flag RLS Enabled',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_ok THEN 'RLS is enabled on all Feature Flag tables' ELSE 'Feature Flag RLS is incomplete' END
  );
END $$;

DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('feature_flags','tenant_feature_flags','feature_flag_users','feature_flag_roles')
    AND policyname IN (
      'feature_flags_select',
      'feature_flags_admin_all',
      'feature_flags_admin_insert',
      'feature_flags_admin_update',
      'feature_flags_admin_delete',
      'tenant_feature_flags_select'
      -- FIX: 'tenant_feature_flags_manage' used to be in this "historical
      -- name" list, but it is the actual current canonical policy name
      -- (see tenant_feature_flags_manage above, matching the
      -- feature_flags_manage / feature_flag_users_manage /
      -- feature_flag_roles_manage naming convention) -- this check was
      -- permanently failing against a fully clean, canonical schema.
    );

  INSERT INTO validation_results VALUES (
    'No Historical Feature Flag RLS Duplicates',
    CASE WHEN v_bad = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_bad = 0 THEN 'Historical permissive policy names are gone' ELSE 'Old Feature Flag policy definitions remain' END
  );
END $$;

DO $$
DECLARE
  v_hashtext boolean;
  v_wrapper boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'evaluate_feature_flag'
      AND pg_get_functiondef(p.oid) ILIKE '%hashtext%'
  ) INTO v_hashtext;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_feature_enabled'
      AND pg_get_functiondef(p.oid) ILIKE '%is_feature_enabled_for_user%'
  ) INTO v_wrapper;

  INSERT INTO validation_results VALUES (
    'Canonical Feature Flag Evaluator',
    CASE WHEN NOT v_hashtext AND v_wrapper THEN 'PASS' ELSE 'FAIL' END,
    CASE
      WHEN NOT v_hashtext AND v_wrapper
        THEN 'Single canonical evaluator uses the deterministic bucket helper'
      ELSE 'Legacy evaluator semantics remain active'
    END
  );
END $$;

DO $$
DECLARE
  v_d1 integer;
  v_d2 integer;
BEGIN
  v_d1 := public.feature_flag_rollout_bucket(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'aaaaaaaa-0000-0000-0000-000000000004'::uuid,
    'new_video_player'
  );
  v_d2 := public.feature_flag_rollout_bucket(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'aaaaaaaa-0000-0000-0000-000000000004'::uuid,
    'new_video_player'
  );

  INSERT INTO validation_results VALUES (
    'Deterministic Rollout Bucket',
    CASE WHEN v_d1 = v_d2 AND v_d1 BETWEEN 0 AND 9999 THEN 'PASS' ELSE 'FAIL' END,
    format('bucket_1=%s, bucket_2=%s', v_d1, v_d2)
  );
END $$;

DO $$
DECLARE
  v_global_manage integer;
  v_tenant_manage integer;
BEGIN
  SELECT count(*) INTO v_global_manage
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE r.name = 'admin'
    AND p.name = 'feature_flags.manage';

  SELECT count(*) INTO v_tenant_manage
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE r.name = 'admin'
    AND p.name = 'feature_flags.tenant_manage';

  INSERT INTO validation_results VALUES (
    'Feature Flag Role Separation',
    CASE WHEN v_global_manage = 0 AND v_tenant_manage > 0 THEN 'PASS' ELSE 'FAIL' END,
    format('admin_global_manage=%s, admin_tenant_manage=%s', v_global_manage, v_tenant_manage)
  );
END $$;

DO $$
DECLARE
  v_auth_eval boolean;
  v_anon_eval boolean;
  v_auth_tables boolean;
  v_anon_tables boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.evaluate_feature_flags(text[])',
    'EXECUTE'
  ) INTO v_auth_eval;

  -- FIX: this used to assign into v_auth_eval a second time (copy-paste),
  -- so v_anon_eval was never actually set (stayed NULL) and the real
  -- authenticated-side result was silently overwritten by the anon-side
  -- query before it could be read below.
  SELECT has_function_privilege(
    'anon',
    'public.evaluate_feature_flags(text[])',
    'EXECUTE'
  ) INTO v_anon_eval;

  SELECT has_table_privilege('authenticated', 'public.feature_flags', 'SELECT')
      AND has_table_privilege('authenticated', 'public.tenant_feature_flags', 'UPDATE')
    INTO v_auth_tables;

  SELECT has_table_privilege('anon', 'public.feature_flags', 'SELECT')
      OR has_table_privilege('anon', 'public.tenant_feature_flags', 'SELECT')
    INTO v_anon_tables;

  INSERT INTO validation_results VALUES (
    'Feature Flag Permissions',
    CASE WHEN v_auth_eval AND NOT v_anon_eval AND v_auth_tables AND NOT v_anon_tables THEN 'PASS' ELSE 'FAIL' END,
    format(
      'authenticated_eval=%s, anon_eval=%s, authenticated_table_privileges=%s, anon_table_privileges=%s',
      v_auth_eval, v_anon_eval, v_auth_tables, v_anon_tables
    )
  );
END $$;

-- Check 25: bind_device_for_current_user() has explicit least-privilege
-- EXECUTE grants (AUTH-BUG-01). This RPC is called on every successful
-- login (AuthRemoteDataSource.bindDevice()); a missing grant surfaces to
-- the client as a 404/permission error at exactly the point authentication
-- otherwise succeeded, which is easy to silently regress since the
-- function itself has no compile-time dependency on its own grants.
DO $$
DECLARE
  v_authenticated_grant boolean;
  v_anon_grant boolean;
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bind_device_for_current_user'
  ) INTO v_exists;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'bind_device_for_current_user'
      AND routine_schema = 'public'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) INTO v_authenticated_grant;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'bind_device_for_current_user'
      AND routine_schema = 'public'
      AND grantee = 'anon'
      AND privilege_type = 'EXECUTE'
  ) INTO v_anon_grant;

  INSERT INTO validation_results VALUES (
    'bind_device_for_current_user Permissions',
    CASE
      WHEN NOT v_exists THEN 'FAIL'
      WHEN v_authenticated_grant AND NOT v_anon_grant THEN 'PASS'
      ELSE 'FAIL'
    END,
    CASE
      WHEN NOT v_exists
        THEN 'CRITICAL: public.bind_device_for_current_user does not exist'
      WHEN v_authenticated_grant AND NOT v_anon_grant
        THEN 'authenticated: GRANT, anon: REVOKE (correct)'
      WHEN NOT v_authenticated_grant
        THEN 'CRITICAL: authenticated cannot execute bind_device_for_current_user -- every login will fail after a successful sign-in (AUTH-BUG-01 regression)'
      ELSE 'CRITICAL: anon has access to bind_device_for_current_user (should be revoked)'
    END
  );
END $$;

-- Check 26: public.users, public.user_roles, public.courses, and
-- public.enrollments must NOT have FORCE ROW LEVEL SECURITY (AUTH-BUG-01,
-- and the identical courses/enrollments case found during this cleanup
-- pass). All four are queried internally, as the table owner, by SECURITY
-- DEFINER helper functions (validate_user_session(),
-- is_admin_with_session_validation(), get_auth_user_id(),
-- get_current_tenant_id(), is_user_valid_cached(), has_course_access())
-- that are themselves called BY policies on these same tables (and, via
-- is_admin_with_session_validation(), by policies on other tables such
-- as devices_admin_all/sessions_admin_all). FORCE strips the
-- owner-bypass those helpers rely on to avoid recursion, causing
-- "infinite recursion detected in policy" (42P17) on login, or the first
-- time courses_select_merged's has_course_access(id) OR-branch is
-- actually exercised. RLS is still fully ENABLEd and enforced for
-- anon/authenticated regardless of this setting -- FORCE only ever
-- affects the table owner/superuser.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('users', 'user_roles', 'courses', 'enrollments')
    AND c.relforcerowsecurity = true;

  INSERT INTO validation_results VALUES (
    'users/user_roles/courses/enrollments Do Not FORCE Row Level Security',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: FORCE ROW LEVEL SECURITY is set on: ' || array_to_string(v_bad, ', ')
        || ' -- this will cause infinite recursion (42P17) the next time a '
        || 'SECURITY DEFINER session/authorization helper is called from a '
        || 'policy on that table, breaking login or course access checks',
      'None of users/user_roles/courses/enrollments force RLS on the table owner (RLS remains enforced for anon/authenticated either way)'
    )
  );
END $$;

-- Check 27: No leftover duplicate/legacy CREATE FUNCTION definitions.
-- A duplicate exact-signature definition means an old "generation" of a
-- function's logic was left in the source and only wins/loses based on
-- statement order (CREATE OR REPLACE silently shadows the earlier one).
-- is_feature_enabled(text, uuid) previously had two identical-signature
-- definitions (an old direct-query implementation with no tenant-isolation
-- check, silently shadowed by the canonical evaluate_feature_flag()-backed
-- one); this checks the specific function group by name AND full argument
-- type list, so legitimate overloads (different argument lists) never fail.
DO $$
DECLARE
  v_dupes text[];
BEGIN
  SELECT array_agg(sig ORDER BY sig)
    INTO v_dupes
  FROM (
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           COUNT(*) AS c
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'internal', 'maintenance', 'audit')
    GROUP BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    HAVING COUNT(*) > 1
  ) d
  WHERE d.c > 1;

  INSERT INTO validation_results VALUES (
    'No Duplicate Exact-Signature Function Definitions',
    CASE WHEN v_dupes IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: identical-signature CREATE FUNCTION appears more than once '
        || '(only the last CREATE OR REPLACE survives; earlier ones are dead '
        || 'legacy code that must be deleted from source): ' || array_to_string(v_dupes, '; '),
      'Every function name+signature pair has exactly one definition'
    )
  );
END $$;

-- Check 28: Overloaded functions must not create positional-call ambiguity.
-- Postgres allows multiple functions sharing a name as long as argument
-- lists differ, but if one overload's required-argument type prefix matches
-- another overload's full (or default-padded) argument list, a positional
-- or partially-named call becomes ambiguous ("function ... is not unique").
-- This is a real defect distinct from exact-duplicate definitions (Check 27):
-- both bodies survive, but calling the function can error at runtime.
-- Known outstanding case at time of writing: public.get_course_stats has a
-- 3-optional-argument jsonb-summary overload and a 1-required-argument
-- per-course TABLE overload; calling get_course_stats(<uuid>) is ambiguous.
-- Neither overload is currently GRANTed to `authenticated` (see
-- 10_permissions.sql), so it is not client-reachable today, but it must be
-- resolved (by renaming one overload) before either is ever granted.
DO $$
DECLARE
  v_ambiguous text[];
BEGIN
  SELECT array_agg(DISTINCT (a.nspname || '.' || a.proname) ORDER BY (a.nspname || '.' || a.proname))
    INTO v_ambiguous
  FROM (
    SELECT n.nspname, p.proname, p.oid,
           p.pronargs - p.pronargdefaults AS min_args,
           p.pronargs AS max_args,
           p.proargtypes::oid[] AS argtypes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'internal', 'maintenance', 'audit')
  ) a
  JOIN (
    SELECT n.nspname, p.proname, p.oid,
           p.pronargs - p.pronargdefaults AS min_args,
           p.pronargs AS max_args,
           p.proargtypes::oid[] AS argtypes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'internal', 'maintenance', 'audit')
  ) b
    ON a.nspname = b.nspname
   AND a.proname = b.proname
   AND a.oid < b.oid
  WHERE
    -- some argument count N exists that both signatures could satisfy
    GREATEST(a.min_args, b.min_args) <= LEAST(a.max_args, b.max_args)
    -- and the argument types agree over that shared prefix
    AND a.argtypes[0:LEAST(a.min_args, b.min_args) - 1]
      = b.argtypes[0:LEAST(a.min_args, b.min_args) - 1];

  INSERT INTO validation_results VALUES (
    'No Ambiguous Overloaded Function Signatures',
    CASE WHEN v_ambiguous IS NULL THEN 'PASS' ELSE 'WARN' END,
    COALESCE(
      'Overload signature collision (a call could resolve to more than one '
        || 'definition) in: ' || array_to_string(v_ambiguous, ', ')
        || ' -- rename one overload or make the argument lists mutually exclusive',
      'No overloaded function has a positionally-ambiguous call signature'
    )
  );
END $$;

-- Check 29: No duplicate RLS policy names, and no "old name + new name"
-- pair of policies left covering the same table/command/role combination
-- (the CREATE POLICY old -> DROP POLICY old -> CREATE POLICY merged pattern
-- this cleanup targeted). Postgres itself forbids two policies with the
-- identical name on one table, so the real risk is two *differently named*
-- policies left active for the same table+command+role -- i.e. the DROP
-- for the old name was forgotten. This flags that overlap for manual review.
DO $$
DECLARE
  v_overlap text[];
BEGIN
  SELECT array_agg(policy_scope ORDER BY policy_scope)
    INTO v_overlap
  FROM (
    SELECT DISTINCT schemaname || '.' || tablename || ' [' || cmd || ']' AS policy_scope
    FROM (
      SELECT schemaname, tablename, cmd, roles, policyname,
             COUNT(*) OVER (PARTITION BY schemaname, tablename, cmd, roles) AS c
      FROM pg_policies
      WHERE schemaname = 'public'
    ) x
    WHERE x.c > 1
  ) overlap;

  INSERT INTO validation_results VALUES (
    'No Overlapping/Legacy RLS Policies Per Table+Command+Role',
    CASE WHEN v_overlap IS NULL THEN 'PASS' ELSE 'WARN' END,
    COALESCE(
      'More than one active policy covers the same table/command/role '
        || 'combination -- verify this is an intentional multi-policy design '
        || '(policies OR together) and not a forgotten legacy name: '
        || array_to_string(v_overlap, ', '),
      'Every table+command+role combination is covered by exactly one policy'
    )
  );
END $$;

-- Check 30: Any SECURITY DEFINER helper reachable from a
-- users/user_roles/courses/enrollments policy that itself queries one of
-- those same tables must remain SECURITY DEFINER with a safe search_path
-- (the mechanism that prevents 42P17). If such a helper is ever changed to
-- SECURITY INVOKER, the next policy evaluation on that table will recurse
-- into itself. has_course_access() is included because it is the
-- courses<->enrollments equivalent of the users/user_roles case.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(function_name ORDER BY function_name)
    INTO v_bad
  FROM (
    SELECT DISTINCT n.nspname || '.' || p.proname AS function_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_admin_with_session_validation', 'assert_tenant',
        'is_current_user_super_admin', 'is_current_user_admin',
        'validate_user_session', 'user_has_permission',
        'get_current_tenant_id', 'is_user_valid_cached', 'get_auth_user_id',
        'has_course_access'
      )
      AND (
        pg_get_functiondef(p.oid) ILIKE '%public.users%'
        OR pg_get_functiondef(p.oid) ILIKE '%public.user_roles%'
        OR pg_get_functiondef(p.oid) ILIKE '%public.courses%'
        OR pg_get_functiondef(p.oid) ILIKE '%public.enrollments%'
      )
      AND (
        NOT p.prosecdef
        OR pg_get_functiondef(p.oid) !~* 'SET\s+search_path\s*(=|TO)\s*'
      )
  ) bad_functions;

  INSERT INTO validation_results VALUES (
    'RLS Recursion Guards Remain SECURITY DEFINER With Safe search_path',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: these helper functions query users/user_roles/courses/enrollments '
        || 'but are no longer SECURITY DEFINER with a locked search_path -- policies '
        || 'that call them will recurse (42P17) on next use: ' || array_to_string(v_bad, ', '),
      'All users/user_roles/courses/enrollments-touching policy helpers remain SECURITY DEFINER with a safe search_path'
    )
  );
END $$;

-- Check 31: No RLS policy uses USING (true) or WITH CHECK (true) as a
-- workaround for a recursion or permission error. This is an outright ban,
-- not a heuristic -- any such policy on a client-reachable table is
-- treated as a critical failure regardless of table sensitivity.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(policy_name ORDER BY policy_name)
    INTO v_bad
  FROM (
    SELECT DISTINCT schemaname || '.' || tablename || '/' || policyname AS policy_name
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        regexp_replace(coalesce(qual, ''), '\s+', '', 'g') = 'true'
        OR regexp_replace(coalesce(with_check, ''), '\s+', '', 'g') = 'true'
      )
  ) bad_policies;

  INSERT INTO validation_results VALUES (
    'No USING(true)/WITH CHECK(true) RLS Bypass Workarounds',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: policy uses an unconditional true, defeating RLS: '
        || array_to_string(v_bad, ', '),
      'No policy uses an unconditional USING(true)/WITH CHECK(true)'
    )
  );
END $$;

-- Check 32: Client observability write path (Section 15 / P15) is wired
-- correctly end-to-end: `public.activity_log_queue` must stay unreachable
-- directly (INSERT/SELECT/UPDATE/DELETE) by anon/authenticated -- it is an
-- internal queue table, not a client-writable one -- while the two
-- SECURITY DEFINER RPCs that are the only legitimate client write path
-- into it, log_my_activity(text, jsonb) and
-- log_activity_async(uuid, text, jsonb, inet, uuid, text, uuid), must be
-- explicitly EXECUTE-granted to authenticated and NOT to anon. Before this
-- check existed, neither RPC had an explicit grant at all and silently
-- relied on PostgreSQL's implicit EXECUTE-TO-PUBLIC default; this guards
-- against that regressing silently again, and against the direct-insert
-- path (which the Flutter client used to call, and which is permanently
-- blocked at the database layer) ever being re-opened by accident.
DO $$
DECLARE
  v_table_open boolean;
  v_rpc_auth boolean;
  v_rpc_anon boolean;
  v_rpc2_auth boolean;
  v_rpc2_anon boolean;
BEGIN
  SELECT
    has_table_privilege('anon', 'public.activity_log_queue', 'INSERT')
    OR has_table_privilege('authenticated', 'public.activity_log_queue', 'INSERT')
    OR has_table_privilege('anon', 'public.activity_log_queue', 'SELECT')
    OR has_table_privilege('authenticated', 'public.activity_log_queue', 'SELECT')
  INTO v_table_open;

  SELECT has_function_privilege(
    'authenticated', 'public.log_activity_async(uuid, text, jsonb, inet, uuid, text, uuid)', 'EXECUTE'
  ) INTO v_rpc_auth;

  SELECT has_function_privilege(
    'anon', 'public.log_activity_async(uuid, text, jsonb, inet, uuid, text, uuid)', 'EXECUTE'
  ) INTO v_rpc_anon;

  SELECT has_function_privilege(
    'authenticated', 'public.log_my_activity(text, jsonb)', 'EXECUTE'
  ) INTO v_rpc2_auth;

  SELECT has_function_privilege(
    'anon', 'public.log_my_activity(text, jsonb)', 'EXECUTE'
  ) INTO v_rpc2_anon;

  INSERT INTO validation_results VALUES (
    'Activity Log Write Path Is RPC-Only',
    CASE
      WHEN NOT v_table_open
        AND v_rpc_auth AND NOT v_rpc_anon
        AND v_rpc2_auth AND NOT v_rpc2_anon
        THEN 'PASS'
      ELSE 'FAIL'
    END,
    'activity_log_queue directly reachable by client role= ' || v_table_open
      || ', log_activity_async(authenticated)= ' || v_rpc_auth
      || ', log_activity_async(anon)= ' || v_rpc_anon
      || ', log_my_activity(authenticated)= ' || v_rpc2_auth
      || ', log_my_activity(anon)= ' || v_rpc2_anon
  );
END $$;

-- Check 33: public.users SELECT policies must scope any bare admin check to
-- the admin's own tenant (unless it is explicitly the super_admin branch).
-- users_select_merged previously had `is_admin_with_session_validation()`
-- as a standalone OR branch with no accompanying `tenant_id =
-- get_current_tenant_id()` condition, so any tenant-scoped admin (not just
-- super_admin) could SELECT every user row across every tenant -- a real
-- cross-tenant data leak found during this cleanup pass. This check flags
-- that exact shape again for any public.users SELECT/ALL policy.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(DISTINCT policyname ORDER BY policyname)
    INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'users'
    AND cmd IN ('SELECT', 'ALL')
    AND qual ILIKE '%is_admin_with_session_validation()%'
    AND qual !~* 'is_admin_with_session_validation\(\)\s+AND\s+\(?[a-z_.]*tenant_id\s*=';

  INSERT INTO validation_results VALUES (
    'users SELECT Policies Scope Admin Branch To Own Tenant',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: cross-tenant read leak -- these public.users policies call '
        || 'is_admin_with_session_validation() without ANDing it to '
        || 'tenant_id = get_current_tenant_id(), so a tenant admin can read '
        || 'every tenant''s users: ' || array_to_string(v_bad, ', '),
      'Every public.users policy that checks is_admin_with_session_validation() also ANDs it to the caller''s own tenant_id'
    )
  );
END $$;

-- Check 34: public.sessions must have both a SELECT and an INSERT policy
-- for authenticated, scoped to the caller's own row. Before this cleanup
-- pass, public.sessions had FORCE ROW LEVEL SECURITY and only a SELECT
-- policy -- there was no way for a logged-in client to ever insert its own
-- session row, so AuthRemoteDataSource.recordSession()'s direct client
-- insert was silently failing RLS on every call (swallowed by its own
-- try/catch) and public.sessions stayed permanently empty.
DO $$
DECLARE
  v_has_select boolean;
  v_has_insert boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sessions'
      AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY(roles)
  ) INTO v_has_select;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sessions'
      AND cmd IN ('INSERT', 'ALL') AND 'authenticated' = ANY(roles)
  ) INTO v_has_insert;

  INSERT INTO validation_results VALUES (
    'sessions Has SELECT and INSERT Policies For authenticated',
    CASE WHEN v_has_select AND v_has_insert THEN 'PASS' ELSE 'FAIL' END,
    'authenticated SELECT policy exists=' || v_has_select
      || ', authenticated INSERT policy exists=' || v_has_insert
      || CASE WHEN NOT v_has_insert THEN
           ' -- CRITICAL: without an INSERT policy, recordSession() can never write a row and public.sessions stays empty'
         ELSE '' END
  );
END $$;

-- Check 35: public.courses SELECT/ALL policies granted to `authenticated`
-- must be tenant-scoped. courses_select_policy previously also listed
-- `authenticated` (alongside `anon`) with no tenant_id condition at all,
-- so it silently OR-combined with courses_select_merged and let any
-- authenticated user read any OTHER tenant's published courses -- a real
-- cross-tenant leak found during this cleanup pass. anon-only policies are
-- exempt: unauthenticated catalog browsing legitimately has no tenant
-- context to scope by.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(DISTINCT policyname ORDER BY policyname)
    INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'courses'
    AND cmd IN ('SELECT', 'ALL')
    AND permissive = 'PERMISSIVE'
    AND 'authenticated' = ANY(roles)
    AND coalesce(qual, '') !~* 'tenant_id\s*=';

  INSERT INTO validation_results VALUES (
    'courses Policies For authenticated Are Tenant-Scoped',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: cross-tenant read leak -- these public.courses policies grant '
        || 'to authenticated with no tenant_id condition, so they OR-combine with '
        || 'courses_select_merged and expose every tenant''s courses to every '
        || 'authenticated user: ' || array_to_string(v_bad, ', '),
      'Every public.courses policy granted to authenticated includes a tenant_id condition'
    )
  );
END $$;

-- Check 36: rollout_pct is documented and CHECK-constrained as basis points
-- (0..10000, 10000 = 100%), but real production data was found stored as
-- plain percentages (0..100) -- e.g. rollout_pct=100 meant to mean "100%"
-- actually only reaches 1% of users (100 of 10000 buckets), since
-- evaluate_feature_flag() compares a 0..9999 deterministic bucket against
-- rollout_pct directly. Any enabled/rolling-out flag whose rollout_pct is
-- in (0,100] and not exactly 10000 is a near-certain unit-scale data entry
-- error, not a legitimate 0.01%-1% rollout (WARN, not FAIL: a value in
-- this range is not technically invalid, just extremely likely to be a
-- mistake -- this cannot be fixed by a schema change, only by correcting
-- the data with an UPDATE against the live rows).
DO $$
DECLARE
  v_suspect text[];
BEGIN
  SELECT array_agg(format('%s(pct=%s)', key, rollout_pct) ORDER BY key)
    INTO v_suspect
  FROM public.feature_flags
  WHERE (is_enabled OR rollout_pct > 0)
    AND rollout_pct > 0
    AND rollout_pct <= 100
    AND rollout_pct <> 10000;

  INSERT INTO validation_results VALUES (
    'feature_flags.rollout_pct Looks Like Basis Points, Not a Plain Percentage',
    CASE WHEN v_suspect IS NULL THEN 'PASS' ELSE 'WARN' END,
    COALESCE(
      'SUSPECT DATA (likely entered as 0-100% instead of 0-10000 basis points, '
        || 'so real rollout is ~100x smaller than intended): ' || array_to_string(v_suspect, ', ')
        || ' -- fix with: UPDATE public.feature_flags SET rollout_pct = rollout_pct * 100 WHERE key IN (...) AND rollout_pct <> 10000;',
      'No feature_flags row has a rollout_pct value that looks like a mistaken 0-100 percentage'
    )
  );
END $$;

-- Check 37: public.user_progress and public.activity_log_queue must NOT
-- have FORCE ROW LEVEL SECURITY (same AUTH-BUG-01 root cause as Check 26,
-- found this pass via a live-Postgres repro rather than static review
-- alone -- see the comments beside each ALTER TABLE in 09_rls.sql for the
-- exact mechanism). public.update_lesson_progress() is SECURITY DEFINER
-- and does its own INSERT ... ON CONFLICT DO UPDATE into user_progress;
-- internal.log_activity_internal() is SECURITY DEFINER and does its own
-- INSERT INTO activity_log_queue. Both run as the table owner, not
-- `authenticated`, and both tables' write policies only ever grant to
-- `authenticated` (user_progress) or deny everyone via `TO public
-- USING (false)` (activity_log_queue). With FORCE in effect neither write
-- has any matching policy, so both fail 100% of the time -- reproduced
-- with an isolated PostgreSQL 17 instance mirroring this exact
-- owner/role/policy shape. This is the confirmed root cause of the
-- "watched" checkbox in lesson_tile.dart always showing a generic error,
-- and of lesson-progress activity logging silently never persisting
-- (swallowed by the `EXCEPTION WHEN OTHERS THEN NULL` around every
-- log_activity_internal() call site, so it never surfaced as a visible
-- failure). RLS is still fully ENABLEd and enforced for anon/authenticated
-- on both tables regardless of this setting -- FORCE only ever affects
-- the table owner/superuser, and neither table is written to directly by
-- any client path in this app today.
DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('user_progress', 'activity_log_queue')
    AND c.relforcerowsecurity = true;

  INSERT INTO validation_results VALUES (
    'user_progress/activity_log_queue Do Not FORCE Row Level Security',
    CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END,
    COALESCE(
      'CRITICAL: FORCE ROW LEVEL SECURITY is set on: ' || array_to_string(v_bad, ', ')
        || ' -- the SECURITY DEFINER function that writes to this table runs as '
        || 'the table owner, which has no matching policy on this table, so '
        || 'every write from that RPC will fail with a row-level security '
        || 'violation (reproduced against a live PostgreSQL 17 instance)',
      'Neither user_progress nor activity_log_queue force RLS on the table owner (RLS remains enforced for anon/authenticated either way)'
    )
  );
END $$;

-- Check 38: push delivery pipeline must exist and remain backend-only.
DO $$
DECLARE
  v_table boolean;
  v_register boolean;
  v_deactivate boolean;
  v_claim boolean;
  v_anon_claim boolean;
BEGIN
  SELECT to_regclass('public.push_deliveries') IS NOT NULL INTO v_table;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_push_token'
  ) INTO v_register;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deactivate_push_token'
  ) INTO v_deactivate;
  SELECT has_function_privilege('service_role', 'public.claim_push_delivery(uuid)', 'EXECUTE')
    INTO v_claim;
  SELECT has_function_privilege('anon', 'public.claim_push_delivery(uuid)', 'EXECUTE')
    INTO v_anon_claim;

  INSERT INTO validation_results VALUES (
    'Reliable Push Delivery Pipeline',
    CASE WHEN v_table AND v_register AND v_deactivate AND v_claim AND NOT v_anon_claim
         THEN 'PASS' ELSE 'FAIL' END,
    format(
      'push_deliveries=%s, register_rpc=%s, deactivate_rpc=%s, service_claim=%s, anon_claim=%s',
      v_table, v_register, v_deactivate, v_claim, v_anon_claim
    )
  );
END $$;

-- Display Results (includes Checks 27-38 above)
SELECT * FROM validation_results ORDER BY check_name;

-- Summary
DO $$
DECLARE
  v_total int;
  v_pass int;
  v_fail int;
  v_warn int;
BEGIN
  SELECT COUNT(*), 
         COUNT(*) FILTER (WHERE status = 'PASS'),
         COUNT(*) FILTER (WHERE status = 'FAIL'),
         COUNT(*) FILTER (WHERE status = 'WARN')
  INTO v_total, v_pass, v_fail, v_warn
  FROM validation_results;
  
  RAISE NOTICE '';
  RAISE NOTICE '========== VALIDATION SUMMARY ==========';
  RAISE NOTICE 'Total Checks: %', v_total;
  RAISE NOTICE 'Passed:       % ✓', v_pass;
  RAISE NOTICE 'Failed:       % ✗', v_fail;
  RAISE NOTICE 'Warnings:     % ⚠', v_warn;
  RAISE NOTICE '========================================';
  
  IF v_fail > 0 THEN
    RAISE WARNING 'Schema validation failed - fix errors before deploying';
  END IF;
END $$;
