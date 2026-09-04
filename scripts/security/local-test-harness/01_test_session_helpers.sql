-- Test-session helper for the local RLS harness. Mirrors exactly what a
-- real Supabase-issued JWT + PostgREST connection provides:
--   1. A row in auth.sessions matching the session_id JWT claim
--      (private.current_jwt_session_id() / validate_user_session()).
--   2. request.jwt.claim.sub / .role  (auth.uid() / auth.role())
--   3. request.jwt.claims including token_version and session_id
--      (private.current_jwt_token_version(), validate_user_session()).
-- Usage: SELECT test.login_as('aaaaaaaa-0000-0000-0000-000000000003');
-- Then every subsequent statement on this connection runs as that user
-- under real RLS, exactly as PostgREST would apply it.

CREATE SCHEMA IF NOT EXISTS test;

CREATE OR REPLACE FUNCTION test.login_as(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_session_id uuid;
  v_token_version int;
  v_role text;
BEGIN
  SELECT token_version INTO v_token_version FROM public.users WHERE id = p_user_id;
  IF v_token_version IS NULL THEN
    RAISE EXCEPTION 'test.login_as: no public.users row for %', p_user_id;
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  INSERT INTO auth.sessions (user_id) VALUES (p_user_id) RETURNING id INTO v_session_id;

  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated',
      'session_id', v_session_id::text,
      'token_version', v_token_version
    )::text,
    false
  );
  PERFORM set_config('role', 'authenticated', false);
END;
$$;

-- Reset to an anonymous / unauthenticated connection.
CREATE OR REPLACE FUNCTION test.logout()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', '', false);
  PERFORM set_config('request.jwt.claims', '', false);
  PERFORM set_config('role', 'anon', false);
END;
$$;

-- authenticated/anon must be able to call test.login_as()/test.logout()
-- even after SET ROLE authenticated has already taken effect this
-- session, or every login after the first one fails with "permission
-- denied for schema test".
GRANT USAGE ON SCHEMA test TO authenticated, anon;
GRANT EXECUTE ON FUNCTION test.login_as(uuid), test.logout() TO authenticated, anon;
