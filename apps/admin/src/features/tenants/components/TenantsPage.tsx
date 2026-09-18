'use client';

import {
  Add,
  Business,
  Edit,
  Delete,
  Block,
  Search,
} from '@mui/icons-material';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import { z } from 'zod';

import {
  useCreateTenant,
  useSuspendTenant,
  useDeleteTenant,
} from '@/adapters/mutations/tenants.mutations';
import { useTenants } from '@/adapters/queries/tenants.queries';
import { useToast } from '@/adapters/stores/toast.store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner';
import { TablePagination } from '@/components/ui/TablePagination';
import type { Tenant, TenantFilters, TenantPlan, TenantStatus, CreateTenantInput } from '@/domain/types/tenant.types';
import { usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';



// ── Plan config ──────────────────────────────────────────────────
const PLAN_CONFIG: Record<TenantPlan, { bg: string; text: string }> = {
  free: { bg: 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300' },
  starter: { bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20', text: 'text-blue-700 dark:text-blue-400' },
  pro: { bg: 'bg-violet-50 dark:bg-violet-500/10 border-violet-100 dark:border-violet-500/20', text: 'text-violet-700 dark:text-violet-400' },
  enterprise: { bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20', text: 'text-amber-700 dark:text-amber-400' },
};

const STATUS_CONFIG: Record<TenantStatus, { dot: string; text: string; bg: string }> = {
  active: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20' },
  suspended: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20' },
  deleted: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const tenantSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid_slug'),
  name: z.string().trim().min(2, 'invalid_name').max(120, 'invalid_name'),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']),
});

export function TenantsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();

  const setSearchParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [filters, setFilters] = useState<TenantFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const isCreateOpen =
    searchParams.get('dialog') === 'create-tenant' ||
    searchParams.get('dialog') === 'create' ||
    showCreate;

  const handleOpenCreate = useCallback(() => {
    setShowCreate(true);
    setSearchParam('dialog', 'create-tenant');
  }, [setSearchParam]);

  const handleCloseCreate = useCallback(() => {
    setShowCreate(false);
    setSearchParam('dialog', null);
  }, [setSearchParam]);

  const [suspendTarget, setSuspendTarget] = useState<Tenant | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);

  // Form state
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newPlan, setNewPlan] = useState<TenantPlan>('free');
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useTenants(filters, page, pageSize);
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
    const parsed = tenantSchema.safeParse({ slug: newSlug, name: newName, plan: newPlan });
    if (!parsed.success) {
      setFormError(t(parsed.error.issues[0]?.message === 'invalid_slug' ? 'invalid_slug' : 'invalid_name'));
      return;
    }
    setFormError(null);
    try {
      await createMut.mutateAsync(parsed.data as CreateTenantInput);
      showToast(t('create_success'), 'success');
      handleCloseCreate();
      setNewSlug('');
      setNewName('');
      setNewPlan('free');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('action_error'), 'error');
    }
  };

  const handleSuspend = async () => {
    if (!suspendTarget || !suspendReason) return;
    try {
      await suspendMut.mutateAsync({ id: suspendTarget.id, reason: suspendReason.trim() });
      showToast(t('suspend_success'), 'success');
      setSuspendTarget(null);
      setSuspendReason('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('action_error'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      showToast(t('delete_success'), 'success');
      setDeleteTarget(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('action_error'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
        <Button onClick={handleOpenCreate} variant="primary" size="md">
          <Add className="text-sm" />
          {t('create_tenant_btn')}
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" />
          <input
            type="text"
            placeholder={t('search_placeholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full ps-9 pe-4 py-2 text-sm bg-muted/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <select
          value={filters.plan ?? ''}
          onChange={(e) => {
            setFilters((f) => ({ ...f, plan: (e.target.value as TenantPlan) || undefined }));
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-xl focus:outline-none text-foreground"
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
            setFilters((f) => ({ ...f, status: (e.target.value as TenantStatus) || undefined }));
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-xl focus:outline-none text-foreground"
        >
          <option value="">{t('all_statuses')}</option>
          <option value="active">{t('status_active')}</option>
          <option value="suspended">{t('status_suspended')}</option>
          <option value="deleted">{t('status_deleted')}</option>
        </select>
        <Button onClick={handleSearch} variant="secondary" size="md">
          {tCommon('search')}
        </Button>
      </div>

      {/* Tenants Table */}
      <QueryErrorBanner isError={isError} refetch={refetch} />
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {/* DESKTOP (≥md): full 8-column table (horizontal scroll stays inside) */}
        <div className="hidden md:block">
          <div className="table-scroll">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_tenant')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_plan')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_status')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_region')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_users')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_courses')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start tracking-wider">{t('header_storage')}</th>
                  <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-end tracking-wider">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      {t('no_tenants_found')}
                    </td>
                  </tr>
                ) : (
                  tenants.map((t_item) => (
                    <TenantRow
                      key={t_item.id}
                      tenant={t_item}
                      onOpen={() => router.push(`/tenants/${t_item.id}`)}
                      onSuspend={() => setSuspendTarget(t_item)}
                      onDelete={() => setDeleteTarget(t_item)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE (<md): stacked tenant cards */}
        <div className="md:hidden divide-y divide-border/40">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3 animate-pulse">
                <div className="h-9 w-9 bg-muted rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-2 w-full bg-muted rounded" />
                </div>
              </div>
            ))
          ) : tenants.length === 0 ? (
            <p className="px-4 py-12 text-center text-muted-foreground text-sm">{t('no_tenants_found')}</p>
          ) : (
            tenants.map((t_item) => (
              <TenantCard
                key={t_item.id}
                tenant={t_item}
                onOpen={() => router.push(`/tenants/${t_item.id}`)}
                onSuspend={() => setSuspendTarget(t_item)}
                onDelete={() => setDeleteTarget(t_item)}
              />
            ))
          )}
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
      <Modal
        open={isCreateOpen}
        onClose={handleCloseCreate}
        title={t('dialog_create_title')}
        maxWidth="sm"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={handleCloseCreate}>{tCommon('cancel')}</Button>
            <Button variant="primary" size="sm" onClick={handleCreate} isLoading={createMut.isPending} disabled={!newSlug || !newName}>{tCommon('save')}</Button>
          </>
        )}
      >
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">{t('label_slug')} *</label>
                <input value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder={t('placeholder_slug')} className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">{t('label_name')} *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('placeholder_name')} className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">{t('label_plan')}</label>
                <select value={newPlan} onChange={(e) => setNewPlan(e.target.value as TenantPlan)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="free">{t('plan_free')}</option>
                  <option value="starter">{t('plan_starter')}</option>
                  <option value="pro">{t('plan_pro')}</option>
                  <option value="enterprise">{t('plan_enterprise')}</option>
                </select>
              </div>
            </div>
            {(formError || createMut.error) && <p className="text-xs text-destructive mt-2">{formError ?? (createMut.error as Error).message}</p>}
      </Modal>

      {/* ═══ Suspend Dialog ══════════════════════════════════════ */}
      <Modal
        open={Boolean(suspendTarget)}
        onClose={() => { setSuspendTarget(null); setSuspendReason(''); }}
        title={t('dialog_suspend_title')}
        description={suspendTarget ? t('dialog_suspend_desc', { name: suspendTarget.name }) : undefined}
        maxWidth="sm"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => { setSuspendTarget(null); setSuspendReason(''); }}>{tCommon('cancel')}</Button>
            <Button variant="destructive" size="sm" onClick={handleSuspend} isLoading={suspendMut.isPending} disabled={!suspendReason.trim()}>{t('tooltip_suspend')}</Button>
          </>
        )}
      >
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">{t('label_reason')} *</label>
              <input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={t('placeholder_reason')} className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
      </Modal>

      {/* ═══ Delete Dialog ═══════════════════════════════════════ */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t('dialog_delete_title')}
        description={deleteTarget ? t('dialog_delete_desc', { name: deleteTarget.name }) : undefined}
        maxWidth="sm"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>{tCommon('cancel')}</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} isLoading={deleteMut.isPending}>{tCommon('delete')}</Button>
          </>
        )}
      >
        <p className="text-sm text-destructive">{t('delete_warning')}</p>
      </Modal>
    </div>
  );
}

