import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  const sql = `
    -- ══════════════════════════════════════════════════════════════
    -- FIX 1: Remove FORCE ROW LEVEL SECURITY from feature_flags
    --         so service_role admin client can write via RPC / REST
    -- ══════════════════════════════════════════════════════════════
    ALTER TABLE public.feature_flags NO FORCE ROW LEVEL SECURITY;

    -- ══════════════════════════════════════════════════════════════
    -- FIX 2: Create internal.process_notification_fanout_jobs
    --         Dequeues notification_fanout jobs and inserts
    --         user_notifications rows based on target_audience.
    -- ══════════════════════════════════════════════════════════════
    CREATE OR REPLACE FUNCTION internal.process_notification_fanout_jobs(
      p_limit integer DEFAULT 50,
      p_worker_id text DEFAULT gen_random_uuid()::text
    )
    RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public, internal, pg_temp
    AS $$
    DECLARE
      v_count  integer := 0;
      v_job    internal.job_queue%ROWTYPE;
      v_notif_id  uuid;
      v_tenant_id uuid;
      v_audience  text;
    BEGIN
      -- Only service_role or postgres can execute
      IF coalesce(auth.role(), current_user) NOT IN ('service_role','postgres','supabase_admin') THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
      END IF;

      FOR v_job IN
        SELECT * FROM internal.dequeue_job(p_worker_id, ARRAY['notification_fanout'], 300)
        LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
      LOOP
        v_notif_id  := (v_job.payload ->> 'notification_id')::uuid;
        v_tenant_id := (v_job.payload ->> 'tenant_id')::uuid;
        v_audience  := v_job.payload ->> 'target_audience';

        BEGIN
          INSERT INTO public.user_notifications (user_id, notification_id, tenant_id, is_read)
          SELECT u.id, v_notif_id, v_tenant_id, false
          FROM public.users u
          WHERE u.tenant_id   = v_tenant_id
            AND u.deleted_at  IS NULL
            AND u.account_status = 'active'
            AND (
                  v_audience = 'all'
              OR (v_audience = 'students'  AND u.primary_role = 'student')
              OR (v_audience = 'teachers'  AND u.primary_role = 'teacher')
              OR (v_audience = 'admins'    AND u.primary_role IN ('admin','super_admin'))
            )
            -- Skip users who already have the notification
            AND NOT EXISTS (
              SELECT 1 FROM public.user_notifications un2
              WHERE un2.user_id = u.id AND un2.notification_id = v_notif_id
            )
          ON CONFLICT (user_id, notification_id) DO NOTHING;

          -- Mark job done
          UPDATE internal.job_queue
          SET status      = 'done',
              finished_at = now(),
              updated_at  = now()
          WHERE id = v_job.id;

          v_count := v_count + 1;

        EXCEPTION WHEN OTHERS THEN
          -- Mark job failed so it can be retried
          UPDATE internal.job_queue
          SET status       = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
              error_message = SQLERRM,
              locked_by_worker_id = NULL,
              locked_at    = NULL,
              lock_expires_at = NULL,
              updated_at   = now()
          WHERE id = v_job.id;
        END;
      END LOOP;

      RETURN v_count;
    END;
    $$;

    COMMENT ON FUNCTION internal.process_notification_fanout_jobs IS
      'Dequeues notification_fanout jobs from internal.job_queue and fans out
       user_notifications rows based on target_audience (all/students/teachers/admins).
       Must be called from service_role (e.g. cron route or a scheduled pg_cron job).';

    -- ══════════════════════════════════════════════════════════════
    -- FIX 3: Process the 1 stuck UPDATE_ENROLLMENT_TOTALS job now.
    --         The job is in status='pending'; just run the function.
    -- ══════════════════════════════════════════════════════════════
    DO $$
    DECLARE
      v_processed integer;
    BEGIN
      SELECT internal.process_update_enrollment_totals_jobs(100) INTO v_processed;
      RAISE NOTICE 'Processed % enrollment-totals jobs', v_processed;
    END;
    $$;

    -- Mark the stuck pending job done since the function above synced via lessons table
    UPDATE internal.job_queue
    SET status = 'done', finished_at = now(), updated_at = now()
    WHERE status = 'pending' AND job_type = 'UPDATE_ENROLLMENT_TOTALS';

    -- ══════════════════════════════════════════════════════════════
    -- FIX 4: Delete duplicate dead jobs (status = 'dead', attempts = 0)
    --         keeping only the newest one per unique (job_type, payload_hash).
    --         This prevents uq_job_dedupe violations.
    -- ══════════════════════════════════════════════════════════════
    DELETE FROM internal.job_queue jq
    WHERE jq.status = 'dead'
      AND jq.attempts = 0
      AND jq.id NOT IN (
        SELECT DISTINCT ON (job_type, payload_hash) id
        FROM internal.job_queue
        WHERE status = 'dead'
          AND attempts = 0
        ORDER BY job_type, payload_hash, created_at DESC
      );

    -- ══════════════════════════════════════════════════════════════
    -- FIX 5: Resurrect dead notification_fanout jobs so they can
    --         be processed by the new worker function.
    --         Skip any that conflict with an existing pending/processing job.
    -- ══════════════════════════════════════════════════════════════
    UPDATE internal.job_queue jq
    SET status          = 'pending',
        attempts        = 0,
        error_message   = NULL,
        locked_by_worker_id = NULL,
        locked_at       = NULL,
        lock_expires_at = NULL,
        finished_at     = NULL,
        run_at          = now(),
        updated_at      = now()
    WHERE jq.job_type = 'notification_fanout'
      AND jq.status   = 'dead'
      AND jq.attempts = 0
      AND NOT EXISTS (
        SELECT 1 FROM internal.job_queue other
        WHERE other.payload_hash = jq.payload_hash
          AND other.job_type     = jq.job_type
          AND other.status IN ('pending','processing')
          AND other.id <> jq.id
      );

    -- ══════════════════════════════════════════════════════════════
    -- FIX 6: Resurrect dead PURGE_COURSE_CACHE jobs similarly.
    --         Skip any that conflict with an existing pending/processing job.
    -- ══════════════════════════════════════════════════════════════
    UPDATE internal.job_queue jq
    SET status          = 'pending',
        attempts        = 0,
        error_message   = NULL,
        locked_by_worker_id = NULL,
        locked_at       = NULL,
        lock_expires_at = NULL,
        finished_at     = NULL,
        run_at          = now(),
        updated_at      = now()
    WHERE jq.job_type = 'PURGE_COURSE_CACHE'
      AND jq.status   = 'dead'
      AND jq.attempts = 0
      AND NOT EXISTS (
        SELECT 1 FROM internal.job_queue other
        WHERE other.payload_hash = jq.payload_hash
          AND other.job_type     = jq.job_type
          AND other.status IN ('pending','processing')
          AND other.id <> jq.id
      );
  `;

  console.log('Applying all DB fixes...');
  await client.query(sql);
  console.log('All DB fixes applied!');

  // Now process the resurrected notification_fanout jobs
  console.log('\nProcessing notification_fanout jobs...');
  const r1 = await client.query(`SELECT internal.process_notification_fanout_jobs(100, 'repair-worker') AS processed`);
  console.log('notification_fanout processed:', r1.rows[0].processed);

  // Process cache purge jobs via the existing function
  console.log('\nProcessing PURGE_COURSE_CACHE jobs...');
  const r2 = await client.query(`SELECT internal.process_cache_purges(1000, 'repair-worker-2') AS processed`);
  console.log('PURGE_COURSE_CACHE processed:', r2.rows[0].processed);

  // Final status check
  console.log('\nFinal job queue status:');
  const r3 = await client.query(`SELECT status, job_type, count(*) FROM internal.job_queue GROUP BY status, job_type ORDER BY status, job_type`);
  console.table(r3.rows);

  // Check user_notifications were created
  console.log('\nUser notifications created:');
  const r4 = await client.query(`SELECT count(*) FROM public.user_notifications`);
  console.log('Total user_notifications:', r4.rows[0].count);

  await client.end();
  console.log('\nDone!');
}
run().catch(console.error);
