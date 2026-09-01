'use client';

import { CheckCircle, Warning, Cancel, Download, AccessTime, Close } from '@mui/icons-material';
import { LinearProgress } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';

import { useCancelBulkJob } from '@/adapters/mutations/bulk.mutations';
import { queryKeys } from '@/adapters/queries/keys';
import { Button } from '@/components/ui/Button';
import type { BulkAction, BulkProgress } from '@/domain/types/bulk.types';
import { subscribeToBulkProgress, getBulkJobProgress } from '@/infrastructure/repos/bulk.service';
import { cn } from '@/lib/utils';

interface BulkProgressPanelProps {
  jobId: string;
  action: BulkAction;
  onDone: () => void;
}

const TERMINAL_STATUSES = new Set(['done', 'dead', 'failed']);
const AUTO_DISMISS_MS = 3000;

export function BulkProgressPanel({ jobId, action, onDone }: BulkProgressPanelProps) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [isDownloading, setIsDownloading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const startTime = useRef(Date.now());
  const cancelJob = useCancelBulkJob();
  const hasRefreshedData = useRef(false);
  const onDoneRef = useRef(onDone);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDoneRef.current();
  }, []);

  const applyUpdate = useCallback((prog: BulkProgress | null, st: string) => {
    if (prog) setProgress(prog);
    setStatus(st);
  }, []);

  // Subscribe to realtime updates & fallback polling
  useEffect(() => {
    const unsubscribe = subscribeToBulkProgress(jobId, applyUpdate);

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const fetchProgress = async () => {
      try {
        const res = await getBulkJobProgress(jobId);
        if (!res || cancelled) return;
        applyUpdate(res.progress, res.status);
        if (TERMINAL_STATUSES.has(res.status) && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (err) {
        console.error('Failed to poll bulk job progress:', err);
      }
    };

    fetchProgress();
    pollInterval = setInterval(fetchProgress, 1000);

    return () => {
      cancelled = true;
      unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId, applyUpdate]);

  // Refresh users table when job completes
  useEffect(() => {
    if (!TERMINAL_STATUSES.has(status) || hasRefreshedData.current) return;
    hasRefreshedData.current = true;
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
  }, [status, queryClient]);

  // Auto-dismiss successful jobs (keep export/failure panels until manual dismiss)
  useEffect(() => {
    if (status !== 'done' || dismissed) return;

    const failed = progress?.failed ?? progress?.failed_ids?.length ?? 0;
    const hasDownload = !!progress?.download_url;
    if (failed > 0 || hasDownload) return;

    const timer = setTimeout(handleDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [status, progress, dismissed, handleDismiss]);

  // Elapsed time counter — stops when job finishes
  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return;

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  const formatElapsed = useCallback((secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }, []);

  const isDone = TERMINAL_STATUSES.has(status);
  const isProcessing = status === 'processing';
  const attempted = progress?.processed ?? 0;
  const total = progress?.total ?? 0;
  const failed = progress?.failed ?? progress?.failed_ids?.length ?? 0;
  const succeeded = progress?.succeeded ?? Math.max(0, attempted - failed);
  const pct = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const hasDownload = !!progress?.download_url;

  const handleCancel = () => {
    cancelJob.mutate(jobId);
  };

  const handleDownload = useCallback(async () => {
    if (!progress?.download_url) return;

    const ext = progress.format ?? 'json';
    const filename = `users-export-${jobId.slice(0, 8)}.${ext}`;

    setIsDownloading(true);
    try {
      const res = await fetch(progress.download_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Blob download failed, falling back to new tab:', err);
      window.open(progress.download_url, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  }, [progress, jobId]);

  if (dismissed) return null;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          {isDone && failed === 0 && <CheckCircle className="text-emerald-500 text-base" />}
          {isDone && failed > 0 && <Warning className="text-amber-500 text-base" />}
          {!isDone && (
            <div className="relative">
              <AccessTime className="text-primary text-base" />
              {isProcessing && (
                <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </div>
          )}
          <h3 className="text-sm font-semibold text-foreground">Bulk {action.replace('_', ' ')}</h3>
          <span
            className={cn(
              'text-[10px] font-bold uppercase px-2 py-0.5 rounded-md',
              isDone
                ? failed > 0
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-emerald-500/10 text-emerald-600'
                : status === 'dead'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary',
            )}
          >
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
          {isDone && (
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Close className="text-sm" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Progress bar — hidden once complete */}
        {!isDone && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">
                {attempted} / {total || '…'} processed
              </span>
              <span className="text-xs font-bold text-foreground">{pct}%</span>
            </div>
            <LinearProgress
              variant={isProcessing && total === 0 ? 'indeterminate' : 'determinate'}
              value={pct}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: 'var(--muted)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 'var(--primary)',
                  borderRadius: 4,
                },
              }}
            />
          </div>
        )}

        {/* Result summary */}
        {isDone && (
          <div className="flex items-center gap-3 flex-wrap">
            {status === 'done' && (
              <span className="text-xs font-medium text-emerald-600">✓ {succeeded} succeeded</span>
            )}
            {status === 'failed' && (
              <span className="text-xs font-medium text-destructive">Job failed</span>
            )}
            {status === 'dead' && (
              <span className="text-xs font-medium text-muted-foreground">Job cancelled</span>
            )}
            {failed > 0 && (
              <span className="text-xs font-medium text-destructive">✗ {failed} failed</span>
            )}
          </div>
        )}

        {isDone && status === 'done' && total > 0 && (
          <p className="text-xs text-muted-foreground">
            {attempted} / {total} processed ({pct}%)
          </p>
        )}
        {isDone && failed > 0 && progress?.failed_ids && progress.failed_ids.length > 0 && (
          <details className="text-xs">
            <summary className="text-destructive cursor-pointer font-medium">
              View failed user IDs ({progress.failed_ids.length})
            </summary>
            <div className="mt-2 p-2 bg-muted/50 rounded-lg font-mono text-[10px] text-muted-foreground max-h-24 overflow-y-auto">
              {progress.failed_ids.map((id) => (
                <div key={id}>{id}</div>
              ))}
            </div>
          </details>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isDone && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelJob.isPending}
              isLoading={cancelJob.isPending}
            >
              <Cancel className="text-sm" />
              Cancel
            </Button>
          )}
          {hasDownload && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownload}
              isLoading={isDownloading}
              disabled={isDownloading}
            >
              <Download className="text-sm" />
              Download {progress?.format?.toUpperCase() || 'File'}
            </Button>
          )}
          {isDone && !hasDownload && (
            <Button type="button" variant="ghost" size="sm" onClick={handleDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
