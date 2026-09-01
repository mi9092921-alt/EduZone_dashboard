'use client';

import { Search, ExpandMore, ExpandLess, ContentCopy, LinkOutlined } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import { ChainVerifier } from './ChainVerifier';


import { useActivityLogs } from '@/adapters/queries/audit.queries';
import { TablePagination } from '@/components/ui/TablePagination';
import type { AuditFilters, ActivityLog, RiskLevel } from '@/domain/types/audit.types';
import { cn } from '@/lib/utils';

const RISK_CHIPS: Record<RiskLevel, { bg: string; text: string }> = {
  low: { bg: 'bg-muted', text: 'text-muted-foreground' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-600' },
  critical: { bg: 'bg-destructive/10', text: 'text-destructive' },
};

const ACTIVITY_TYPES = [
  'login',
  'login_success',
  'logout',
  'login_failed',
  'password_reset',
  'device_bind',
  'course_created',
  'course_deleted',
  'course_view',
  'video_view',
  'lesson_started',
  'lesson_view',
  'lesson_content_denied',
  'enrollment',
  'settings_change',
  'settings_changed',
  'user_lock',
  'user_unlock',
  'user_suspend',
  'user_ban',
  'warning_issued',
  'api_call',
  'notification_sent',
  'notification_auto_sent',
  'tenant_suspension_revoked',
  'permission_denied',
  'course_access',
  'user_login',
  'bulk_action_queued',
  'bulk_action_completed',
  'bulk_action_progress',
  'bulk_export_completed',
];

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export function AuditLogsTab() {
  const t = useTranslations('audit');
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isFetching } = useActivityLogs(filters, page, pageSize);
  const logs = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  const handleSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, user_id: searchInput || undefined }));
    setPage(1);
  }, [searchInput]);

  const handleTypeFilter = useCallback((types: string[]) => {
    setFilters((prev) => ({
      ...prev,
      activity_type: types.length > 0 ? types : undefined,
    }));
    setPage(1);
  }, []);

  const handleRiskFilter = useCallback((levels: RiskLevel[]) => {
    setFilters((prev) => ({
      ...prev,
      risk_level: levels.length > 0 ? levels : undefined,
    }));
    setPage(1);
  }, []);

  const handleDateFilter = useCallback((from?: string, to?: string) => {
    setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
    setPage(1);
  }, []);

  return (
    <div className="space-y-4">
      {/* Chain Verifier Section */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('verification_title')}</h3>
        <ChainVerifier dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* User search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('search_placeholder')}
              className="w-full h-9 ps-9 pe-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Activity type filter */}
          <MultiSelect
            label={t('label_activity_type')}
            options={ACTIVITY_TYPES}
            selected={filters.activity_type ?? []}
            onChange={handleTypeFilter}
            t={t}
            mode="activity"
          />

          {/* Risk level filter */}
          <MultiSelect
            label={t('label_risk_level')}
            options={RISK_LEVELS}
            selected={filters.risk_level ?? []}
            onChange={(v) => handleRiskFilter(v as RiskLevel[])}
            t={t}
            mode="risk"
          />

          {/* Date range */}
          <input
            type="date"
            onChange={(e) =>
              handleDateFilter(
                e.target.value ? new Date(e.target.value).toISOString() : undefined,
                filters.dateTo,
              )
            }
            className="h-9 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">{t('label_to')}</span>
          <input
            type="date"
            onChange={(e) =>
              handleDateFilter(
                filters.dateFrom,
                e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : undefined,
              )
            }
            className="h-9 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Active filter chips */}
        {(filters.activity_type || filters.risk_level || filters.user_id) && (
          <div className="flex flex-wrap gap-1.5">
            {filters.user_id && (
              <Chip
                label={`${t('label_user_prefix')} ${filters.user_id.slice(0, 8)}…`}
                onDelete={() => {
                  setSearchInput('');
                  setFilters((p) => ({ ...p, user_id: undefined }));
                }}
              />
            )}
            {filters.activity_type?.map((type) => (
              <Chip
                key={type}
                label={t(`activity_types.${type}`)}
                onDelete={() => handleTypeFilter(filters.activity_type!.filter((x) => x !== type))}
              />
            ))}
            {filters.risk_level?.map((r) => (
              <Chip
                key={r}
                label={t(`risk_levels.${r}`)}
                onDelete={() => handleRiskFilter(filters.risk_level!.filter((x) => x !== r))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Data table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Loading bar */}
        {(isLoading || isFetching) && (
          <div className="h-0.5 bg-primary/20">
            <div className="h-full bg-primary animate-pulse w-1/2 rounded-full" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs w-8" />
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">
                  {t('header_seq')}
                </th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">
                  {t('header_time')}
                </th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">
                  {t('header_user')}
                </th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">
                  {t('header_activity')}
                </th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">
                  {t('header_risk')}
                </th>
                <th className="text-start px-4 py-3 font-semibold text-muted-foreground text-xs">
                  {t('header_hash')}
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <LogRow
                  key={`${log.id}-${log.created_at}`}
                  log={log}
                  isExpanded={expandedRow === log.id}
                  onToggle={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                />
              ))}
              {!isLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    {t('no_logs_found')}
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

// ── Log row ─────────────────────────────────────────────────
function LogRow({
  log,
  isExpanded,
  onToggle,
}: {
  log: ActivityLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('audit');
  const risk = RISK_CHIPS[log.risk_level] ?? RISK_CHIPS.low;
  const time = new Date(log.created_at);

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
      >
        <td className="px-4 py-2.5">
          {isExpanded ? (
            <ExpandLess className="text-base text-muted-foreground" />
          ) : (
            <ExpandMore className="text-base text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-foreground font-semibold">{log.seq}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
          {time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
          {time.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </td>
        <td className="px-4 py-2.5 text-xs text-foreground font-mono">
          {log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}
        </td>
        <td className="px-4 py-2.5">
          <span className="text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded-md">
            {t(`activity_types.${log.activity_type}`)}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span
            className={cn(
              'text-[10px] font-bold uppercase px-2 py-0.5 rounded-md',
              risk.bg,
              risk.text,
            )}
          >
            {t(`risk_levels.${log.risk_level}`)}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <Tooltip title={log.entry_hash}>
            <span className="text-[10px] font-mono text-muted-foreground cursor-help">
              {log.entry_hash.slice(0, 12)}…
            </span>
          </Tooltip>
        </td>
      </tr>

      {/* Expanded details */}
      {isExpanded && (
        <tr className="bg-muted/10">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Details JSON */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  {t('details_title')}
                </h4>
                <pre className="text-[11px] font-mono bg-background rounded-xl p-3 border border-border overflow-x-auto max-h-48 text-foreground">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </div>

              {/* Chain info */}
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    {t('chain_link_title')}
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <LinkOutlined className="text-sm text-muted-foreground" />
                    <span className="text-muted-foreground">{t('prev_hash_label')}</span>
                    <Tooltip title={log.prev_hash ?? ''}>
                      <span className="font-mono text-foreground cursor-help">
                        {log.prev_hash ? `${log.prev_hash.slice(0, 16)}…` : '—'}
                      </span>
                    </Tooltip>
                    <CopyButton text={log.prev_hash ?? ''} />
                  </div>
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <LinkOutlined className="text-sm text-primary" />
                    <span className="text-muted-foreground">{t('entry_hash_label')}</span>
                    <Tooltip title={log.entry_hash}>
                      <span className="font-mono text-foreground cursor-help">
                        {log.entry_hash.slice(0, 16)}…
                      </span>
                    </Tooltip>
                    <CopyButton text={log.entry_hash} />
                  </div>
                </div>

                {/* Metadata */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    {t('metadata_title')}
                  </h4>
                  <div className="space-y-1 text-xs">
                    {log.ip_address && (
                      <p>
                        <span className="text-muted-foreground">{t('ip_label')}</span>{' '}
                        <span className="font-mono text-foreground">{log.ip_address}</span>
                      </p>
                    )}
                    {log.device_id && (
                      <p>
                        <span className="text-muted-foreground">{t('device_label')}</span>{' '}
                        <span className="font-mono text-foreground">{log.device_id}</span>
                      </p>
                    )}
                    {log.user_agent && (
                      <p>
                        <span className="text-muted-foreground">{t('ua_label')}</span>{' '}
                        <span className="font-mono text-foreground truncate">{log.user_agent}</span>
                      </p>
                    )}
                    <p>
                      <span className="text-muted-foreground">{t('region_label')}</span>{' '}
                      <span className="font-mono text-foreground">{log.region_id ?? '—'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Copy hash button ────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const t = useTranslations('audit');
  const [copied, setCopied] = useState(false);

  return (
    <Tooltip title={copied ? t('copied_tooltip') : t('copy_tooltip')}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={copied ? t('copied_tooltip') : t('copy_tooltip')}
        className="p-1 rounded hover:bg-muted transition-colors"
      >
        <ContentCopy
          className={cn('text-xs', copied ? 'text-emerald-500' : 'text-muted-foreground')}
        />
      </button>
    </Tooltip>
  );
}

// ── Multi-select dropdown ───────────────────────────────────
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  t,
  mode,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  t: ReturnType<typeof useTranslations>;
  mode: 'activity' | 'risk';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors',
          selected.length > 0
            ? 'border-primary/50 bg-primary/5 text-primary'
            : 'border-border bg-background text-muted-foreground hover:bg-muted/50',
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
            {selected.length}
          </span>
        )}
        <ExpandMore className="text-sm" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full start-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-20 min-w-[180px] max-h-56 overflow-y-auto content-scroll">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  const next = selected.includes(opt)
                    ? selected.filter((s) => s !== opt)
                    : [...selected, opt];
                  onChange(next);
                }}
                className={cn(
                  'w-full text-start px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2',
                  selected.includes(opt) && 'bg-primary/5 text-primary font-medium',
                )}
              >
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                    selected.includes(opt) ? 'bg-primary border-primary' : 'border-border',
                  )}
                >
                  {selected.includes(opt) && (
                    <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 12 12">
                      <path
                        d="M10 3L4.5 8.5L2 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                {mode === 'activity' ? t(`activity_types.${opt}`) : t(`risk_levels.${opt}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Chip ────────────────────────────────────────────────────
function Chip({ label, onDelete }: { label: string; onDelete: () => void }) {
  const tCommon = useTranslations('common');
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted text-xs font-medium text-foreground">
      {label}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${tCommon('remove')}: ${label}`}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        ×
      </button>
    </span>
  );
}

