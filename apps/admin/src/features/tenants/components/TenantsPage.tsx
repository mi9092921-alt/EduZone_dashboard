'use client';

import { Add, Business, Edit, Delete, Block, Search } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import {
  useCreateTenant,
  useSuspendTenant,
  useDeleteTenant,
} from '@/adapters/mutations/tenants.mutations';
import { useTenants } from '@/adapters/queries/tenants.queries';
import { Button } from '@/components/ui/Button';
import { TablePagination } from '@/components/ui/TablePagination';
import type {
  Tenant,
  TenantFilters,
  TenantPlan,
  TenantStatus,
  CreateTenantInput,
} from '@/domain/types/tenant.types';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

// ── Plan config ──────────────────────────────────────────────────
const PLAN_CONFIG: Record<TenantPlan, { bg: string; text: string }> = {
  free: {
    bg: 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
  },
  starter: {
    bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20',
    text: 'text-blue-700 dark:text-blue-400',
  },
  pro: {
    bg: 'bg-violet-50 dark:bg-violet-500/10 border-violet-100 dark:border-violet-500/20',
    text: 'text-violet-700 dark:text-violet-400',
  },
  enterprise: {
    bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
  },
};

const STATUS_CONFIG: Record<TenantStatus, { dot: string; text: string; bg: string }> = {
  active: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
  },
  suspended: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',
  },
  deleted: {
    dot: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20',
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function TenantsPage() {
  const router = useRouter();
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');

  const [filters, setFilters] = useState<TenantFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<Tenant | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);

  // Form state
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newPlan, setNewPlan] = useState<TenantPlan>('free');

  const { data, isLoading, isFetching } = useTenants(filters, page, pageSize);
  const tenants = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  const createMut = useCreateTenant();
  const suspendMut = useSuspendTenant();
  const deleteMut = useDeleteTenant();

  const handleSearch = useCallback(() => {
    setFilters((f) => ({ ...f, search: searchInput || undefined }));
    setPage(1);
  }, [searchInput]);

  const handleCreate = async () => {
    if (!newSlug || !newName) return;
    const input: CreateTenantInput = { slug: newSlug, name: newName, plan: newPlan };
    await createMut.mutateAsync(input);
    setShowCreate(false);
    setNewSlug('');
    setNewName('');
    setNewPlan('free');
  };

  const handleSuspend = async () => {
    if (!suspendTarget || !suspendReason) return;
    await suspendMut.mutateAsync({ id: suspendTarget.id, reason: suspendReason });
    setSuspendTarget(null);
    setSuspendReason('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMut.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{t('title')}</h1>
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
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Add className="text-sm scale-90" />
            {t('new_tenant')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('search_placeholder')}
            className="w-full h-9 ps-9 pe-3 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={filters.plan ?? ''}
          onChange={(e) => {
            setFilters((f) => ({
              ...f,
              plan: (e.target.value || undefined) as TenantPlan | undefined,
            }));
            setPage(1);
          }}
          className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('all_plans')}</option>
          <option value="free">{t('plan_free')}</option>
          <option value="starter">{t('plan_starter')}</option>
          <option value="pro">{t('plan_pro')}</option>
          <option value="enterprise">{t('plan_enterprise')}</option>
        </select>
        <select
          value={filters.status ?? ''}
          onChange={(e) => {
            setFilters((f) => ({
              ...f,
              status: (e.target.value || undefined) as TenantStatus | undefined,
            }));
            setPage(1);
          }}
          className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('all_statuses')}</option>
          <option value="active">{t('status_active')}</option>
          <option value="suspended">{t('status_suspended')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-separate border-spacing-0 min-w-[900px]">
            <thead>
              <tr className="bg-muted/50 border-b border-border/60">
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_tenant')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_plan')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_status')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_region')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_users')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_courses')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-start">
                  {t('header_storage')}
                </th>
                <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase tracking-wider text-end">
                  {tCommon('activity_overview')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-20 bg-muted rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {t('no_tenants')}
                  </td>
                </tr>
              ) : (
                tenants.map((t_item) => {
                  const usage = t_item as Tenant & {
                    current_users?: number | null;
                    current_courses?: number | null;
                    current_storage_bytes?: number | null;
                  };
                  const planKey = (t_item.plan in PLAN_CONFIG ? t_item.plan : 'free') as TenantPlan;
                  const statusKey = (
                    t_item.status in STATUS_CONFIG ? t_item.status : 'active'
                  ) as TenantStatus;
                  const plan = PLAN_CONFIG[planKey];
                  const status = STATUS_CONFIG[statusKey];
                  const currentUsers = Number(usage.current_users ?? 0);
                  const currentCourses = Number(usage.current_courses ?? 0);
                  const currentStorageBytes = Number(usage.current_storage_bytes ?? 0);
                  const userPct =
                    t_item.max_users > 0 ? (currentUsers / t_item.max_users) * 100 : 0;
                  const coursePct =
                    t_item.max_courses > 0 ? (currentCourses / t_item.max_courses) * 100 : 0;
                  const storagePct =
                    t_item.max_storage_bytes > 0
                      ? (currentStorageBytes / t_item.max_storage_bytes) * 100
                      : 0;

                  return (
                    <tr
                      key={t_item.id}
                      className="group hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/tenants/${t_item.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Business className="text-sm text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground">{t_item.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {t_item.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase',
                            plan.bg,
                            plan.text,
                          )}
                        >
                          {t(`plan_${planKey}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border',
                            status.bg,
                            status.text,
                          )}
                        >
                          <div className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                          {t(`status_${statusKey}` as Parameters<typeof t>[0])}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {t_item.region_id}
                      </td>
                      <td className="px-4 py-3">
                        <ResourceBar current={currentUsers} max={t_item.max_users} pct={userPct} />
                      </td>
                      <td className="px-4 py-3">
                        <ResourceBar
                          current={currentCourses}
                          max={t_item.max_courses}
                          pct={coursePct}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <ResourceBar
                          current={currentStorageBytes}
                          max={t_item.max_storage_bytes}
                          pct={storagePct}
                          formatFn={formatBytes}
                        />
                      </td>
                      <td className="px-4 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => router.push(`/tenants/${t_item.id}`)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title={t('tooltip_edit')}
                          >
                            <Edit className="text-sm" />
                          </button>
                          {t_item.status === 'active' && (
                            <button
                              onClick={() => setSuspendTarget(t_item)}
                              className="p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                              title={t('tooltip_suspend')}
                            >
                              <Block className="text-sm" />
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(t_item)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title={t('tooltip_delete')}
                          >
                            <Delete className="text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {/* ═══ Create Dialog ═══════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-foreground mb-4">{t('dialog_create_title')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
                  {t('label_slug')} *
                </label>
                <input
                  value={newSlug}
                  onChange={(e) =>
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                  }
                  placeholder={t('placeholder_slug')}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
                  {t('label_name')} *
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('placeholder_name')}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
                  {t('label_plan')}
                </label>
                <select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value as TenantPlan)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="free">{t('plan_free')}</option>
                  <option value="starter">{t('plan_starter')}</option>
                  <option value="pro">{t('plan_pro')}</option>
                  <option value="enterprise">{t('plan_enterprise')}</option>
                </select>
              </div>
            </div>
            {createMut.error && (
              <p className="text-xs text-destructive mt-2">{(createMut.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                {tCommon('cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                isLoading={createMut.isPending}
                disabled={!newSlug || !newName}
              >
                {tCommon('save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Suspend Dialog ══════════════════════════════════════ */}
      {suspendTarget && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-foreground mb-2">{t('dialog_suspend_title')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('dialog_suspend_desc', { name: suspendTarget.name })}
            </p>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
                {t('label_reason')} *
              </label>
              <input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={t('placeholder_reason')}
                className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSuspendTarget(null);
                  setSuspendReason('');
                }}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleSuspend}
                isLoading={suspendMut.isPending}
                disabled={!suspendReason}
              >
                {t('tooltip_suspend')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Delete Dialog ═══════════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-foreground mb-2">{t('dialog_delete_title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('dialog_delete_desc', { name: deleteTarget.name })}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                {tCommon('cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                isLoading={deleteMut.isPending}
              >
                {tCommon('delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Resource Usage Bar ───────────────────────────────────────────
function ResourceBar({
  current,
  max,
  pct,
  formatFn,
}: {
  current: number;
  max: number;
  pct: number;
  formatFn?: ((n: number) => string) | undefined;
}) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  const safePct = Number.isFinite(pct) ? pct : 0;
  const fmt = formatFn ?? ((n: number) => n.toLocaleString());
  const color = safePct >= 90 ? 'bg-red-500' : safePct >= 70 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div className="w-24">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="font-bold text-foreground">{fmt(safeCurrent)}</span>
        <span className="text-muted-foreground">/ {fmt(safeMax)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(safePct, 100)}%` }}
        />
      </div>
    </div>
  );
}
