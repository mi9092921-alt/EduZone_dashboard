import { describe, expect, it } from 'vitest';

import {
  AUDIT_GENESIS_HASH,
  planDuplicateSeqCleanup,
  type ActivityLogChainRow,
} from './duplicate-seq-cleanup';

import { ConflictError } from '@/domain/errors';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function row(partial: Partial<ActivityLogChainRow> & Pick<ActivityLogChainRow, 'id'>): ActivityLogChainRow {
  return {
    seq: 1,
    tenant_id: TENANT_A,
    prev_hash: AUDIT_GENESIS_HASH,
    entry_hash: `hash-${partial.id}`,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('planDuplicateSeqCleanup', () => {
  it('touches nothing when every seq is unique, even across tenants', () => {
    const rows: ActivityLogChainRow[] = [
      row({ id: 'a1', seq: 1, tenant_id: TENANT_A, prev_hash: AUDIT_GENESIS_HASH, entry_hash: 'h1' }),
      row({ id: 'a2', seq: 2, tenant_id: TENANT_A, prev_hash: 'h1', entry_hash: 'h2' }),
      row({ id: 'b1', seq: 3, tenant_id: TENANT_B, prev_hash: 'h2', entry_hash: 'h3' }),
    ];

    const plan = planDuplicateSeqCleanup(rows, 'h3');

    expect(plan.toDelete).toEqual([]);
    expect(plan.keptCount).toBe(3);
    expect(plan.reachableCount).toBe(3);
    expect(plan.conflicts).toEqual([]);
  });

  it('never deletes the row reachable from the live chain tip, even when an older duplicate belongs to a different tenant', () => {
    // Regression test for the original bug: the old implementation kept
    // whichever row in a duplicate-seq group was "referenced as prev_hash
    // by another row" -- which is *never* true for the current chain tip,
    // since nothing has been appended after it yet. Its fallback then
    // picked the row with the smallest created_at, which is exactly the
    // *old*, abandoned-generation row -- so the live, valid row (here,
    // belonging to a different tenant than the stale duplicate) would
    // have been deleted, corrupting the chain and destroying a valid
    // cross-tenant audit record in the process.
    const staleOrphan = row({
      id: 'stale-tenant-a',
      seq: 1,
      tenant_id: TENANT_A,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'stale-hash',
      created_at: '2026-01-01T00:00:00.000Z', // oldest -- would win under the old heuristic
    });
    const liveTip = row({
      id: 'live-tenant-b',
      seq: 1, // collides with staleOrphan purely because audit_chain_state was reset
      tenant_id: TENANT_B,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'live-hash',
      created_at: '2026-02-01T00:00:00.000Z',
    });

    const plan = planDuplicateSeqCleanup([staleOrphan, liveTip], 'live-hash');

    expect(plan.toDelete).toEqual(['stale-tenant-a']);
    expect(plan.toDelete).not.toContain('live-tenant-b');
    expect(plan.reachableCount).toBe(1);
    expect(plan.conflicts).toEqual([]);
  });

  it('keeps the oldest row when neither side of a duplicate-seq group is part of the live chain', () => {
    const orphanA = row({
      id: 'orphan-a',
      seq: 7,
      tenant_id: TENANT_A,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'oa',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const orphanB = row({
      id: 'orphan-b',
      seq: 7,
      tenant_id: TENANT_B,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'ob',
      created_at: '2026-01-02T00:00:00.000Z',
    });
    // The live chain is a single, unrelated row -- neither orphan is on it.
    const liveTip = row({
      id: 'live',
      seq: 99,
      tenant_id: TENANT_A,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'live',
      created_at: '2026-03-01T00:00:00.000Z',
    });

    const plan = planDuplicateSeqCleanup([orphanA, orphanB, liveTip], 'live');

    // Exactly one of the orphaned duplicates is kept (the older one) --
    // the group is never wiped down to zero rows.
    expect(plan.toDelete).toEqual(['orphan-b']);
    expect(plan.keptCount).toBe(2);
  });

  it('never deletes a non-colliding row, even if it is not on the live chain (out of this endpoint\'s scope)', () => {
    const uniqueOrphan = row({
      id: 'unique-orphan',
      seq: 42,
      tenant_id: TENANT_B,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'uo',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const liveTip = row({
      id: 'live',
      seq: 1,
      tenant_id: TENANT_A,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: 'live',
      created_at: '2026-02-01T00:00:00.000Z',
    });

    const plan = planDuplicateSeqCleanup([uniqueOrphan, liveTip], 'live');

    expect(plan.toDelete).toEqual([]);
  });

  it('reports a conflict instead of deleting when two live rows share a seq (chain fork)', () => {
    // A genuine, in-chain seq collision (e.g. a race that bypassed the
    // advisory lock) -- both rows are reachable from the tip via a single
    // linear walk, so this can never be resolved by "which one is live".
    const r1 = row({ id: 'r1', seq: 5, entry_hash: 'r1', prev_hash: AUDIT_GENESIS_HASH });
    const r2 = row({ id: 'r2', seq: 5, entry_hash: 'r2', prev_hash: 'r1' });
    const r3 = row({ id: 'r3', seq: 6, entry_hash: 'r3', prev_hash: 'r2' });

    const plan = planDuplicateSeqCleanup([r1, r2, r3], 'r3');

    expect(plan.toDelete).toEqual([]);
    expect(plan.conflicts).toEqual([{ seq: 5, rowIds: ['r1', 'r2'] }]);
  });

  it('fails closed when the chain tip hash is not present in the fetched rows', () => {
    const rows = [row({ id: 'a', entry_hash: 'ha', prev_hash: AUDIT_GENESIS_HASH })];

    expect(() => planDuplicateSeqCleanup(rows, 'does-not-exist')).toThrow(ConflictError);
  });

  it('fails closed on a cyclic hash chain instead of guessing', () => {
    const a = row({ id: 'a', entry_hash: 'ha', prev_hash: 'hb' });
    const b = row({ id: 'b', entry_hash: 'hb', prev_hash: 'ha' });

    expect(() => planDuplicateSeqCleanup([a, b], 'ha')).toThrow(ConflictError);
  });

  it('fails closed on a duplicate entry_hash instead of guessing', () => {
    const a = row({ id: 'a', entry_hash: 'dup', prev_hash: AUDIT_GENESIS_HASH });
    const b = row({ id: 'b', entry_hash: 'dup', prev_hash: AUDIT_GENESIS_HASH });

    expect(() => planDuplicateSeqCleanup([a, b], 'dup')).toThrow(ConflictError);
  });

  it('is a no-op on an empty table with a genesis tip', () => {
    const plan = planDuplicateSeqCleanup([], AUDIT_GENESIS_HASH);

    expect(plan).toEqual({ toDelete: [], keptCount: 0, reachableCount: 0, conflicts: [] });
  });

  it('treats every row as unreachable when the chain state was reset to genesis but rows remain', () => {
    // Mirrors the exact bug scenario in the route's docstring: someone
    // reset audit_chain_state back toward genesis without clearing
    // activity_logs. Nothing is reachable from a genesis tip, so any
    // colliding-seq group falls back to "keep the oldest" and unique-seq
    // rows are left untouched.
    const rows: ActivityLogChainRow[] = [
      row({ id: 'x1', seq: 1, entry_hash: 'x1', prev_hash: AUDIT_GENESIS_HASH, created_at: '2026-01-01T00:00:00.000Z' }),
      row({ id: 'x2', seq: 1, entry_hash: 'x2', prev_hash: 'x1', created_at: '2026-01-02T00:00:00.000Z' }),
    ];

    const plan = planDuplicateSeqCleanup(rows, AUDIT_GENESIS_HASH);

    expect(plan.reachableCount).toBe(0);
    expect(plan.toDelete).toEqual(['x2']);
  });
});
