'use client';

import { useState, useCallback } from 'react';
import {
  Replay,
  Cancel,
  LockOpen,
  WorkOutline,
  Info,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { TablePagination } from '@/components/ui/TablePagination';
import { Button } from '@/components/ui/Button';
import { useJobs, useJobStatusCounts } from '@/adapters/queries/jobs.queries';
import { useRetryJob, useCancelJob, useReleaseStaleJobs } from '@/adapters/mutations/jobs.mutations';
import type { Job, JobFilters, JobStatus } from '@/domain/types/job.types';
import { cn } from '@/lib/utils';

const STATUS_CHIPS: Record<JobStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-sky-500/10', text: 'text-sky-600' },
  processing: { bg: 'bg-primary/10', text: 'text-primary' },
  done: { bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
  failed: { bg: 'bg-destructive/10', text: 'text-destructive' },
  dead: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

const ALL_STATUSES: (JobStatus | 'all')[] = ['all', 'pending', 'processing', 'done', 'failed', 'dead'];

export function JobsPage() {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');
  const [filters, setFilters] = useState<JobFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState<JobStatus | 'all'>('all');

  const { data: statusCounts } = useJobStatusCounts();
  const { data, isLoading, isFetching } = useJobs(
    activeTab === 'all' ? filters : { ...filters, status: activeTab },
    page,
    pageSize,
  );

  const jobs = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const retryJob = useRetryJob();
  const cancelJob = useCancelJob();
  const releaseStale = useReleaseStaleJobs();
  const [releaseResult, setReleaseResult] = useState<string | null>(null);

  const handleTabChange = useCallback((tab: JobStatus | 'all') => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  const handleRelease = async () => {
    try {
      const count = await releaseStale.mutateAsync();
      setReleaseResult(t('status_released', { count }));
      setTimeout(() => setReleaseResult(null), 5000);
    } catch {
      setReleaseResult(t('status_release_failed'));
      setTimeout(() => setReleaseResult(null), 5000);
    }
  };

  const getTabCount = (status: JobStatus | 'all') => {
    if (!statusCounts) return 0;
    if (status === 'all') {
      return (
        (statusCounts.pending || 0) +
        (statusCounts.processing || 0) +
        (statusCounts.done || 0) +
        (statusCounts.failed || 0) +
        (statusCounts.dead || 0)
      );
    }
    return statusCounts[status] || 0;
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{t('page_title')}</h1>
          <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
            {totalCount.toLocaleString()} {tCommon('total')}
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tCommon('updating')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {releaseResult && (
            <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              {releaseResult}
            </span>
          )}
          {activeTab === 'processing' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRelease}
              isLoading={releaseStale.isPending}
            >
              <LockOpen className="text-sm" />
              {t('btn_release_locks')}
            </Button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto">
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => handleTabChange(status)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
              activeTab === status
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="capitalize">{status === 'all' ? t('label_all') : t(`status_${status}`)}</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center',
                activeTab === status
                  ? status === 'all'
                    ? 'bg-muted text-foreground'
                    : STATUS_CHIPS[status].bg + ' ' + STATUS_CHIPS[status].text
                  : 'bg-muted/50 text-muted-foreground',
              )}
            >
              {getTabCount(status)}
            </span>
          </button>
        ))}
      </div>

      {/* Jobs table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {(isLoading || isFetching) && (
          <div className="h-0.5 bg-primary/20">
            <div className="h-full bg-primary animate-pulse w-1/2 rounded-full" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_job_type')}</th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_status')}</th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_priority')}</th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_attempts')}</th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_run_at')}</th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_locked_by')}</th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_error')}</th>
                <th className="text-end px-4 py-3 font-semibold text-muted-foreground text-xs">{t('header_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: Job) => {
                const statusStyle = STATUS_CHIPS[job.status] ?? STATUS_CHIPS.pending;
                return (
                  <tr key={job.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-foreground">{job.job_type}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-md', statusStyle.bg, statusStyle.text)}>
                        {t(`status_${job.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <PriorityBadge priority={job.priority} />
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-foreground">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {job.run_at ? new Date(job.run_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
                      }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                      {job.locked_by_worker_id ? job.locked_by_worker_id.slice(0, 12) + (job.locked_by_worker_id.length > 12 ? '…' : '') : '—'}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      {job.error_message ? (
                        <Tooltip title={job.error_message}>
                          <span className="text-xs text-destructive truncate block cursor-help">
                            {job.error_message.slice(0, 50)}{job.error_message.length > 50 ? '…' : ''}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {(job.status === 'failed' || job.status === 'dead') && (
                          <Tooltip title={t('tooltip_retry')}>
                            <button
                              onClick={() => retryJob.mutate(job.id)}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            >
                              <Replay className="text-sm" />
                            </button>
                          </Tooltip>
                        )}
                        {(job.status === 'pending' || job.status === 'processing') && (
                          <Tooltip title={t('tooltip_cancel')}>
                            <button
                              onClick={() => cancelJob.mutate(job.id)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              <Cancel className="text-sm" />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip title={t('tooltip_payload')}>
                          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                            <Info className="text-sm" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <WorkOutline className="text-3xl opacity-30 mb-2" />
                    <p className="text-sm">
                      {activeTab === 'all'
                        ? t('no_jobs_found')
                        : t('no_jobs_with_status', { status: t(`status_${activeTab}`) })}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}

// ── Priority badge ──────────────────────────────────────────
function PriorityBadge({ priority }: { priority: number }) {
  const t = useTranslations('jobs');
  const level = priority >= 8 ? 'high' : priority >= 4 ? 'medium' : 'low';
  const styles = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-amber-500/10 text-amber-600',
    low: 'bg-muted text-muted-foreground',
  };

  return (
    <Tooltip title={t(`priority_${level}`)}>
      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md cursor-help', styles[level])}>
        P{priority}
      </span>
    </Tooltip>
  );
}
