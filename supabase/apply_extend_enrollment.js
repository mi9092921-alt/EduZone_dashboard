const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const urlFilePath = path.join(__dirname, 'db_url.txt');
  let dbUrl = null;
  const content = fs.readFileSync(urlFilePath, 'utf8');
  for (const line of content.split('\n')) {
    const clean = line.replace(/\r/g, '').trim();
    if (clean.startsWith('DATABASE_URL=')) {
      dbUrl = clean.substring('DATABASE_URL='.length).trim();
      break;
    }
  }
  if (!dbUrl) {
    console.error('DATABASE_URL not found in supabase/db_url.txt');
    process.exit(1);
  }

  console.log('Connecting to Supabase Staging Database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  const sqlExtendEnrollment = `
CREATE OR REPLACE FUNCTION public.extend_enrollment(
  p_user_id     uuid,
  p_course_id   uuid,
  p_new_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id    uuid := auth.uid();
  v_tenant_id   uuid := public.get_current_tenant_id();
  v_enrollment  record;
BEGIN
  -- 1. Caller must be authenticated
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: not authenticated';
  END IF;

  -- 2. Caller must hold courses.manage in current tenant
  IF NOT public.user_has_permission(v_actor_id, 'courses.manage', v_tenant_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- 3. New expiry must be strictly in the future
  IF p_new_expires_at IS NULL OR p_new_expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'INVALID_EXPIRY: new expiry must be a future timestamp';
  END IF;

  -- 4. Load the enrollment — must exist and belong to the current tenant
  SELECT e.*
    INTO v_enrollment
    FROM public.enrollments e
   WHERE e.user_id    = p_user_id
     AND e.course_id  = p_course_id
     AND e.tenant_id  = v_tenant_id
     AND e.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND';
  END IF;

  -- 5. Verify course belongs to same tenant (defense-in-depth, BOLA guard)
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
     WHERE id = p_course_id
       AND tenant_id = v_tenant_id
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND';
  END IF;

  -- 6. Verify student belongs to same tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = p_user_id
       AND tenant_id = v_tenant_id
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'USER_NOT_IN_TENANT';
  END IF;

  -- 7. Status transition rules
  IF v_enrollment.status = 'completed' THEN
    RAISE EXCEPTION 'INVALID_STATUS: cannot extend a completed enrollment';
  END IF;

  -- 8. Apply update — active stays active; expired/revoked reactivated
  UPDATE public.enrollments
     SET expires_at    = p_new_expires_at,
         status        = CASE
                           WHEN status IN ('expired', 'revoked') THEN 'active'
                           ELSE status
                         END,
         -- Clear revoke fields when reactivating
         revoked_at    = CASE WHEN status = 'revoked' THEN NULL ELSE revoked_at END,
         revoked_by    = CASE WHEN status = 'revoked' THEN NULL ELSE revoked_by END,
         revoke_reason = CASE WHEN status = 'revoked' THEN NULL ELSE revoke_reason END,
         updated_at    = pg_catalog.now()
   WHERE user_id  = p_user_id
     AND course_id = p_course_id
     AND tenant_id = v_tenant_id;

  -- 9. Best-effort audit log (same pattern as update_lesson_progress)
  BEGIN
    PERFORM internal.log_activity_internal(
      v_actor_id,
      'enrollment_extended',
      jsonb_build_object(
        'course_id',        p_course_id,
        'student_id',       p_user_id,
        'enrollment_id',    v_enrollment.id,
        'prev_status',      v_enrollment.status,
        'prev_expires_at',  v_enrollment.expires_at,
        'new_expires_at',   p_new_expires_at,
        'action',           CASE
                              WHEN v_enrollment.status IN ('expired', 'revoked')
                              THEN 'reactivated'
                              ELSE 'extended'
                            END
      ),
      NULL,
      NULL,
      'medium',
      v_tenant_id
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_enrollment(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_enrollment(uuid, uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.extend_enrollment(uuid, uuid, timestamptz) TO authenticated, service_role;
`;

  try {
    await client.connect();
    console.log('Connected successfully!');

    console.log('Applying extend_enrollment RPC and permissions...');
    await client.query(sqlExtendEnrollment);
    console.log('Applied extend_enrollment successfully!');

    console.log('\n--- VERIFYING FUNCTION IN DB ---');
    const procRes = await client.query(`
      SELECT p.proname,
             pg_get_function_identity_arguments(p.oid) as args,
             pg_get_function_result(p.oid) as return_type,
             p.prosecdef as security_definer
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'extend_enrollment';
    `);
    console.table(procRes.rows);

    console.log('\n--- VERIFYING PERMISSIONS ---');
    const privRes = await client.query(`
      SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'extend_enrollment'
      ORDER BY grantee;
    `);
    console.table(privRes.rows);

    if (procRes.rowCount > 0) {
      console.log('\n[SUCCESS] STG-1: extend_enrollment is deployed, verified, and permissions are granted!');
    } else {
      throw new Error('extend_enrollment not found in pg_proc after execution');
    }
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
