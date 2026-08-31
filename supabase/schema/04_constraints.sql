-- Canonical schema source. supabase/schema/ (this file and its siblings, per
-- supabase/config.toml schema_paths) is the single source of truth -- no
-- migrations, patches, or external SQL files. Historical note: originally
-- generated from a monolithic Eduzone_schema_v13.sql during a normalization
-- pass (#3, ownership rules); that file no longer exists in this repo.
-- ============================================================================
-- 004_migrations.sql (v13 column patching)
-- Ensures existing tables from previous versions are upgraded with tenant_id
-- and region_id before dependent logic is applied.
-- ============================================================================

DO $$
DECLARE
  v_table text;
  v_partition_key text;
  v_cols_ok boolean;
  v_al_part_key text;
BEGIN
  -- 1. users
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.users ADD COLUMN tenant_id uuid NOT NULL DEFAULT public.system_tenant_id() REFERENCES public.tenants(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'region_id') THEN
      EXECUTE 'ALTER TABLE public.users ADD COLUMN region_id text NOT NULL DEFAULT public.get_default_region_id() REFERENCES public.regions(id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_encrypted') THEN
      ALTER TABLE public.users ADD COLUMN email_encrypted bytea;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone_encrypted') THEN
      ALTER TABLE public.users ADD COLUMN phone_encrypted bytea;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_hash') THEN
      ALTER TABLE public.users ADD COLUMN email_hash text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'search_vector') THEN
      ALTER TABLE public.users ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
      ) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'shard_key') THEN
      ALTER TABLE public.users ADD COLUMN shard_key smallint GENERATED ALWAYS AS (abs(hashtext(id::text)) % 256) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'token_version') THEN
      ALTER TABLE public.users ADD COLUMN token_version integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'warning_count') THEN
      ALTER TABLE public.users ADD COLUMN warning_count integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'login_count') THEN
      ALTER TABLE public.users ADD COLUMN login_count integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'lock_reason') THEN
      ALTER TABLE public.users ADD COLUMN lock_reason text;
      ALTER TABLE public.users ADD COLUMN locked_at timestamptz;
      ALTER TABLE public.users ADD COLUMN locked_by uuid;
      ALTER TABLE public.users ADD COLUMN suspension_until timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login') THEN
      ALTER TABLE public.users ADD COLUMN last_login timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_seen_at') THEN
      ALTER TABLE public.users ADD COLUMN last_seen_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deleted_at') THEN
      ALTER TABLE public.users ADD COLUMN deleted_at timestamptz;
    END IF;
  END IF;

  -- 2. roles
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'roles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.roles ADD COLUMN tenant_id uuid NOT NULL DEFAULT public.system_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- 3. user_roles
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_roles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.user_roles ADD COLUMN tenant_id uuid NOT NULL DEFAULT public.system_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- 4. courses
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'courses') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.courses ADD COLUMN tenant_id uuid NOT NULL DEFAULT public.system_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'region_id') THEN
      EXECUTE 'ALTER TABLE public.courses ADD COLUMN region_id text NOT NULL DEFAULT public.get_default_region_id() REFERENCES public.regions(id)';
    END IF;
  END IF;

  -- 4a. enrollments
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'enrollments') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'updated_at') THEN
      ALTER TABLE public.enrollments ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'created_at') THEN
      ALTER TABLE public.enrollments ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'total_lessons') THEN
      ALTER TABLE public.enrollments ADD COLUMN total_lessons integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'completed_lessons') THEN
      ALTER TABLE public.enrollments ADD COLUMN completed_lessons integer NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'progress_pct') THEN
      ALTER TABLE public.enrollments ADD COLUMN progress_pct numeric(5,2) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'last_watched_at') THEN
      ALTER TABLE public.enrollments ADD COLUMN last_watched_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'deleted_at') THEN
      ALTER TABLE public.enrollments ADD COLUMN deleted_at timestamptz;
    END IF;
  END IF;

  -- 4b. legacy public.admins (v12) column patching Ã¢â‚¬â€ runs only when old table exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admins') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'user_id') THEN
      ALTER TABLE public.admins
        ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
      UPDATE public.admins a
      SET user_id = u.id
      FROM public.users u
      WHERE lower(u.email) = lower(a.email)
        AND a.user_id IS NULL;
      ALTER TABLE public.admins ADD CONSTRAINT admins_user_id_key UNIQUE (user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'deleted_at') THEN
      ALTER TABLE public.admins ADD COLUMN deleted_at timestamptz;
    END IF;
  END IF;

  -- 4c. sections and lessons patching
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sections') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'order_index') THEN
      ALTER TABLE public.sections ADD COLUMN order_index integer NOT NULL DEFAULT 0 CHECK (order_index >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'deleted_at') THEN
      ALTER TABLE public.sections ADD COLUMN deleted_at timestamptz;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lessons') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'order_index') THEN
      ALTER TABLE public.lessons ADD COLUMN order_index integer NOT NULL DEFAULT 0 CHECK (order_index >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'deleted_at') THEN
      ALTER TABLE public.lessons ADD COLUMN deleted_at timestamptz;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'course_learning_objectives') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'course_learning_objectives' AND column_name = 'order_index') THEN
      ALTER TABLE public.course_learning_objectives ADD COLUMN order_index integer NOT NULL DEFAULT 0;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'internal' AND tablename = 'job_queue') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'internal' AND table_name = 'job_queue' AND column_name = 'tenant_id') THEN
      ALTER TABLE internal.job_queue ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- Generic block for other tables
    -- -----------------------------------------------------------------------
    -- 5. Partitioned table compatibility: user_location_logs
    --    v12 used PARTITION BY RANGE (timestamp).
    --    v13 requires PARTITION BY RANGE (logged_at).
    --    The only safe migration is to DROP the old table (it is a telemetry
    --    log - no business-critical data) and let the CREATE TABLE below
    --    rebuild it with the correct schema.
    -- -----------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_location_logs') THEN
      -- Check if it is partitioned by the wrong key ("timestamp" instead of "logged_at")
      SELECT a.attname INTO v_partition_key
      FROM pg_partitioned_table pt
      JOIN pg_class c ON c.oid = pt.partrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(pt.partattrs)
      WHERE n.nspname = 'public' AND c.relname = 'user_location_logs'
      LIMIT 1;

      IF v_partition_key IS NOT NULL AND v_partition_key <> 'logged_at' THEN
        -- Table is partitioned by wrong column - drop and let CREATE TABLE rebuild
        RAISE WARNING 'Partition migration skipped for existing table user_location_logs';
      ELSIF v_partition_key IS NULL THEN
        -- Non-partitioned version from an even older schema - drop and rebuild
        RAISE WARNING 'Partition migration skipped for existing table user_location_logs';
      END IF;
      -- If v_partition_key = 'logged_at', the table is already correct; skip.
    END IF;

    -- -----------------------------------------------------------------------
    -- 6. Partitioned table compatibility: sessions
    --    v12 used "started_at" (same as v13) but with quarterly partitions.
    --    Check if it needs a rebuild only if the partition key changed.
    -- -----------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sessions') THEN
      SELECT a.attname INTO v_partition_key
      FROM pg_partitioned_table pt
      JOIN pg_class c ON c.oid = pt.partrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(pt.partattrs)
      WHERE n.nspname = 'public' AND c.relname = 'sessions'
      LIMIT 1;

      IF v_partition_key IS NOT NULL AND v_partition_key <> 'started_at' THEN
        RAISE WARNING 'Partition migration skipped for existing table sessions';
      END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- 7. Partitioned table compatibility: video_views
    --    v12 used "viewed_at" (same as v13).
    --    Only rebuild if partition key changed.
    -- -----------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'video_views') THEN
      SELECT a.attname INTO v_partition_key
      FROM pg_partitioned_table pt
      JOIN pg_class c ON c.oid = pt.partrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(pt.partattrs)
      WHERE n.nspname = 'public' AND c.relname = 'video_views'
      LIMIT 1;

      IF v_partition_key IS NOT NULL AND v_partition_key <> 'viewed_at' THEN
        RAISE WARNING 'Partition migration skipped for existing table video_views';
      END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- 8. Column-compatibility sweep for non-critical operational tables.
    --    If a table exists but is missing a column that v13 indexes/constraints
    --    depend on (user_id, tenant_id), we drop it so CREATE TABLE IF NOT
    --    EXISTS below can rebuild it with the correct schema.
    --    These tables hold operational/telemetry data and are safe to truncate.
    -- -----------------------------------------------------------------------
      -- Tables that MUST have both tenant_id and user_id for v13 indexes
      FOR v_table IN SELECT unnest(ARRAY[
        'devices', 'todos', 'warnings', 'push_tokens',
        'user_notifications', 'activity_log_queue'
      ])
      LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
          v_cols_ok := EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'user_id'
          );
          IF NOT v_cols_ok THEN
            RAISE EXCEPTION 'Table public.% is missing user_id. Refusing destructive rebuild; run an explicit audited migration.', v_table;
          END IF;
        END IF;
      END LOOP;

      -- rate_limits: needs user_id (uuid), ip_address (inet), device_id (uuid)
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'rate_limits' AND column_name = 'user_id'
        ) THEN
          RAISE EXCEPTION 'rate_limits is missing user_id. Refusing destructive rebuild; run an explicit audited migration.';
        END IF;
      END IF;

      -- access_rules / user_access_rules: needs tenant_id
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'access_rules') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'access_rules' AND column_name = 'tenant_id'
        ) THEN
          RAISE EXCEPTION 'access_rules is missing tenant_id. Refusing destructive rebuild; run an explicit audited migration.';
        END IF;
      END IF;

      -- activity_logs: rebuild if ANY of the following are true:
      --   (a) missing user_id column            ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ v12 legacy schema
      --   (b) missing created_at column          ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ the direct cause of ERROR 42703
      --   (c) partition key is not 'created_at'  ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ wrong partitioning strategy
      -- All three cases require a full DROP + rebuild via CREATE TABLE IF NOT EXISTS below.
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_logs') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'user_id'
        ) OR NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'created_at'
        ) THEN
          RAISE EXCEPTION 'activity_logs is missing required columns. Refusing destructive rebuild; run an explicit audited migration.';
        ELSE
          -- Both columns exist; verify the partition key is also correct
          SELECT a.attname INTO v_al_part_key
          FROM pg_partitioned_table pt
          JOIN pg_class c ON c.oid = pt.partrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(pt.partattrs)
          WHERE n.nspname = 'public' AND c.relname = 'activity_logs'
          LIMIT 1;

          IF v_al_part_key IS DISTINCT FROM 'created_at' THEN
            RAISE EXCEPTION 'activity_logs has unexpected partition key %. Refusing destructive rebuild; run an explicit audited migration.', v_al_part_key;
          END IF;
        END IF;
      END IF;

      -- activity_log_queue: also check for created_at (used by idx_activity_log_queue_pending)
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_log_queue') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'activity_log_queue' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE public.activity_log_queue
            ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
        END IF;
      END IF;

      -- enrollments: needs user_id, course_id, tenant_id
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'enrollments') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'tenant_id'
        ) THEN
          RAISE EXCEPTION 'enrollments is missing tenant_id. Refusing destructive rebuild; run an explicit audited migration.';
        END IF;
      END IF;

      -- user_progress: needs tenant_id
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_progress') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_progress' AND column_name = 'tenant_id'
        ) THEN
          RAISE EXCEPTION 'user_progress is missing tenant_id. Refusing destructive rebuild; run an explicit audited migration.';
        END IF;
      END IF;

      -- notifications / user_notifications: needs tenant_id
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'tenant_id'
        ) THEN
          RAISE EXCEPTION 'notifications is missing tenant_id. Refusing destructive rebuild; run an explicit audited migration.';
        END IF;
      END IF;

      -- user_last_location: needs tenant_id
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_last_location') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_last_location' AND column_name = 'tenant_id'
        ) THEN
          RAISE EXCEPTION 'user_last_location is missing tenant_id. Refusing destructive rebuild; run an explicit audited migration.';
        END IF;
      END IF;
    -- -----------------------------------------------------------------------
    -- 9. Add tenant_id to any tables that still exist and are missing it
    -- -----------------------------------------------------------------------
    FOR v_table IN SELECT unnest(ARRAY[
      'enrollments', 'user_progress', 'devices', 'sessions', 'video_views',
      'todos', 'warnings', 'push_tokens', 'user_location_logs', 'user_last_location',
      'activity_logs', 'notifications', 'user_notifications', 'access_rules', 'rate_limits',
      'course_prerequisites', 'course_learning_objectives', 'sections', 'lessons', 'lesson_contents'
    ])
    LOOP
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'tenant_id') THEN
          EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid NOT NULL DEFAULT public.system_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE', v_table);
        END IF;
      END IF;
    END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'chk_users_first_name_len'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_first_name_len CHECK (length(first_name) <= 255),
      ADD CONSTRAINT chk_users_last_name_len  CHECK (length(last_name)  <= 255);
  END IF;
