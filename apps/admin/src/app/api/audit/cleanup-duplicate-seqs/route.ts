import { NextResponse } from 'next/server';

import {
  planDuplicateSeqCleanup,
  type ActivityLogChainRow,
} from '@/domain/audit/duplicate-seq-cleanup';
import { ConflictError } from '@/domain/errors';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * POST /api/audit/cleanup-duplicate-seqs
 *
 * Deletes orphaned activity_log rows that share a seq value with at least one
 * other row. This situation arises when flush_activity_logs is called multiple
 * times with a reset audit_chain_state (each run restarts from seq=1).
 *
 * The prevent_audit_mutation trigger normally blocks all deletions.  A narrow
 * exception was added: service_role may delete a row only when another row
 * with the same seq already exists, making this a safe, idempotent cleanup.
 *
 * `seq` is assigned by ONE global counter shared by every tenant
 * (audit_chain_state is a singleton row), so a duplicate-seq group can
 * legitimately contain rows from different tenants and different chain
 * generations — a bare seq match is never enough, on its own, to decide
 * which row is safe to delete. The actual decision is delegated to
 * `planDuplicateSeqCleanup` (see domain/audit/duplicate-seq-cleanup.ts),
 * which walks the real hash chain backward from audit_chain_state.last_hash
 * and only ever discards rows that are provably *not* part of the live
 * chain — regardless of tenant, and regardless of `seq`. See that module
 * for the full rationale.
 *
 * Requires: super_admin role.
 */
export async function POST() {
  try {
    // ── Auth check ────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profErr } = await supabase
      .from('users')
      .select('primary_role')
      .eq('id', userData.user.id)
      .is('deleted_at', null)
      .single();

    if (profErr || !profile || profile.primary_role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: super_admin only' }, { status: 403 });
    }

    // ── Admin client (service_role bypasses RLS; trigger allows duplicate deletes) ──
    const admin = createAdminClient();

    // ── Fetch the authoritative chain tip ─────────────────────
    // This is the trust anchor for the whole operation: only rows
    // reachable backward from this hash are ever treated as "live".
    const { data: chainState, error: chainErr } = await admin
      .from('audit_chain_state')
      .select('last_hash')
      .eq('id', 1)
      .maybeSingle();

    if (chainErr || !chainState) {
      console.error('[cleanup-duplicate-seqs] failed to read audit_chain_state:', chainErr);
      return NextResponse.json({ error: 'Failed to read audit chain state' }, { status: 500 });
    }

    // ── Fetch every row (tenant_id included — see module doc: a
    // duplicate-seq group can legitimately span tenants) ─────────
    const { data: allLogs, error: fetchErr } = await admin
      .from('activity_logs')
      .select('id, seq, tenant_id, prev_hash, entry_hash, created_at')
      .order('created_at', { ascending: true });

    if (fetchErr) {
      // M10: log raw DB error server-side, return a generic message — the
      // PostgREST text can contain schema/column/function details.
      console.error('[cleanup-duplicate-seqs] fetch failed:', fetchErr);
      return NextResponse.json({ error: 'Failed to scan audit logs' }, { status: 500 });
    }

    let plan;
    try {
      plan = planDuplicateSeqCleanup(
        (allLogs ?? []) as ActivityLogChainRow[],
        chainState.last_hash as string,
      );
    } catch (err) {
      if (err instanceof ConflictError) {
        // Fail closed: never delete anything when the stored chain itself
        // can't be trusted. Audit immutability takes priority over
        // completing the cleanup.
        console.error('[cleanup-duplicate-seqs] refusing to modify a corrupted chain:', err.detail);
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    if (plan.conflicts.length > 0) {
      console.error(
        '[cleanup-duplicate-seqs] skipped seq groups where the chain appears forked:',
        plan.conflicts,
      );
    }

    if (plan.toDelete.length === 0) {
      return NextResponse.json({
        deleted: 0,
        message:
          plan.conflicts.length > 0
            ? `No safe deletions; ${plan.conflicts.length} seq group(s) look forked and were left untouched`
            : 'No duplicate seq entries found',
        conflicts: plan.conflicts.length > 0 ? plan.conflicts : undefined,
      });
    }

    // Delete in batches of 100
    let deleted = 0;
    const BATCH = 100;
    for (let i = 0; i < plan.toDelete.length; i += BATCH) {
      const batch = plan.toDelete.slice(i, i + BATCH);
      const { error: delErr } = await admin.from('activity_logs').delete().in('id', batch);

      if (delErr) {
        // M10: same masking policy as the fetch error above.
        console.error('[cleanup-duplicate-seqs] delete failed:', delErr);
        return NextResponse.json(
          { error: 'Failed to remove duplicate entries', deleted },
          { status: 500 },
        );
      }
      deleted += batch.length;
    }

    return NextResponse.json({
      deleted,
      message: `Removed ${deleted} orphaned duplicate-seq entries from activity_logs`,
      conflicts: plan.conflicts.length > 0 ? plan.conflicts : undefined,
    });
  } catch (err) {
    console.error('[cleanup-duplicate-seqs] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