// ── Resource Usage Bar ───────────────────────────────────────────
function ResourceBar({ current, max, pct, formatFn }: {
  current: number; max: number; pct: number; formatFn?: ((n: number) => string) | undefined;
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
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(safePct, 100)}%` }} />
      </div>
    </div>
  );
}

// ── Shared tenant usage computation ─────────────────────────────
function getTenantUsage(t_item: Tenant) {
  const planKey = (t_item.plan ?? 'free') as TenantPlan;
  const statusKey = (t_item.status ?? 'active') as TenantStatus;
  const usage = t_item as Tenant & { current_users?: number | null; current_courses?: number | null; current_storage_bytes?: number | null };
  const currentUsers = Number(usage.current_users ?? 0);
  const currentCourses = Number(usage.current_courses ?? 0);
  const currentStorageBytes = Number(usage.current_storage_bytes ?? 0);
  return {
    planKey,
    statusKey,
    plan: PLAN_CONFIG[planKey] ?? PLAN_CONFIG.free,
    status: STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.active,
    currentUsers,
    currentCourses,
    currentStorageBytes,
    userPct: t_item.max_users > 0 ? (currentUsers / t_item.max_users) * 100 : 0,
    coursePct: t_item.max_courses > 0 ? (currentCourses / t_item.max_courses) * 100 : 0,
    storagePct: t_item.max_storage_bytes > 0 ? (currentStorageBytes / t_item.max_storage_bytes) * 100 : 0,
  };
}

// ── Desktop row (≥md) ────────────────────────────────────────────
function TenantRow({
  tenant,
  onOpen,
  onSuspend,
  onDelete,
}: {
  tenant: Tenant;
  onOpen: () => void;
  onSuspend: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('tenants');
  const u = getTenantUsage(tenant);

  return (
    <tr onClick={onOpen} className="hover:bg-muted/30 transition-colors cursor-pointer group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            <Business className="text-base" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">{tenant.name}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{tenant.slug}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn('px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase', u.plan.bg, u.plan.text)}>
          {t(`plan_${u.planKey}` as 'plan_free' | 'plan_starter' | 'plan_pro' | 'plan_enterprise')}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border', u.status.bg, u.status.text)}>
          <div className={cn('h-1.5 w-1.5 rounded-full', u.status.dot)} />
          {t(`status_${u.statusKey}` as 'status_active' | 'status_suspended' | 'status_deleted')}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{tenant.region_id}</td>
      <td className="px-4 py-3">
        <ResourceBar current={u.currentUsers} max={tenant.max_users} pct={u.userPct} />
      </td>
      <td className="px-4 py-3">
        <ResourceBar current={u.currentCourses} max={tenant.max_courses} pct={u.coursePct} />
      </td>
      <td className="px-4 py-3">
        <ResourceBar current={u.currentStorageBytes} max={tenant.max_storage_bytes} pct={u.storagePct} formatFn={formatBytes} />
      </td>
      <td className="px-4 py-3 text-end" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onOpen}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={t('tooltip_edit')}
            aria-label={t('tooltip_edit')}
          >
            <Edit className="text-sm" />
          </button>
          {tenant.status === 'active' && (
            <button
              type="button"
              onClick={onSuspend}
              className="p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              title={t('tooltip_suspend')}
              aria-label={t('tooltip_suspend')}
            >
              <Block className="text-sm" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title={t('tooltip_delete')}
            aria-label={t('tooltip_delete')}
          >
            <Delete className="text-sm" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Mobile card (<md) — name/plan/status + 3 resource bars ──────
function TenantCard({
  tenant,
  onOpen,
  onSuspend,
  onDelete,
}: {
  tenant: Tenant;
  onOpen: () => void;
  onSuspend: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('tenants');
  const u = getTenantUsage(tenant);

  return (
    <div onClick={onOpen} className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          <Business className="text-base" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-foreground truncate min-w-0">{tenant.name}</p>
            <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={onOpen}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title={t('tooltip_edit')}
                aria-label={t('tooltip_edit')}
              >
                <Edit className="text-sm" />
              </button>
              {tenant.status === 'active' && (
                <button
                  type="button"
                  onClick={onSuspend}
                  className="p-2 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                  title={t('tooltip_suspend')}
                  aria-label={t('tooltip_suspend')}
                >
                  <Block className="text-sm" />
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title={t('tooltip_delete')}
                aria-label={t('tooltip_delete')}
              >
                <Delete className="text-sm" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{tenant.slug}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn('px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase', u.plan.bg, u.plan.text)}>
              {t(`plan_${u.planKey}` as 'plan_free' | 'plan_starter' | 'plan_pro' | 'plan_enterprise')}
            </span>
            <div className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border', u.status.bg, u.status.text)}>
              <div className={cn('h-1.5 w-1.5 rounded-full', u.status.dot)} />
              {t(`status_${u.statusKey}` as 'status_active' | 'status_suspended' | 'status_deleted')}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{tenant.region_id}</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 mt-2.5" onClick={(e) => e.stopPropagation()}>
            <ResourceBar current={u.currentUsers} max={tenant.max_users} pct={u.userPct} />
            <ResourceBar current={u.currentCourses} max={tenant.max_courses} pct={u.coursePct} />
            <ResourceBar current={u.currentStorageBytes} max={tenant.max_storage_bytes} pct={u.storagePct} formatFn={formatBytes} />
          </div>
        </div>
      </div>
    </div>
  );
}
