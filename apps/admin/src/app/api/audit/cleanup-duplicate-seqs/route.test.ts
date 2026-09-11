import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/audit/cleanup-duplicate-seqs — authorization + safety tests.
 *
 * This is the most sensitive service_role route: it deletes rows from the
 * append-only activity_logs via an admin client. The contract under test:
 *  1. Anonymous callers → 401 (no user context, no work done).
 *  2. Non-super_admin callers (e.g. teacher) → 403, delete never touched.
 *  3. super_admin + no duplicate seqs → 200 deleted:0, delete never touched.
 *  4. super_admin + duplicate seqs → only rows NOT reachable from the live
 *     chain tip (audit_chain_state.last_hash) are deleted — never the
 *     tip itself, and never a row from a different tenant/chain
 *     generation just because it happens to share a `seq` value.
 *  5. A forked seq group (two rows both reachable from the tip) is left
 *     untouched and reported, never guessed at.
 *  6. A corrupted/inconsistent chain state → 409, nothing deleted.
 *  7. Delete failure → 500 with a generic message (no DB internals leak).
 *
 * This supersedes an earlier version of this file that asserted the
 * *previous* "keeper" heuristic (whichever row's entry_hash happened to
 * be referenced as another row's prev_hash, else oldest by created_at).
 * That heuristic is exactly what P1-SEC-006 fixed: it could pick the
 * *stale* row as keeper and delete the actual live chain tip, since the
 * tip is never referenced as anyone's prev_hash yet. See
 * domain/audit/duplicate-seq-cleanup.ts for the corrected, reachability-
 * based algorithm and its own dedicated unit tests.
 *
 * NOTE: the DB-side backstop (prevent_audit_mutation trigger) cannot be
 * exercised in a unit test — it requires a live database and is covered by
 * STG/live verification, not here.
 */

const mockGetUser = vi.fn();
const mockProfileSingle = vi.fn();
const mockChainStateMaybeSingle = vi.fn();
const mockActivityLogsOrder = vi.fn();
const mockAdminDeleteIn = vi.fn();

vi.mock('@/infrastructure/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ single: (...args: unknown[]) => mockProfileSingle(...args) }),
        }),
      }),
    }),
  })),
}));

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'audit_chain_state') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: (...args: unknown[]) => mockChainStateMaybeSingle(...args) }),
          }),
        };
      }
      // activity_logs
      return {
        select: () => ({
          order: (...args: unknown[]) => mockActivityLogsOrder(...args),
        }),
        delete: () => ({ in: (...args: unknown[]) => mockAdminDeleteIn(...args) }),
      };
    },
  })),
}));

import { POST } from './route';

const GENESIS = '0'.repeat(64);
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

type LogRow = {
  id: string;
  seq: number;
  tenant_id: string;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string;
};

function row(partial: Partial<LogRow> & { id: string; seq: number }): LogRow {
  return {
    tenant_id: TENANT_A,
    prev_hash: GENESIS,
    entry_hash: `hash-${partial.id}`,
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminDeleteIn.mockResolvedValue({ error: null });
});

describe('cleanup-duplicate-seqs authorization', () => {
  it('returns 401 for anonymous callers without touching the admin client', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') });

    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockChainStateMaybeSingle).not.toHaveBeenCalled();
    expect(mockActivityLogsOrder).not.toHaveBeenCalled();
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });

  it('returns 403 for non-super_admin callers without touching deletes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null });
    mockProfileSingle.mockResolvedValue({ data: { primary_role: 'teacher' }, error: null });

    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockChainStateMaybeSingle).not.toHaveBeenCalled();
    expect(mockActivityLogsOrder).not.toHaveBeenCalled();
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });

  it('returns deleted:0 and never deletes when no seq is duplicated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'sa-1' } }, error: null });
    mockProfileSingle.mockResolvedValue({ data: { primary_role: 'super_admin' }, error: null });
    mockChainStateMaybeSingle.mockResolvedValue({ data: { last_hash: 'H2' }, error: null });
    mockActivityLogsOrder.mockResolvedValue({
      data: [
        row({ id: 'a', seq: 1, entry_hash: 'H1', prev_hash: GENESIS }),
        row({ id: 'b', seq: 2, entry_hash: 'H2', prev_hash: 'H1' }),
      ],
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 0 });
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });
});

