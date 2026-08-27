import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  const sql = `
CREATE OR REPLACE FUNCTION public.admin_get_jobs(
  p_page      int DEFAULT 1,
  p_page_size int DEFAULT 10,
  p_status    text DEFAULT NULL,
  p_job_type  text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  job_type        text,
  payload         jsonb,
  status          text,
  priority        int,
  attempts        int,
  max_attempts    int,
  run_at          timestamptz,
  locked_by       text,
  locked_at       timestamptz,
  lock_expires_at timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  error_msg       text,
  created_at      timestamptz,
  full_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_offset int;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  RETURN QUERY
  WITH filtered_jobs AS (
    SELECT * FROM internal.job_queue
    WHERE (p_status    IS NULL OR internal.job_queue.status   = p_status)
      AND (p_job_type  IS NULL OR internal.job_queue.job_type = p_job_type)
      AND (p_date_from IS NULL OR internal.job_queue.created_at >= p_date_from)
  ),
  total_count AS (
    SELECT count(*) AS cnt FROM filtered_jobs
  )
  SELECT
    fj.id, fj.job_type, fj.payload, fj.status, fj.priority,
    fj.attempts, fj.max_attempts, fj.run_at, 
    fj.locked_by_worker_id::text AS locked_by,
    fj.locked_at, fj.lock_expires_at, fj.started_at,
    fj.finished_at AS completed_at, 
    fj.error_message AS error_msg, 
    fj.created_at,
    tc.cnt
  FROM filtered_jobs fj, total_count tc
  ORDER BY fj.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_job_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'pending',    (SELECT count(*) FROM internal.job_queue WHERE status = 'pending'),
      'processing', (SELECT count(*) FROM internal.job_queue WHERE status = 'processing'),
      'done',       (SELECT count(*) FROM internal.job_queue WHERE status = 'done'),
      'failed',     (SELECT count(*) FROM internal.job_queue WHERE status = 'failed'),
      'dead',       (SELECT count(*) FROM internal.job_queue WHERE status = 'dead')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE internal.job_queue
  SET status = 'pending',
      run_at = pg_catalog.now(),
      attempts = 0,
      error_message = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE internal.job_queue
  SET status = 'dead',
      finished_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_job(p_id uuid)
RETURNS TABLE (
  id              uuid,
  job_type        text,
  status          text,
  error_msg       text,
  created_at      timestamptz,
  completed_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    jq.id,
    jq.job_type,
    jq.status,
    jq.error_message AS error_msg,
    jq.created_at,
    jq.finished_at AS completed_at
  FROM internal.job_queue jq
  WHERE jq.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_enqueue_bulk_job(
  p_job_type text,
  p_payload jsonb,
  p_initiator_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_job internal.job_queue;
  v_tenant_id uuid;
  v_pending_count int;
  max_pending_jobs constant int := 10;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_with_session_validation() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.users
  WHERE id = p_initiator_id AND deleted_at IS NULL;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INITIATOR_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_pending_count
  FROM internal.job_queue
  WHERE status = 'pending';

  IF v_pending_count >= max_pending_jobs THEN
    RAISE EXCEPTION 'JOB_QUEUE_FULL: Too many pending operations';
  END IF;

  INSERT INTO internal.job_queue (job_type, payload, priority, max_attempts, status, run_at, tenant_id)
  VALUES (p_job_type, p_payload, 5, 3, 'pending', pg_catalog.now(), v_tenant_id)
  RETURNING * INTO v_job;

  RETURN to_jsonb(v_job);
END;
$$;
`;

  console.log('Updating job functions in the database...');
  await client.query(sql);
  console.log('Functions updated successfully!');

  console.log('Sending reload schema notification to Postgrest...');
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log('Schema reload triggered!');

  await client.end();
}

run().catch(console.error);
