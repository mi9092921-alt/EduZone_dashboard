-- ============================================================================
-- One-off operational repair (2026-09-15) — activity_log_queue FK pair poison
-- ============================================================================
--
-- Symptom:
--   POST /rest/v1/rpc/flush_activity_logs → 409 (Conflict), PG 23503:
--   'insert or update on table "activity_logs_2026" violates foreign key
--   constraint "activity_logs_user_tenant_fkey" ... is not present in table
--   "users"'.
--
-- Root cause:
--   SupabaseAuditLogger used to pass a switched super_admin's *acting*
--   tenant (ctx.tenantId) as the service_role tenant override to
--   log_activity_async. internal.log_activity_internal() honored it, so the
--   queue received (actor_id, acting_tenant_id) pairs that do not exist in
--   users(id, tenant_id). The queue's simple FKs accept such rows; the
--   composite FK on activity_logs rejects them — and because
--   flush_activity_logs() is a single transaction, EVERY batch aborted on
--   the first poisoned row, wedging the whole audit pipeline.
--
-- Safety of repairing rows in the queue:
--   * A poisoned row can never have been flushed already (the flush aborts
--     atomically on it), hence the flushed_at IS NULL scope below.
--   * The tamper-evident hash chain is computed AT FLUSH TIME from the final
--     row values (flush_activity_logs), never at enqueue time — repairing
--     tenant attribution before the flush cannot break the chain.
--   * The pipeline now self-heals new rows at enqueue time (FK PAIR GUARD in
--     internal.log_activity_internal, 07_functions.sql); this script only
--     clears the backlog created before that fix. Re-running is a no-op.
--
-- Run against the project DB (psql / scripts/exec_sql.mjs pattern), then
-- trigger a flush from the Audit page (or wait for the cron flush).

BEGIN;

-- ── Before: how many unflushed rows are poisoned, and how ────────────────
SELECT
  count(*) FILTER (
    WHERE q.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = q.user_id AND u.tenant_id = q.tenant_id
      )
  )                        AS mismatched_pairs,
  count(*) FILTER (
    WHERE q.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = q.user_id)
  )                        AS missing_actors
FROM public.activity_log_queue q
WHERE q.flushed_at IS NULL;

-- ── Repair 1: actor exists but tenant pair is invalid ────────────────────
-- Re-attribute the entry to the actor's real home tenant (the same outcome
-- the fixed pipeline now produces at enqueue time).
UPDATE public.activity_log_queue q
SET tenant_id = u.tenant_id
FROM public.users u
WHERE q.flushed_at IS NULL
  AND q.user_id = u.id
  AND NOT EXISTS (
    SELECT 1 FROM public.users u2
    WHERE u2.id = q.user_id AND u2.tenant_id = q.tenant_id
  );

-- ── Repair 2: actor row no longer exists in public.users ─────────────────
-- Drop attribution (NULL user_id) and bucket under the system tenant — the
-- same (NULL, system) shape ON DELETE SET NULL + MATCH SIMPLE accepts, and
-- which flush_activity_logs already hashes as 'system'. Skipped when the
-- system tenant row itself is absent (those rows stay unflushed and are
-- reported below rather than silently rewritten).
UPDATE public.activity_log_queue q
SET user_id = NULL,
    tenant_id = public.system_tenant_id(),
    details = q.details || jsonb_build_object('audit_actor_unresolved', q.user_id)
WHERE q.flushed_at IS NULL
  AND q.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = q.user_id)
  AND EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = public.system_tenant_id()
  );

-- ── Verify: must return 0 rows before COMMIT ─────────────────────────────
SELECT q.id, q.user_id, q.tenant_id, q.activity_type, q.created_at
FROM public.activity_log_queue q
WHERE q.flushed_at IS NULL
  AND q.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = q.user_id AND u.tenant_id = q.tenant_id
  );

COMMIT;