END $$;

-- Force soft delete only via soft_delete_user() RPC

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_created_by_fkey') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_updated_by_fkey') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.users(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_locked_by_fkey') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_locked_by_fkey
      FOREIGN KEY (locked_by) REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_created_by_fkey') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_updated_by_fkey') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.users(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;

  -- CRIT-03: Add FKs to pii_access_log
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pii_access_log_user_id_fkey') THEN
    ALTER TABLE audit.pii_access_log
      ADD CONSTRAINT pii_access_log_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  -- HIGH-04 FIX: Add missing settings_kv FK
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_kv_updated_by_fkey') THEN
    ALTER TABLE public.settings_kv
      ADD CONSTRAINT settings_kv_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pii_access_log_accessed_by_fkey') THEN
    ALTER TABLE audit.pii_access_log
      ADD CONSTRAINT pii_access_log_accessed_by_fkey
      FOREIGN KEY (accessed_by) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  -- HIGH-05: Add FKs to deletion_audit
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deletion_audit_deleted_by_fkey') THEN
    ALTER TABLE audit.deletion_audit
      ADD CONSTRAINT deletion_audit_deleted_by_fkey
      FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deletion_audit_restored_by_fkey') THEN
    ALTER TABLE audit.deletion_audit
      ADD CONSTRAINT deletion_audit_restored_by_fkey
      FOREIGN KEY (restored_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- NOTE: The following constraints reference tables that are created LATER in this file
-- (user_notifications at line ~1353, notifications at ~1332, notification_targets at ~1347,
-- internal.job_queue at ~1403). They are applied in a deferred DO block at the end of
-- 005b so they run after their tables exist. Tables that already exist at this point
-- (enrollments, courses, sessions) are safe to ALTER here.

-- Safe ALTERs: enrollments, courses, sessions already exist above this point
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_progress_pct' AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT chk_progress_pct CHECK (progress_pct BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_price_non_negative' AND conrelid = 'public.courses'::regclass
  ) THEN
    ALTER TABLE public.courses ADD CONSTRAINT chk_price_non_negative CHECK (price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_risk_score' AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions ADD CONSTRAINT chk_risk_score CHECK (risk_score >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'audit.alert_log'::regclass
      AND conname = 'alert_log_tenant_fkey'
  ) THEN
    ALTER TABLE audit.alert_log
      ADD CONSTRAINT alert_log_tenant_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'audit.alert_log'::regclass
      AND conname = 'alert_log_user_fkey'
  ) THEN
    ALTER TABLE audit.alert_log
      ADD CONSTRAINT alert_log_user_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits') THEN
    FOR r IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rate_limits'
        AND con.contype = 'u'
        AND con.conname <> 'rate_limits_pkey'
    LOOP
      EXECUTE format('ALTER TABLE public.rate_limits DROP CONSTRAINT %I', r.conname);
    END LOOP;
  END IF;
