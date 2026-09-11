import { ConflictError } from '@/domain/errors';

/**
 * Duplicate-seq audit cleanup — planning logic.
 *
 * Extracted out of the route handler (apps/admin/src/app/api/audit/
 * cleanup-duplicate-seqs/route.ts) so it can be unit-tested without a live
 * Supabase project: this module does no I/O, it only decides *what* to
 * delete given rows the caller already fetched.
 *
 * ── Why `seq` alone is not a safe grouping key ──────────────────────────
 * `activity_logs.seq` is assigned by ONE global counter shared by every
 * tenant (public.audit_chain_state is a singleton row, id = 1 — see
 * supabase/schema/07_functions.sql:flush_activity_logs). Under correct
 * operation `seq` never repeats. It can only repeat if audit_chain_state
 * was reset back toward 0 without also clearing activity_logs (the
 * scenario this endpoint exists to clean up after) — and when that
 * happens, the two rows that now share a `seq` value can belong to
 * *any* tenant, entirely independent of one another. Grouping purely by
 * `seq` and picking a "keeper" with a heuristic that isn't anchored to
 * the real chain (the previous implementation used "is this entry_hash
 * referenced as someone's prev_hash", which is *never* true for the
 * current, live tip of the chain — nothing has been appended after it
 * yet) can and did risk deleting a perfectly valid row from an unrelated
 * tenant/chain generation, up to and including the live chain tip itself.
 *
 * ── The fix ──────────────────────────────────────────────────────────
 * The one true, currently active chain is fully determined by
 * `audit_chain_state.last_hash`: walking `prev_hash` pointers backward
 * from that hash reconstructs exactly the set of rows that are part of
 * the live, authoritative chain — regardless of tenant, and regardless
 * of `seq` collisions. Only rows reachable that way are ever treated as
 * "the keeper" of a duplicate-seq group. This is provably safe: it can
 * never remove a row that the chain state itself currently points to.
 */

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

export interface ActivityLogChainRow {
  id: string;
  seq: number;
  tenant_id: string;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string;
}

export interface DuplicateSeqCleanupPlan {
  /** Row ids that are safe to delete. */
  toDelete: string[];
  /** How many rows would remain after applying `toDelete`. */
  keptCount: number;
  /** How many rows are part of the live chain (reachable from the tip). */
  reachableCount: number;
  /**
   * Seq groups where more than one row in the group is part of the live
   * chain — structurally impossible under a single valid hash chain (it
   * means the chain has forked). Nothing is deleted for these groups;
   * they are surfaced for manual review instead of guessed at.
   */
  conflicts: Array<{ seq: number; rowIds: string[] }>;
}

/**
 * Walks `activity_logs` rows backward from `chainTipHash`
 * (`audit_chain_state.last_hash`) and returns the plan of which rows in
 * duplicate-`seq` groups are safe to delete.
 *
 * Fails closed: throws `ConflictError` (409) instead of deleting anything
 * when the stored chain itself cannot be trusted (a cycle, or a tip hash
 * that doesn't match any row) — audit immutability and hash-chain
 * integrity take priority over completing the cleanup.
 */
export function planDuplicateSeqCleanup(
  rows: readonly ActivityLogChainRow[],
  chainTipHash: string,
): DuplicateSeqCleanupPlan {
  const byHash = new Map<string, ActivityLogChainRow>();
  for (const row of rows) {
    if (byHash.has(row.entry_hash)) {
      throw new ConflictError(
        'Audit hash chain is corrupted (duplicate entry_hash); refusing to modify activity_logs.',
        `duplicate entry_hash=${row.entry_hash}`,
      );
    }
    byHash.set(row.entry_hash, row);
  }

  // ── Walk the live chain backward from the authoritative tip ──────────
  const reachable = new Set<string>();
  let cursor: string | null = chainTipHash;
  let steps = 0;
  const maxSteps = rows.length + 1;

  while (cursor && cursor !== AUDIT_GENESIS_HASH) {
    const row = byHash.get(cursor);
    if (!row) {
      if (rows.length > 0) {
        throw new ConflictError(
          'Audit chain state points at a hash not present in activity_logs; refusing to modify activity_logs.',
          `missing entry_hash=${cursor}`,
        );
      }
      break;
    }
    if (reachable.has(row.id)) {
      throw new ConflictError(
        'Audit hash chain is corrupted (cycle detected); refusing to modify activity_logs.',
        `cycle at row id=${row.id}`,
      );
    }
    reachable.add(row.id);
    cursor = row.prev_hash ?? AUDIT_GENESIS_HASH;
    steps += 1;
    if (steps > maxSteps) {
      throw new ConflictError(
        'Audit hash chain walk exceeded the total row count; refusing to modify activity_logs.',
        `steps=${steps} maxSteps=${maxSteps}`,
      );
    }
  }

  // ── Group by seq purely to find candidate duplicate groups ───────────
  // (never used, on its own, to decide *what's valid* — see module doc).
  const bySeq = new Map<number, ActivityLogChainRow[]>();
  for (const row of rows) {
    const bucket = bySeq.get(row.seq);
    if (bucket) bucket.push(row);
    else bySeq.set(row.seq, [row]);
  }

  const toDelete: string[] = [];
  const conflicts: DuplicateSeqCleanupPlan['conflicts'] = [];

  for (const [seq, group] of bySeq) {
    if (group.length <= 1) continue; // no collision — never touched

    const reachableInGroup = group.filter((r) => reachable.has(r.id));

    if (reachableInGroup.length > 1) {
      // Two "live" rows sharing one seq is impossible under a single
      // valid chain — surface it, touch nothing.
      conflicts.push({ seq, rowIds: group.map((r) => r.id) });
      continue;
    }

    const keeperId =
      reachableInGroup.length === 1
        ? // Exactly one row in this group is provably part of the live
          // chain right now — keep it, no matter which tenant it belongs
          // to and no matter its created_at relative to the others.
          reachableInGroup[0]!.id
        : // No row in the group is reachable from the current tip: the
          // whole group is from an abandoned/reset chain generation.
          // Keep the oldest as a historical record rather than deleting
          // the group down to zero rows.
          [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!.id;

    for (const row of group) {
      if (row.id !== keeperId) toDelete.push(row.id);
    }
  }

  return {
    toDelete,
    keptCount: rows.length - toDelete.length,
    reachableCount: reachable.size,
    conflicts,
  };
}
