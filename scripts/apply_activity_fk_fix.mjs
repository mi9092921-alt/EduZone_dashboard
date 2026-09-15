#!/usr/bin/env node
/**
 * One-shot ops fix (2026-09-15): activity_log_queue FK-pair poison that wedged
 * flush_activity_logs() with 23503 (activity_logs_user_tenant_fkey) — every
 * flush batch aborted on the first poisoned (user_id, tenant_id) row.
 *
 * Sequence (Check → Modify → Verify, per agent_prompt_eduzone_db.md):
 *   1. Diagnose (read-only): guard presence + poisoned/pending row counts.
 *   2. Apply the canonical supabase/schema/07_functions.sql (single atomic
 *      file — the same file deploy_schema_remote_atomic.mjs applies; if the
 *      full file fails on unrelated drift, fall back to the single canonical
 *      function block extracted from that same file — no hand-written SQL).
 *   3. NOTIFY pgrst, 'reload schema'.
 *   4. Apply scripts/sql/2026-09-15_activity_log_queue_fk_pair_repair.sql
 *      (transactional, idempotent).
 *   5. Trigger public.flush_activity_logs(1000) with the service_role claim
 *      GUC — the exact mechanism PostgREST uses (mirrors the local harness
 *      setServiceRole pattern).
 *   6. Final verification counts (queue + chain + FK validity).
 *
 * Env: DATABASE_URL / SUPABASE_DB_URL — resolved from the process env or
 * scripts/.env.deploy (mirrors lib/db.mjs loadEnvLocal). Never printed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FUNCTIONS_SQL = join(ROOT, 'supabase', 'schema', '07_functions.sql');
const REPAIR_SQL = join(__dirname, 'sql', '2026-09-15_activity_log_queue_fk_pair_repair.sql');

/** The project the dashboard actually runs against (apps/admin/.env.local). */
function readTargetRef() {
  const envLocal = join(ROOT, 'apps', 'admin', '.env.local');
  if (!existsSync(envLocal)) return null;
  for (const line of readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+?)\s*$/);
    if (m) {
      const ref = m[1].trim().replace(/^["']|["']$/g, '').match(/([a-z0-9]{20})\.supabase\.co/i);
      if (ref) return ref[1].toLowerCase();
    }
  }
  return null;
}

/** URL points at the target project? (username `postgres.<ref>` or host `<ref>…`) */
function urlTargetsRef(url, ref) {
  try {
    const u = new URL(url);
    return !ref || u.username.includes(ref) || u.hostname.includes(ref);
  } catch {
    return false;
  }
}

function loadDbUrl() {
  const targetRef = readTargetRef();
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
    const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!urlTargetsRef(url, targetRef)) {
      console.error(`✖ process-env DATABASE_URL targets a DIFFERENT project than the dashboard ref (${targetRef ?? 'unknown'}) — refusing`);
      process.exit(2);
    }
    return 'process env';
  }
  // supabase/db_url.txt (git-ignored) holds the pooler URL for the dashboard's
  // project — the URL may sit mid-line (notes file), so scan, not anchor.
  const dbUrlTxt = join(ROOT, 'supabase', 'db_url.txt');
  if (existsSync(dbUrlTxt)) {
    for (const line of readFileSync(dbUrlTxt, 'utf8').split(/\r?\n/)) {
      const idx = line.search(/postgres(ql)?:\/\//);
      if (idx === -1) continue;
      const candidate = line.slice(idx).trim().replace(/^["']|["']$/g, '');
      if (urlTargetsRef(candidate, targetRef)) {
        process.env.DATABASE_URL = candidate;
        return `supabase/db_url.txt (matched ref ${targetRef})`;
      }
    }
  }
  const envPath = join(__dirname, '.env.deploy');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(DATABASE_URL|SUPABASE_DB_URL)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && urlTargetsRef(v, targetRef)) { process.env[m[1]] = v; return 'scripts/.env.deploy'; }
    }
  }
  console.error(`✖ no DATABASE_URL found for the dashboard project ref (${targetRef ?? 'unknown'}) — refusing to touch a different project`);
  process.exit(2);
}
const urlSource = loadDbUrl();
console.log('[0] connection source:', urlSource);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (text) => client.query(text);