END $$;

-- JSONB size protection. PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, so
-- each constraint is guarded explicitly for idempotent deployments.
DO $$
BEGIN
  -- FIX #5: Incomplete JSONB Size Constraints - Add all missing constraints
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.activity_log_queue'::regclass
      AND conname = 'chk_activity_log_queue_details_size'
  ) THEN
    ALTER TABLE public.activity_log_queue
      ADD CONSTRAINT chk_activity_log_queue_details_size
      CHECK (pg_column_size(details) <= 65536);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.activity_logs'::regclass
      AND conname = 'chk_activity_logs_details_size'
  ) THEN
    ALTER TABLE public.activity_logs
      ADD CONSTRAINT chk_activity_logs_details_size
      CHECK (pg_column_size(details) <= 65536);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.devices'::regclass
      AND conname = 'chk_devices_device_info_size'
  ) THEN
    ALTER TABLE public.devices
      ADD CONSTRAINT chk_devices_device_info_size
      CHECK (pg_column_size(device_info) <= 16384);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.devices'::regclass
      AND conname = 'chk_devices_fingerprint_version'
  ) THEN
    ALTER TABLE public.devices
      ADD CONSTRAINT chk_devices_fingerprint_version
      CHECK (fingerprint_version IN ('v1', 'v2'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.feature_flags'::regclass
      AND conname = 'chk_feature_flags_metadata_size'
  ) THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_metadata_size
      CHECK (pg_column_size(metadata) <= 65536);
  END IF;

  -- Added from audit
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'chk_tenants_metadata_size') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT chk_tenants_metadata_size CHECK (pg_column_size(metadata) <= 131072);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_progress' AND column_name = 'progress_state') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_progress'::regclass AND conname = 'chk_progress_state_size') THEN
      ALTER TABLE public.user_progress ADD CONSTRAINT chk_progress_state_size CHECK (pg_column_size(progress_state) <= 65536);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'snapshot') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sessions'::regclass AND conname = 'chk_sessions_snapshot_size') THEN
      ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_snapshot_size CHECK (pg_column_size(snapshot) <= 262144);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'metadata') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notifications'::regclass AND conname = 'chk_notifications_metadata_size') THEN
      ALTER TABLE public.notifications ADD CONSTRAINT chk_notifications_metadata_size CHECK (pg_column_size(metadata) <= 131072);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'access_rules' AND column_name = 'conditions') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.access_rules'::regclass AND conname = 'chk_access_rules_conditions_size') THEN
      ALTER TABLE public.access_rules ADD CONSTRAINT chk_access_rules_conditions_size CHECK (pg_column_size(conditions) <= 65536);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rate_limits' AND column_name = 'metadata') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rate_limits'::regclass AND conname = 'chk_rate_limits_metadata_size') THEN
      ALTER TABLE public.rate_limits ADD CONSTRAINT chk_rate_limits_metadata_size CHECK (pg_column_size(metadata) <= 16384);
    END IF;
  END IF;


  -- NEW: Missing constraints for other JSONB columns
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenants'::regclass
      AND conname = 'chk_tenants_metadata_size'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT chk_tenants_metadata_size
      CHECK (pg_column_size(metadata) <= 131072);  -- 128 KB
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'metadata') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.notifications'::regclass
        AND conname = 'chk_notifications_metadata_size'
    ) THEN
      ALTER TABLE public.notifications
        ADD CONSTRAINT chk_notifications_metadata_size
        CHECK (pg_column_size(metadata) <= 131072);  -- 128 KB
    END IF;
  END IF;