describe('cleanup-duplicate-seqs duplicate handling', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'sa-1' } }, error: null });
    mockProfileSingle.mockResolvedValue({ data: { primary_role: 'super_admin' }, error: null });
  });

  it('never deletes the live chain tip, even when an older duplicate seq exists in a different tenant', async () => {
    // seq=1 collides across two tenants (audit_chain_state was reset).
    // The OLD keeper heuristic ("referenced as prev_hash, else oldest")
    // would have picked the older, orphaned Tenant-A row as keeper and
    // deleted the live Tenant-B tip. The correct algorithm walks
    // backward from last_hash and must keep the tip no matter what.
    const staleOrphan = row({
      id: 'stale-tenant-a',
      seq: 1,
      tenant_id: TENANT_A,
      entry_hash: 'stale-hash',
      prev_hash: GENESIS,
      created_at: '2026-01-01T00:00:00Z',
    });
    const liveTip = row({
      id: 'live-tenant-b',
      seq: 1,
      tenant_id: TENANT_B,
      entry_hash: 'live-hash',
      prev_hash: GENESIS,
      created_at: '2026-02-01T00:00:00Z',
    });

    mockChainStateMaybeSingle.mockResolvedValue({ data: { last_hash: 'live-hash' }, error: null });
    mockActivityLogsOrder.mockResolvedValue({ data: [staleOrphan, liveTip], error: null });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 1 });
    expect(mockAdminDeleteIn).toHaveBeenCalledTimes(1);
    const [, deletedIds] = mockAdminDeleteIn.mock.calls[0] as [string, string[]];
    expect(deletedIds).toEqual(['stale-tenant-a']);
  });

  it('keeps the oldest row when neither side of a duplicate-seq group is on the live chain', async () => {
    mockChainStateMaybeSingle.mockResolvedValue({ data: { last_hash: 'live' }, error: null });
    mockActivityLogsOrder.mockResolvedValue({
      data: [
        row({ id: 'old8', seq: 8, entry_hash: 'H8', created_at: '2026-01-01T00:00:00Z' }),
        row({ id: 'new8', seq: 8, entry_hash: 'H8-dup', created_at: '2026-01-01T02:00:00Z' }),
        row({ id: 'live', seq: 99, entry_hash: 'live', created_at: '2026-01-02T00:00:00Z' }),
      ],
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 1 });
    const [, deletedIds] = mockAdminDeleteIn.mock.calls[0] as [string, string[]];
    expect(deletedIds).toEqual(['new8']);
  });

  it('leaves a forked seq group untouched and reports it, instead of guessing', async () => {
    // Two rows both reachable from the tip share seq=7 — structurally
    // impossible under one valid chain. Must never delete either.
    mockChainStateMaybeSingle.mockResolvedValue({ data: { last_hash: 'H3' }, error: null });
    mockActivityLogsOrder.mockResolvedValue({
      data: [
        row({ id: 'r1', seq: 7, entry_hash: 'H1', prev_hash: GENESIS }),
        row({ id: 'r2', seq: 7, entry_hash: 'H2', prev_hash: 'H1' }),
        row({ id: 'r3', seq: 8, entry_hash: 'H3', prev_hash: 'H2' }),
      ],
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.deleted).toBe(0);
    expect(body.conflicts).toBeDefined();
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });

  it('returns 409 and deletes nothing when the chain tip hash is not found', async () => {
    mockChainStateMaybeSingle.mockResolvedValue({ data: { last_hash: 'does-not-exist' }, error: null });
    mockActivityLogsOrder.mockResolvedValue({
      data: [row({ id: 'a', seq: 1, entry_hash: 'H1' })],
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(409);
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });

  it('masks DB errors with a generic 500 message', async () => {
    // o1 is a genuine, disconnected orphan (its own unrelated lineage off
    // genesis); o2 is the actual, reachable tip. Not chained through each
    // other, so this is a plain single-keeper duplicate (not a fork).
    mockChainStateMaybeSingle.mockResolvedValue({ data: { last_hash: 'H2' }, error: null });
    mockActivityLogsOrder.mockResolvedValue({
      data: [
        row({ id: 'o1', seq: 7, entry_hash: 'H1', prev_hash: GENESIS }),
        row({ id: 'o2', seq: 7, entry_hash: 'H2', prev_hash: GENESIS }),
      ],
      error: null,
    });
    mockAdminDeleteIn.mockResolvedValue({ error: new Error('relation "activity_logs" does not exist') });

    const res = await POST();
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ deleted: 0 });
    expect(JSON.stringify(body)).not.toContain('activity_logs');
  });
});