const DIAG_SQL = `
  SELECT
    (SELECT count(*)::int FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'internal' AND p.proname = 'log_activity_internal'
        AND p.prosrc LIKE '%FK PAIR GUARD%')                              AS guard_applied,
    (SELECT count(*)::int FROM public.activity_log_queue
      WHERE flushed_at IS NULL)                                           AS pending_flush,
    (SELECT count(*)::int FROM public.activity_log_queue q
      WHERE q.flushed_at IS NULL AND q.user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.users u
                         WHERE u.id = q.user_id AND u.tenant_id = q.tenant_id)) AS mismatched_pairs,
    (SELECT count(*)::int FROM public.activity_log_queue q
      WHERE q.flushed_at IS NULL AND q.user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = q.user_id))  AS missing_actors
`;

// ── 1. Diagnose (read-only) ─────────────────────────────────────────────
const diag = (await q(DIAG_SQL)).rows[0];
console.log('[1] diagnose:', JSON.stringify(diag));

// ── 2. Apply the canonical 07_functions.sql ─────────────────────────────
if (diag.guard_applied === 0) {
  try {
    await q(readFileSync(FUNCTIONS_SQL, 'utf8'));
    console.log('[2] applied supabase/schema/07_functions.sql (single atomic file)');
  } catch (err) {
    console.error('[2] full file failed on remote drift:', err.message.split('\n')[0]);
    // Fallback: the single canonical function block, extracted verbatim from
    // the same canonical file (no hand-written SQL, no second schema source).
    const src = readFileSync(FUNCTIONS_SQL, 'utf8');
    const start = src.indexOf('CREATE OR REPLACE FUNCTION internal.log_activity_internal(');
    const end = src.indexOf('$$;', start);
    if (start === -1 || end === -1) {
      console.error('✖ could not locate the canonical function block — aborting');
      process.exit(1);
    }
    await q(src.slice(start, end + 4));
    console.log('[2] applied the single canonical function block instead');
  }
} else {
  console.log('[2] guard already present — skipping 07_functions.sql');
}

// ── 3. PostgREST reload ─────────────────────────────────────────────────
await q("NOTIFY pgrst, 'reload schema'");
console.log('[3] NOTIFY pgrst sent');

// ── 4. Repair the poisoned backlog ──────────────────────────────────────
await q(readFileSync(REPAIR_SQL, 'utf8'));
console.log('[4] repair SQL applied (transactional, idempotent)');

// ── 5. Flush the queue (service_role claim — PostgREST mechanism) ───────
await q("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
const flushed = (await q('SELECT public.flush_activity_logs(1000) AS n')).rows[0].n;
console.log('[5] flush_activity_logs flushed:', flushed);

// ── 6. Final verification ───────────────────────────────────────────────
const after = (await q(DIAG_SQL)).rows[0];
const chain = (await q('SELECT last_seq, last_hash FROM public.audit_chain_state WHERE id = 1')).rows[0];
const fkInvalid = (await q(`
  SELECT count(*)::int AS n FROM public.activity_logs l
  WHERE l.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u
                     WHERE u.id = l.user_id AND u.tenant_id = l.tenant_id)`)).rows[0].n;
console.log('[6] after:', JSON.stringify(after));
console.log('[6] chain:', JSON.stringify(chain), '| fk_invalid_activity_logs:', fkInvalid);

await client.end();

if (Number(after.mismatched_pairs) !== 0 || Number(after.missing_actors) !== 0) {
  console.error('✖ unflushed poisoned rows remain — inspect counts above');
  process.exit(1);
}
if (Number(after.pending_flush) !== 0) {
  console.error('⚠ queue not fully drained (pending_flush > 0)');
  process.exit(1);
}
console.log('✅ remote fix verified: guard applied, backlog repaired, queue drained, chain advanced');
