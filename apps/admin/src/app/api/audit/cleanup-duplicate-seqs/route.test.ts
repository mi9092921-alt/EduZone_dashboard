import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/audit/cleanup-duplicate-seqs — authorization + safety tests.
 *
 * This is the most sensitive service_role route: it deletes rows from the
 * append-only activity_logs via an admin client. The contract under test:
 *  1. Anonymous callers → 401 (no user context, no work done).
 *  2. Non-super_admin callers (e.g. teacher) → 403, delete never touched.
 *  3. super_admin + no duplicate seqs → 200 deleted:0, delete never touched.
 *  4. super_admin + duplicate seqs → only non-keeper ids deleted; the keeper
 *     (row whose entry_hash continues the chain, else oldest) is preserved.
 *  5. Delete failure → 500 with a generic message (no DB internals leak).
 *
 * NOTE: the DB-side backstop (prevent_audit_mutation trigger) cannot be
 * exercised in a unit test — it requires a live database and is covered by
 * STG/live verification, not here.
 */

const mockGetUser = vi.fn();
const mockProfileSingle = vi.fn();
const mockAdminFetch = vi.fn();
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
    from: () => ({
      select: () => ({
        order: () => ({ order: (...args: unknown[]) => mockAdminFetch(...args) }),
      }),
      delete: () => ({ in: (...args: unknown[]) => mockAdminDeleteIn(...args) }),
    }),
  })),
}));

import { POST } from './route';

type LogRow = {
  id: string;
  seq: number;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string;
};

function row(partial: Partial<LogRow> & { id: string; seq: number }): LogRow {
  return {
    prev_hash: null,
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
    expect(mockAdminFetch).not.toHaveBeenCalled();
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });

  it('returns 403 for non-super_admin callers without touching deletes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null });
    mockProfileSingle.mockResolvedValue({ data: { primary_role: 'teacher' }, error: null });

    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockAdminFetch).not.toHaveBeenCalled();
    expect(mockAdminDeleteIn).not.toHaveBeenCalled();
  });

  it('returns deleted:0 and never deletes when no seq is duplicated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'sa-1' } }, error: null });
    mockProfileSingle.mockResolvedValue({ data: { primary_role: 'super_admin' }, error: null });
    mockAdminFetch.mockResolvedValue({
      data: [row({ id: 'a', seq: 1 }), row({ id: 'b', seq: 2 })],
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

  it('keeps the chain-continuing row and deletes only orphans', async () => {
    // seq=7 appears twice: keeper k1 (entry_hash referenced as prev_hash by
    // a later row) and orphan o1. seq=8 appears twice with no chain link:
    // oldest (first) is kept, newer deleted.
    mockAdminFetch.mockResolvedValue({
      data: [
        row({ id: 'k1', seq: 7, entry_hash: 'H7', created_at: '2026-01-01T00:00:00Z' }),
        row({ id: 'o1', seq: 7, entry_hash: 'H7-dup', created_at: '2026-01-01T01:00:00Z' }),
        row({ id: 'later', seq: 9, prev_hash: 'H7', created_at: '2026-01-02T00:00:00Z' }),
        row({ id: 'old8', seq: 8, entry_hash: 'H8', created_at: '2026-01-01T00:00:00Z' }),
        row({ id: 'new8', seq: 8, entry_hash: 'H8-dup', created_at: '2026-01-01T02:00:00Z' }),
      ],
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 2 });
    expect(mockAdminDeleteIn).toHaveBeenCalledTimes(1);
    const [, deletedIds] = mockAdminDeleteIn.mock.calls[0] as [string, string[]];
    expect([...deletedIds].sort()).toEqual(['new8', 'o1']);
  });

  it('masks DB errors with a generic 500 message', async () => {
    mockAdminFetch.mockResolvedValue({
      data: [row({ id: 'o1', seq: 7 }), row({ id: 'o2', seq: 7 })],
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