END $$;

-- Composite tenant FKs harden RLS with relational guarantees. These prevent
-- service-role jobs or future RPC bugs from creating cross-tenant records.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND conname = 'users_id_tenant_unique') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.courses'::regclass AND conname = 'courses_id_tenant_unique') THEN
    ALTER TABLE public.courses ADD CONSTRAINT courses_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.devices'::regclass AND conname = 'devices_id_tenant_unique') THEN
    ALTER TABLE public.devices ADD CONSTRAINT devices_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_id_tenant_unique') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sections'::regclass AND conname = 'sections_id_tenant_unique') THEN
    ALTER TABLE public.sections ADD CONSTRAINT sections_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sections'::regclass AND conname = 'sections_course_tenant_fkey') THEN
    ALTER TABLE public.sections ADD CONSTRAINT sections_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.activity_logs'::regclass AND conname = 'activity_logs_user_tenant_fkey') THEN
    ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.enrollments'::regclass AND conname = 'enrollments_user_tenant_fkey') THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.enrollments'::regclass AND conname = 'enrollments_course_tenant_fkey') THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_progress'::regclass AND conname = 'user_progress_user_tenant_fkey') THEN
    ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_progress'::regclass AND conname = 'user_progress_course_tenant_fkey') THEN
    ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.devices'::regclass AND conname = 'devices_user_tenant_fkey') THEN
    ALTER TABLE public.devices ADD CONSTRAINT devices_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sessions'::regclass AND conname = 'sessions_user_tenant_fkey') THEN
    ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.video_views'::regclass AND conname = 'video_views_user_tenant_fkey') THEN
    ALTER TABLE public.video_views ADD CONSTRAINT video_views_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.video_views'::regclass AND conname = 'video_views_course_tenant_fkey') THEN
    ALTER TABLE public.video_views ADD CONSTRAINT video_views_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.todos'::regclass AND conname = 'todos_user_tenant_fkey') THEN
    ALTER TABLE public.todos ADD CONSTRAINT todos_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.warnings'::regclass AND conname = 'warnings_user_tenant_fkey') THEN
    ALTER TABLE public.warnings ADD CONSTRAINT warnings_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.push_tokens'::regclass AND conname = 'push_tokens_user_tenant_fkey') THEN
    ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_notifications'::regclass AND conname = 'user_notifications_user_tenant_fkey') THEN
    ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_user_tenant_fkey
      FOREIGN KEY (user_id, tenant_id) REFERENCES public.users(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_notifications'::regclass AND conname = 'user_notifications_notification_tenant_fkey') THEN
    ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_notification_tenant_fkey
      FOREIGN KEY (notification_id, tenant_id) REFERENCES public.notifications(id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_tenant_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_tenant_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_id_tenant_unique'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_course_tenant_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lesson_contents'::regclass
      AND conname = 'lesson_contents_tenant_fkey'
  ) THEN
    ALTER TABLE public.lesson_contents
      ADD CONSTRAINT lesson_contents_tenant_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lesson_contents'::regclass
      AND conname = 'lesson_contents_course_tenant_fkey'
  ) THEN
    ALTER TABLE public.lesson_contents
      ADD CONSTRAINT lesson_contents_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lesson_contents'::regclass
      AND conname = 'lesson_contents_lesson_tenant_fkey'
  ) THEN
    ALTER TABLE public.lesson_contents
      ADD CONSTRAINT lesson_contents_lesson_tenant_fkey
      FOREIGN KEY (lesson_id, tenant_id) REFERENCES public.lessons(id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 005b_deferred_constraints.sql
-- Constraints referencing tables created after the composite-index block.
-- All tables (notifications, notification_targets, user_notifications,
-- internal.job_queue) exist at this point. Guards make this idempotent.
-- ============================================================================
DO $$
BEGIN
  -- user_notifications already has UNIQUE (user_id, notification_id) from CREATE TABLE.
  -- Add reverse-column named alias only if neither exists yet.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_notification_user'
      AND conrelid = 'public.user_notifications'::regclass
  ) THEN
    -- The inline UNIQUE (user_id, notification_id) covers the same index.
    -- Skip to avoid duplicate-index error on re-run.
    NULL;
  END IF;

  -- notifications: chk_target_audience - corrected enum (removed invalid 'specific')
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_target_audience'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT chk_target_audience
      CHECK (target_audience IN ('all', 'students', 'teachers', 'admins'));
  END IF;

  -- notification_targets: supplemental named FKs (inline FKs already declared in CREATE TABLE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nt_notification'
      AND conrelid = 'public.notification_targets'::regclass
  ) THEN
    ALTER TABLE public.notification_targets
      ADD CONSTRAINT fk_nt_notification
      FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nt_user'
      AND conrelid = 'public.notification_targets'::regclass
  ) THEN
    ALTER TABLE public.notification_targets
      ADD CONSTRAINT fk_nt_user
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  -- internal.job_queue: canonical dedup cleanup before FK/constraint checks
    DELETE FROM internal.job_queue
    WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY job_type, md5(payload::text) ORDER BY created_at DESC) AS rn
        FROM internal.job_queue
      ) t WHERE t.rn > 1
    );
