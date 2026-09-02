import { container } from '@/container';
import { mapDbError } from '@/domain/errors';
import type {
  BulkAction,
  BulkDryRunResponse,
  BulkSubmitResponse,
  BulkProgress,
} from '@/domain/types/bulk.types';
import type { UserFilters } from '@/domain/types/user.types';

/**
 * Bulk operations service — calls local API route for bulk user actions.
 * Auth is handled server-side via cookies (createServerClient).
 */

const BULK_ACTION_URL = '/api/bulk-action';

// ── Dry-run (get estimated count) ────────────────────────────────
export async function dryRunBulkAction(
  action: BulkAction,
  filters: UserFilters,
  selectedIds?: string[],
  params?: Record<string, unknown>,
): Promise<BulkDryRunResponse> {
  const body = {
    action,
    filters: {
      ...filters,
      ...(selectedIds && selectedIds.length > 0 ? { user_ids: selectedIds } : {}),
    },
    params: params ?? {},
    dry_run: true,
  };

  const res = await fetch(BULK_ACTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Dry run failed');
  }
  return data as BulkDryRunResponse;
}

// ── Submit bulk action ───────────────────────────────────────────
export async function submitBulkAction(
  action: BulkAction,
  filters: UserFilters,
  selectedIds?: string[],
  params?: Record<string, unknown>,
): Promise<BulkSubmitResponse> {
  const body = {
    action,
    filters: {
      ...filters,
      ...(selectedIds && selectedIds.length > 0 ? { user_ids: selectedIds } : {}),
    },
    params: params ?? {},
    dry_run: false,
  };

  const res = await fetch(BULK_ACTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Submit failed');
  }
  return data as BulkSubmitResponse;
}

// ── Cancel a bulk job ────────────────────────────────────────────
export async function cancelBulkJob(jobId: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.rpc('admin_cancel_job', { p_id: jobId });
  if (error) throw mapDbError(error, 'bulk.service.ts');
}

// ── Subscribe to job progress (Supabase Realtime) ────────────────
function parseJobProgress(row: Record<string, unknown>): BulkProgress | null {
  const raw = (row.error_message ?? row.error_msg) as string | undefined;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BulkProgress;
  } catch {
    return null;
  }
}

export function subscribeToBulkProgress(
  jobId: string,
  onUpdate: (progress: BulkProgress | null, status: string) => void,
): () => void {
  const { supabase } = container;

  const channel = supabase
    .channel(`bulk-job-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'internal',
        table: 'job_queue',
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const status = row.status as string;
        onUpdate(parseJobProgress(row), status);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Polling fallback: Get job progress ───────────────────────────
export async function getBulkJobProgress(
  jobId: string,
): Promise<{ status: string; progress: BulkProgress | null } | null> {
  const { supabase } = container;
  const { data, error } = await supabase.rpc('admin_get_job', { p_id: jobId });

  if (error) {
    console.error('getBulkJobProgress RPC error details:', error);
    return null;
  }

  const rows = data as Array<{ status: string; error_msg?: string | null }> | null;
  const job = rows?.[0];
  if (!job) return null;

  let progress: BulkProgress | null = null;
  if (job.error_msg) {
    try {
      progress = JSON.parse(job.error_msg) as BulkProgress;
    } catch {
      // error_msg is not JSON
    }
  }

  return { status: job.status, progress };
}
