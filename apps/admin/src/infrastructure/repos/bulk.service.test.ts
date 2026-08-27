import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import { container } from '@/container';

// ── Mock the container ────────────────────────────────────────────
vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc:  vi.fn(),
      from: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'mock-access-token' } },
        }),
      },
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    },
  },
}));

// ── Import AFTER mocks ────────────────────────────────────────────
import {
  dryRunBulkAction,
  submitBulkAction,
  cancelBulkJob,
  subscribeToBulkProgress,
} from './bulk.service';

// The service now calls /api/bulk-action (local API route)
const BULK_PATTERN = '*/api/bulk-action';

describe('bulk.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── dryRunBulkAction ───────────────────────────────────────────
  it('dryRunBulkAction — sends dry_run: true and returns estimated_count', async () => {
    server.use(
      http.post(BULK_PATTERN, () =>
        HttpResponse.json({ estimated_count: 12, dry_run: true as const }),
      ),
    );

    const result = await dryRunBulkAction('lock', { primary_role: 'student' });

    expect(result.estimated_count).toBe(12);
    expect(result.dry_run).toBe(true);
  });

  it('dryRunBulkAction — includes selectedIds in filters body', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post(BULK_PATTERN, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ estimated_count: 3, dry_run: true as const });
      }),
    );

    await dryRunBulkAction('suspend', {}, ['u1', 'u2', 'u3']);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.dry_run).toBe(true);
    expect((capturedBody!.filters as Record<string, unknown>).user_ids)
      .toEqual(['u1', 'u2', 'u3']);
  });

  it('dryRunBulkAction — throws on non-ok HTTP response', async () => {
    server.use(
      http.post(BULK_PATTERN, () =>
        HttpResponse.json({ message: 'JOB_QUEUE_FULL' }, { status: 429 }),
      ),
    );

    await expect(dryRunBulkAction('lock', {})).rejects.toThrow('JOB_QUEUE_FULL');
  });

  // ── submitBulkAction ────────────────────────────────────────────
  it('submitBulkAction — sends dry_run: false and returns job_id', async () => {
    const MOCK_JOB_ID = 'job-abc-123';
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post(BULK_PATTERN, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          job_id:          MOCK_JOB_ID,
          estimated_count: 5,
          status:          'pending',
          created_at:      new Date().toISOString(),
        });
      }),
    );

    const result = await submitBulkAction('lock', { account_status: 'active' });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.dry_run).toBe(false);
    expect(capturedBody!.action).toBe('lock');
    expect(result.job_id).toBe(MOCK_JOB_ID);
    expect(result.status).toBe('pending');
  });

  it('submitBulkAction — throws on server error response', async () => {
    server.use(
      http.post(BULK_PATTERN, () =>
        HttpResponse.json({ message: 'Submit failed', error: 'Submit failed' }, { status: 500 }),
      ),
    );

    await expect(submitBulkAction('lock', {})).rejects.toThrow('Submit failed');
  });

  // ── cancelBulkJob ───────────────────────────────────────────────
  it('cancelBulkJob — calls admin_cancel_job RPC', async () => {
    const mockRpc = container.supabase.rpc as ReturnType<typeof vi.fn>;
    mockRpc.mockResolvedValue({ error: null });

    await cancelBulkJob('job-111');

    expect(mockRpc).toHaveBeenCalledWith('admin_cancel_job', { p_id: 'job-111' });
  });

  it('cancelBulkJob — throws on Supabase error', async () => {
    const mockRpc = container.supabase.rpc as ReturnType<typeof vi.fn>;
    mockRpc.mockResolvedValue({ error: { code: 'DB_ERROR', message: 'fail' } });

    await expect(cancelBulkJob('job-bad')).rejects.toMatchObject({ code: 'DB_ERROR' });
  });

  // ── subscribeToBulkProgress ─────────────────────────────────────
  it('subscribeToBulkProgress — returns cleanup function', () => {
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToBulkProgress('job-333', onUpdate);

    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
    expect(container.supabase.removeChannel).toHaveBeenCalled();
  });
});