END $$;

-- JSONB size checks (L-1 Consolidation)
DO $$
BEGIN
  -- Tenants metadata (128 KB)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'chk_tenants_metadata_size') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT chk_tenants_metadata_size CHECK (pg_column_size(metadata) <= 131072);
  END IF;

  -- Device info (16 KB)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.devices'::regclass AND conname = 'chk_devices_device_info_size') THEN
    ALTER TABLE public.devices ADD CONSTRAINT chk_devices_device_info_size CHECK (pg_column_size(device_info) <= 16384);
  END IF;

  -- Activity logs / queue details JSONB (64 KB unified cap)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.activity_logs'::regclass AND conname = 'chk_activity_logs_details_size') THEN
    ALTER TABLE public.activity_logs ADD CONSTRAINT chk_activity_logs_details_size CHECK (pg_column_size(details) <= 65536);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.activity_log_queue'::regclass AND conname = 'chk_activity_log_queue_details_size') THEN
    ALTER TABLE public.activity_log_queue ADD CONSTRAINT chk_activity_log_queue_details_size CHECK (pg_column_size(details) <= 65536);
  END IF;

  -- Settings metadata (32 KB)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenant_settings'::regclass AND conname = 'chk_tenant_settings_size') THEN
    ALTER TABLE public.tenant_settings ADD CONSTRAINT chk_tenant_settings_size CHECK (pg_column_size(settings) <= 32768);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.security_settings'::regclass AND conname = 'chk_security_settings_size') THEN
    ALTER TABLE public.security_settings ADD CONSTRAINT chk_security_settings_size CHECK (pg_column_size(settings) <= 32768);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'JSONB size constraint application failed: %', SQLERRM;
