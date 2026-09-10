-- Test-session helper for the local RLS harness. Mirrors exactly what a
-- real Supabase-issued JWT + PostgREST connection provides:
--   1. A row in auth.sessions matching the session_id JWT claim
--      (private.current_jwt_session_id() / validate_user_session()).
--   2. request.jwt.claim.sub / .role  (auth.uid() / auth.role())
--   3. request.jwt.claims including token_version and session_id
--      (private.current_jwt_token_version(), validate_user_session()).
--   4. The Postgres `role` itself switched to `authenticated`, exactly
--      like PostgREST's `authenticator` role does per-request.
--
-- Usage from a superuser connection (test.login_as/test.logout are
-- SECURITY DEFINER precisely so a superuser client can drive them):
--   SELECT test.login_as('aaaaaaaa-0000-0000-0000-000000000003');
--   SET ROLE authenticated;
--   ... run RLS-scoped queries ...
--   RESET ROLE;
--   SELECT test.logout();
-- (scripts/security/pg-session.ts wraps exactly this sequence.)
--
-- Design note: `role` is deliberately NOT set inside these functions.
-- Postgres refuses `SET`/set_config('role', ...) from inside a
-- SECURITY DEFINER function ("cannot set parameter \"role\" within
-- security-definer function") -- allowing that would let any definer
-- function permanently change its caller's privileges, so Postgres
-- blocks it outright. The bookkeeping these functions do (reading
-- public.users.token_version, writing auth.sessions) needs elevated
-- privilege since this same connection may currently be `SET ROLE`'d
-- down to `anon`/`authenticated` from a previous login; switching the
-- active `role` itself has to happen as a separate, top-level statement
-- issued by the (superuser) caller instead.

CREATE SCHEMA IF NOT EXISTS test;

CREATE OR REPLACE FUNCTION test.login_as(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_token_version int;
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
END;
$$;

-- Clears the JWT claim GUCs. Does not touch `role` -- see note above;
-- callers issue `RESET ROLE` themselves (pg-session.ts does this).
CREATE OR REPLACE FUNCTION test.logout()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', '', false);
  PERFORM set_config('request.jwt.claims', '', false);
END;
$$;

GRANT USAGE ON SCHEMA test TO authenticated, anon, postgres;
GRANT EXECUTE ON FUNCTION test.login_as(uuid), test.logout() TO authenticated, anon, postgres;
