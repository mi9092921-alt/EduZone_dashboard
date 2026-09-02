import { NextResponse } from 'next/server';

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
 * Strategy: for each duplicate seq group, keep the row whose entry_hash is
 * referenced as prev_hash by some other row (i.e. it is part of a chain that
 * continues forward).  If no such row exists, keep the one with the smallest
 * created_at.  Delete all others.
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

    // ── Fetch all rows that share a seq with at least one other row ──
    const { data: allLogs, error: fetchErr } = await admin
      .from('activity_logs')
      .select('id, seq, prev_hash, entry_hash, created_at')
      .order('seq', { ascending: true })
      .order('created_at', { ascending: true });

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    // Group by seq
    const bySeq = new Map<number, typeof allLogs>();
    for (const row of allLogs ?? []) {
      const bucket = bySeq.get(row.seq);
      if (bucket) {
        bucket.push(row);
      } else {
        bySeq.set(row.seq, [row]);
      }
    }

    // Build set of entry_hashes referenced as prev_hash by some other row
    const referencedAsParent = new Set((allLogs ?? []).map((r) => r.prev_hash).filter(Boolean));

    const toDelete: string[] = [];

    for (const [, rows] of bySeq) {
      if (rows.length <= 1) continue; // no duplicates for this seq

      // Keep the row whose entry_hash is used as prev_hash by a later entry
      // (i.e. it is part of the chain that continues).  Fall back to oldest.
      const keeper = rows.find((r) => referencedAsParent.has(r.entry_hash)) ?? rows[0]!; // already sorted by created_at ASC

      for (const row of rows) {
        if (row.id !== keeper.id) {
          toDelete.push(row.id);
        }
      }
    }

    if (toDelete.length === 0) {
      return NextResponse.json({ deleted: 0, message: 'No duplicate seq entries found' });
    }

    // Delete in batches of 100
    let deleted = 0;
    const BATCH = 100;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      const { error: delErr } = await admin.from('activity_logs').delete().in('id', batch);

      if (delErr) {
        return NextResponse.json({ error: delErr.message, deleted }, { status: 500 });
      }
      deleted += batch.length;
    }

    return NextResponse.json({
      deleted,
      message: `Removed ${deleted} orphaned duplicate-seq entries from activity_logs`,
    });
  } catch (err) {
    console.error('[cleanup-duplicate-seqs] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