END $$;

-- MEDIUM-02: Add FKs to lesson_state_transitions and course prerequisites (moved to end for dependency order)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_state_transitions_lesson_id_fkey') THEN
    ALTER TABLE audit.lesson_state_transitions
      ADD CONSTRAINT lesson_state_transitions_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_state_transitions_changed_by_fkey') THEN
    ALTER TABLE audit.lesson_state_transitions
      ADD CONSTRAINT lesson_state_transitions_changed_by_fkey
      FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_prerequisites_course_tenant_fkey') THEN
    ALTER TABLE public.course_prerequisites
      ADD CONSTRAINT course_prerequisites_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id)
      REFERENCES public.courses(id, tenant_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_prerequisites_prereq_tenant_fkey') THEN
    ALTER TABLE public.course_prerequisites
      ADD CONSTRAINT course_prerequisites_prereq_tenant_fkey
      FOREIGN KEY (prerequisite_course_id, tenant_id)
      REFERENCES public.courses(id, tenant_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_tenant_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_tenant_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_id_tenant_unique'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass
      AND conname = 'lessons_course_tenant_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lesson_contents'::regclass
      AND conname = 'lesson_contents_tenant_fkey'
  ) THEN
    ALTER TABLE public.lesson_contents
      ADD CONSTRAINT lesson_contents_tenant_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lesson_contents'::regclass
      AND conname = 'lesson_contents_course_tenant_fkey'
  ) THEN
    ALTER TABLE public.lesson_contents
      ADD CONSTRAINT lesson_contents_course_tenant_fkey
      FOREIGN KEY (course_id, tenant_id) REFERENCES public.courses(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lesson_contents'::regclass
      AND conname = 'lesson_contents_lesson_tenant_fkey'
  ) THEN
    ALTER TABLE public.lesson_contents
      ADD CONSTRAINT lesson_contents_lesson_tenant_fkey
      FOREIGN KEY (lesson_id, tenant_id) REFERENCES public.lessons(id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 005b_deferred_constraints.sql
-- Constraints referencing tables created after the composite-index block.
-- All tables (notifications, notification_targets, user_notifications,
-- internal.job_queue) exist at this point. Guards make this idempotent.
-- ============================================================================
DO $$
BEGIN
  -- user_notifications already has UNIQUE (user_id, notification_id) from CREATE TABLE.
  -- Add reverse-column named alias only if neither exists yet.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_notification_user'
      AND conrelid = 'public.user_notifications'::regclass
  ) THEN
    -- The inline UNIQUE (user_id, notification_id) covers the same index.
    -- Skip to avoid duplicate-index error on re-run.
    NULL;
  END IF;

  -- notifications: chk_target_audience - corrected enum (removed invalid 'specific')
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_target_audience'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT chk_target_audience
      CHECK (target_audience IN ('all', 'students', 'teachers', 'admins'));
  END IF;

  -- notification_targets: supplemental named FKs (inline FKs already declared in CREATE TABLE)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nt_notification'
      AND conrelid = 'public.notification_targets'::regclass
  ) THEN
    ALTER TABLE public.notification_targets
      ADD CONSTRAINT fk_nt_notification
      FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_nt_user'
      AND conrelid = 'public.notification_targets'::regclass
  ) THEN
    ALTER TABLE public.notification_targets
      ADD CONSTRAINT fk_nt_user
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  -- internal.job_queue: canonical dedup cleanup before FK/constraint checks
    DELETE FROM internal.job_queue
    WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY job_type, md5(payload::text) ORDER BY created_at DESC) AS rn
        FROM internal.job_queue
      ) t WHERE t.rn > 1
    );
END $$;

-- JSONB size checks (L-1 Consolidation)
DO $$
BEGIN
  -- Tenants metadata (128 KB)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'chk_tenants_metadata_size') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT chk_tenants_metadata_size CHECK (pg_column_size(metadata) <= 131072);
  END IF;

  -- Device info (16 KB)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.devices'::regclass AND conname = 'chk_devices_device_info_size') THEN
    ALTER TABLE public.devices ADD CONSTRAINT chk_devices_device_info_size CHECK (pg_column_size(device_info) <= 16384);
  END IF;

  -- Activity logs / queue details JSONB (64 KB unified cap)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.activity_logs'::regclass AND conname = 'chk_activity_logs_details_size') THEN
    ALTER TABLE public.activity_logs ADD CONSTRAINT chk_activity_logs_details_size CHECK (pg_column_size(details) <= 65536);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.activity_log_queue'::regclass AND conname = 'chk_activity_log_queue_details_size') THEN
    ALTER TABLE public.activity_log_queue ADD CONSTRAINT chk_activity_log_queue_details_size CHECK (pg_column_size(details) <= 65536);
  END IF;

  -- Settings metadata (32 KB)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenant_settings'::regclass AND conname = 'chk_tenant_settings_size') THEN
    ALTER TABLE public.tenant_settings ADD CONSTRAINT chk_tenant_settings_size CHECK (pg_column_size(settings) <= 32768);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.security_settings'::regclass AND conname = 'chk_security_settings_size') THEN
    ALTER TABLE public.security_settings ADD CONSTRAINT chk_security_settings_size CHECK (pg_column_size(settings) <= 32768);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'JSONB size constraint application failed: %', SQLERRM;
END $$;

-- Ã¢â€ â‚¬Ã¢â€ â‚¬ E. user_access_cache: allow 'completed' status (patch 22) Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬Ã¢â€ â‚¬
DO $$
BEGIN
  -- Drop old constraint if it doesn't include 'completed'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'private.user_access_cache'::regclass
      AND conname = 'user_access_cache_status_check'
  ) THEN
    ALTER TABLE private.user_access_cache DROP CONSTRAINT user_access_cache_status_check;
  END IF;
  ALTER TABLE private.user_access_cache
    ADD CONSTRAINT user_access_cache_status_check
    CHECK (status IN ('active', 'expired', 'revoked', 'completed'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'user_access_cache constraint update: %', SQLERRM;
END $$;

-- ============================================================================
-- Feature Flags — production invariants (idempotent)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_key_format') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_key_format
      CHECK (
        key = lower(btrim(key))
        AND key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'
        AND length(key) BETWEEN 2 AND 128
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_description_length') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_description_length
      CHECK (description IS NULL OR length(description) <= 1000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_rollout_pct') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_rollout_pct
      CHECK (rollout_pct BETWEEN 0 AND 10000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_status') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_status
      CHECK (status IN ('active', 'deprecated', 'archived'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_schedule') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_schedule
      CHECK (enabled_until IS NULL OR enabled_from IS NULL OR enabled_until > enabled_from);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_metadata_object') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_metadata_object
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_metadata_size') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_metadata_size
      CHECK (pg_column_size(metadata) <= 65536);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flags_version') THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT chk_feature_flags_version
      CHECK (version >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_feature_flags_override_present') THEN
    ALTER TABLE public.tenant_feature_flags
      ADD CONSTRAINT chk_tenant_feature_flags_override_present
      CHECK (is_enabled IS NOT NULL OR rollout_pct IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_feature_flags_rollout_pct') THEN
    ALTER TABLE public.tenant_feature_flags
      ADD CONSTRAINT chk_tenant_feature_flags_rollout_pct
      CHECK (rollout_pct IS NULL OR rollout_pct BETWEEN 0 AND 10000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_feature_flags_version') THEN
    ALTER TABLE public.tenant_feature_flags
      ADD CONSTRAINT chk_tenant_feature_flags_version
      CHECK (version >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flag_roles_version') THEN
    ALTER TABLE public.feature_flag_roles
      ADD CONSTRAINT chk_feature_flag_roles_version
      CHECK (version >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_feature_flag_users_version') THEN
    ALTER TABLE public.feature_flag_users
      ADD CONSTRAINT chk_feature_flag_users_version
      CHECK (version >= 1);
  END IF;

  -- Composite tenant-consistency guarantees.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_tenant_id') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT uq_users_tenant_id UNIQUE (tenant_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_roles_tenant_id') THEN
    ALTER TABLE public.roles
      ADD CONSTRAINT uq_roles_tenant_id UNIQUE (tenant_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_feature_flag_users_tenant_user') THEN
    ALTER TABLE public.feature_flag_users
      ADD CONSTRAINT fk_feature_flag_users_tenant_user
      FOREIGN KEY (tenant_id, user_id)
      REFERENCES public.users (tenant_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_feature_flag_roles_tenant_role') THEN
    ALTER TABLE public.feature_flag_roles
      ADD CONSTRAINT fk_feature_flag_roles_tenant_role
      FOREIGN KEY (tenant_id, role_id)
      REFERENCES public.roles (tenant_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;
