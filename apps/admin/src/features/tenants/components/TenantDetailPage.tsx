'use client';

import {
  Business,
  People,
  School,
  Security,
  Save,
  ArrowBack,
  Block,
  CheckCircle,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useUpdateTenant, useSuspendTenant } from '@/adapters/mutations/tenants.mutations';
import { useTenantDetail, useTenantAuditLogs } from '@/adapters/queries/tenants.queries';
import { Button } from '@/components/ui/Button';
import type { AuditFilters } from '@/domain/types/audit.types';
import type { TenantPlan, UpdateTenantInput } from '@/domain/types/tenant.types';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'users' | 'courses' | 'audit';

type TenantUsage = {
  current_users?: number | null;
  current_courses?: number | null;
  current_storage_bytes?: number | null;
};

const TABS: { id: Tab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'overview', icon: Business, labelKey: 'tab_overview' },
  { id: 'users', icon: People, labelKey: 'tab_users' },
  { id: 'courses', icon: School, labelKey: 'tab_courses' },
  { id: 'audit', icon: Security, labelKey: 'tab_audit' },
];

function normalizeTenantPlan(plan: string): TenantPlan {
  return ['free', 'starter', 'pro', 'enterprise'].includes(plan) ? (plan as TenantPlan) : 'free';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Derives a stable shard number from a region_id string.
 * The tenants table no longer has a shard_id column (removed in v13).
 * This is purely cosmetic — each region maps to a display shard number.
 */
function shardFromRegion(regionId?: string | null): number {
  const map: Record<string, number> = {
    'me-south-1': 1,
    'eu-west-1': 2,
    'us-east-1': 3,
  };
  return regionId ? (map[regionId] ?? 1) : 0;
}

export function TenantDetailPage({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');

  const [tab, setTab] = useState<Tab>('overview');
  const { data: tenant, isLoading } = useTenantDetail(tenantId);
  const updateMut = useUpdateTenant();
  const suspendMut = useSuspendTenant();

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState<TenantPlan>('free');
  const [editMaxUsers, setEditMaxUsers] = useState(0);
  const [editMaxCourses, setEditMaxCourses] = useState(0);
  const [editRegion, setEditRegion] = useState('');

  // Suspend dialog
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const startEditing = () => {
    if (!tenant) return;
    setEditName(tenant.name);
    setEditPlan(normalizeTenantPlan(tenant.plan));
    setEditMaxUsers(tenant.max_users);
    setEditMaxCourses(tenant.max_courses);
    setEditRegion(tenant.region_id);
    setEditing(true);
  };

  const handleSave = async () => {
    const input: UpdateTenantInput = {
      name: editName,
      plan: editPlan,
      max_users: editMaxUsers,
      max_courses: editMaxCourses,
      region_id: editRegion,
    };
    await updateMut.mutateAsync({ id: tenantId, input });
    setEditing(false);
  };

  const handleSuspend = async () => {
    if (!suspendReason) return;
    await suspendMut.mutateAsync({ id: tenantId, reason: suspendReason });
    setShowSuspend(false);
    setSuspendReason('');
  };

  const handleActivate = async () => {
    await updateMut.mutateAsync({ id: tenantId, input: { status: 'active' } });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 w-full bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="text-muted-foreground text-sm">{t('tenant_not_found')}</div>;
  }

  const usage = tenant as typeof tenant & TenantUsage;
  const currentUsers = Number(usage.current_users ?? 0);
  const currentCourses = Number(usage.current_courses ?? 0);
  const currentStorageBytes = Number(usage.current_storage_bytes ?? 0);
  const tenantWithUsage = {
    ...tenant,
    plan: normalizeTenantPlan(tenant.plan),
    current_users: currentUsers,
    current_courses: currentCourses,
    current_storage_bytes: currentStorageBytes,
    // tenants table has no shard_id column (removed in v13 hardening).
    // Derive a stable display shard from region_id so the UI is never blank.
    shard_id: Number(
      (tenant as unknown as Record<string, unknown>).shard_id ??
        (tenant as unknown as Record<string, unknown>).shard_key ??
        shardFromRegion(
          ((tenant as unknown as Record<string, unknown>).data_residency as string | undefined) ??
            tenant.region_id,
        ),
    ),
    data_residency:
      ((tenant as unknown as Record<string, unknown>).data_residency as string | undefined) ??
      tenant.region_id,
  };
  const userPct = tenant.max_users > 0 ? (currentUsers / tenant.max_users) * 100 : 0;
  const coursePct = tenant.max_courses > 0 ? (currentCourses / tenant.max_courses) * 100 : 0;
  const storagePct =
    tenant.max_storage_bytes > 0 ? (currentStorageBytes / tenant.max_storage_bytes) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/tenants')}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowBack className="text-sm text-muted-foreground" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{tenant.name}</h1>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
              {tenant.slug}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('plan_shard_region', {
              plan: t(`plan_${tenant.plan}` as Parameters<typeof t>[0]),
              shard: tenantWithUsage.shard_id,
              region: tenant.region_id,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tenant.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSuspend(true)}
              className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
            >
              <Block className="text-xs" />
              {t('tooltip_suspend')}
            </Button>
          ) : tenant.status === 'suspended' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleActivate}
              isLoading={updateMut.isPending}
              className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            >
              <CheckCircle className="text-xs" />
              {t('btn_activate')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {TABS.map((t_tab) => (
            <button
              key={t_tab.id}
              onClick={() => setTab(t_tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-[1px]',
                tab === t_tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <t_tab.icon className="text-sm" />
              {t(t_tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <OverviewTab
          tenant={tenantWithUsage}
          editing={editing}
          editName={editName}
          editPlan={editPlan}
          editMaxUsers={editMaxUsers}
          editMaxCourses={editMaxCourses}
          editRegion={editRegion}
          onEditName={setEditName}
          onEditPlan={setEditPlan}
          onEditMaxUsers={setEditMaxUsers}
          onEditMaxCourses={setEditMaxCourses}
          onEditRegion={setEditRegion}
          onStartEdit={startEditing}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={updateMut.isPending}
          userPct={userPct}
          coursePct={coursePct}
          storagePct={storagePct}
        />
      )}
      {tab === 'users' && (
        <UsersTab tenantId={tenantId} tenantName={tenant.name} currentUsers={currentUsers} />
      )}
      {tab === 'courses' && (
        <CoursesTab tenantId={tenantId} tenantName={tenant.name} currentCourses={currentCourses} />
      )}
      {tab === 'audit' && <AuditTab tenantId={tenantId} />}

      {/* Suspend Dialog */}
      {showSuspend && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">{t('dialog_suspend_title')}</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {t('dialog_suspend_desc', { name: tenant.name })}
            </p>
            <input
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder={t('placeholder_reason')}
              className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowSuspend(false)}>
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
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────
interface OverviewTabProps {
  tenant: {
    name: string;
    plan: TenantPlan;
    max_users: number;
    max_courses: number;
    max_storage_bytes: number;
    region_id: string;
    current_users: number;
    current_courses: number;
    current_storage_bytes: number;
    status: string;
    created_at: string;
    updated_at: string;
    shard_id: number;
    data_residency: string;
  };
  editing: boolean;
  editName: string;
  editPlan: TenantPlan;
  editMaxUsers: number;
  editMaxCourses: number;
  editRegion: string;
  onEditName: (v: string) => void;
  onEditPlan: (v: TenantPlan) => void;
  onEditMaxUsers: (v: number) => void;
  onEditMaxCourses: (v: number) => void;
  onEditRegion: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  userPct: number;
  coursePct: number;
  storagePct: number;
}

function OverviewTab(props: OverviewTabProps) {
  const { tenant, editing, saving } = props;
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Info */}
      <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">{t('dialog_create_title')}</h3>
          {!editing ? (
            <Button variant="ghost" size="sm" onClick={props.onStartEdit}>
              {t('tooltip_edit')}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={props.onCancel}>
                {tCommon('cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={props.onSave}
                isLoading={saving}
                className="gap-1"
              >
                <Save className="text-xs" /> {tCommon('save')}
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('label_name')} value={editing ? undefined : tenant.name}>
            {editing && (
              <input
                value={props.editName}
                onChange={(e) => props.onEditName(e.target.value)}
                className="h-8 px-2 rounded-lg border text-sm w-full"
              />
            )}
          </Field>
          <Field
            label={t('label_plan')}
            value={editing ? undefined : t(`plan_${tenant.plan}` as Parameters<typeof t>[0])}
          >
            {editing && (
              <select
                value={props.editPlan}
                onChange={(e) => props.onEditPlan(e.target.value as TenantPlan)}
                className="h-8 px-2 rounded-lg border text-sm w-full"
              >
                <option value="free">{t('plan_free')}</option>
                <option value="starter">{t('plan_starter')}</option>
                <option value="pro">{t('plan_pro')}</option>
                <option value="enterprise">{t('plan_enterprise')}</option>
              </select>
            )}
          </Field>
          <Field
            label={t('label_max_users')}
            value={editing ? undefined : String(tenant.max_users)}
          >
            {editing && (
              <input
                type="number"
                value={props.editMaxUsers}
                onChange={(e) => props.onEditMaxUsers(Number(e.target.value))}
                className="h-8 px-2 rounded-lg border text-sm w-full"
              />
            )}
          </Field>
          <Field
            label={t('label_max_courses')}
            value={editing ? undefined : String(tenant.max_courses)}
          >
            {editing && (
              <input
                type="number"
                value={props.editMaxCourses}
                onChange={(e) => props.onEditMaxCourses(Number(e.target.value))}
                className="h-8 px-2 rounded-lg border text-sm w-full"
              />
            )}
          </Field>
          <Field label={t('header_region')} value={editing ? undefined : tenant.region_id}>
            {editing && (
              <input
                value={props.editRegion}
                onChange={(e) => props.onEditRegion(e.target.value)}
                className="h-8 px-2 rounded-lg border text-sm w-full"
              />
            )}
          </Field>
          <Field
            label={t('label_status')}
            value={t(`status_${tenant.status}` as Parameters<typeof t>[0])}
          />
          <Field
            label={t('label_shard')}
            value={tenant.shard_id ? String(tenant.shard_id) : 'N/A'}
          />
          <Field label={t('label_data_residency')} value={tenant.data_residency} />
          <Field
            label={t('label_created')}
            value={new Date(tenant.created_at).toLocaleDateString()}
          />
          <Field
            label={t('label_updated')}
            value={new Date(tenant.updated_at).toLocaleDateString()}
          />
        </div>
      </div>

      {/* Resource Usage */}
      <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-foreground">{t('resource_usage')}</h3>
        <ResourceGauge
          label={t('header_users')}
          current={tenant.current_users}
          max={tenant.max_users}
          pct={props.userPct}
        />
        <ResourceGauge
          label={t('header_courses')}
          current={tenant.current_courses}
          max={tenant.max_courses}
          pct={props.coursePct}
        />
        <ResourceGauge
          label={t('header_storage')}
          current={tenant.current_storage_bytes}
          max={tenant.max_storage_bytes}
          pct={props.storagePct}
          formatFn={formatBytes}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">
        {label}
      </div>
      {children ? (
        children
      ) : (
        <div className="text-sm font-medium text-foreground">{value ?? '—'}</div>
      )}
    </div>
  );
}

function ResourceGauge({
  label,
  current,
  max,
  pct,
  formatFn,
}: {
  label: string;
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
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {fmt(safeCurrent)} / {fmt(safeMax)}{' '}
          <span className="font-bold">({safePct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.min(safePct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Users Tab (placeholder — would reuse UsersTable w/ tenant filter) ─
function UsersTab({
  tenantId: _tenantId,
  tenantName,
  currentUsers,
}: {
  tenantId: string;
  tenantName: string;
  currentUsers: number;
}) {
  const t = useTranslations('tenants');
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
      <People className="text-4xl text-muted-foreground/30 mb-2" />
      <h3 className="text-sm font-bold text-foreground mb-1">
        {(Number.isFinite(currentUsers) ? currentUsers : 0).toLocaleString()} {t('header_users')}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t.rich('scoped_users_desc', {
          link: (chunks) => (
            <span className="text-primary font-semibold cursor-pointer hover:underline">
              {chunks}
            </span>
          ),
        })}
      </p>
      <p className="text-[10px] text-muted-foreground mt-2 font-mono">{tenantName}</p>
    </div>
  );
}

// ── Courses Tab (placeholder) ────────────────────────────────────
function CoursesTab({
  tenantId: _tenantId,
  tenantName,
  currentCourses,
}: {
  tenantId: string;
  tenantName: string;
  currentCourses: number;
}) {
  const t = useTranslations('tenants');
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
      <School className="text-4xl text-muted-foreground/30 mb-2" />
      <h3 className="text-sm font-bold text-foreground mb-1">
        {(Number.isFinite(currentCourses) ? currentCourses : 0).toLocaleString()}{' '}
        {t('header_courses')}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t.rich('scoped_courses_desc', {
          link: (chunks) => (
            <span className="text-primary font-semibold cursor-pointer hover:underline">
              {chunks}
            </span>
          ),
        })}
      </p>
      <p className="text-[10px] text-muted-foreground mt-2 font-mono">{tenantName}</p>
    </div>
  );
}

// ── Audit Tab ────────────────────────────────────────────────────
function AuditTab({ tenantId }: { tenantId: string }) {
  const t = useTranslations('tenants');
  const tAudit = useTranslations('audit');
  const [auditFilters] = useState<AuditFilters>({});
  const [auditPage] = useState(1);
  const { data: auditData, isLoading } = useTenantAuditLogs(tenantId, auditFilters, auditPage, 20);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30 border-b border-border/60">
            <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start">
              {tAudit('header_time')}
            </th>
            <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start">
              {tAudit('header_type')}
            </th>
            <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start">
              {tAudit('header_risk')}
            </th>
            <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start">
              {tAudit('header_user')}
            </th>
            <th className="px-4 py-3 text-[11px] font-extrabold text-foreground/80 uppercase text-start">
              {tAudit('header_details')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-4 py-2">
                    <div className="h-4 w-16 bg-muted rounded" />
                  </td>
                ))}
              </tr>
            ))
          ) : (auditData?.data ?? []).length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                {tAudit('no_logs_found')}
              </td>
            </tr>
          ) : (
            (auditData?.data ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs font-mono font-medium">
                  {tAudit(`activity_types.${log.activity_type}` as Parameters<typeof tAudit>[0])}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase',
                      log.risk_level === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : log.risk_level === 'high'
                          ? 'bg-orange-100 text-orange-700'
                          : log.risk_level === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {tAudit(`risk_levels.${log.risk_level}` as Parameters<typeof tAudit>[0])}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs font-mono text-muted-foreground">
                  {log.user_id?.slice(0, 8) ?? '—'}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                  {JSON.stringify(log.details)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {(auditData?.count ?? 0) > 0 && (
        <div className="px-4 py-3 border-t border-border/50 bg-slate-50/50 text-xs text-muted-foreground">
          {t('total_log_entries', { count: auditData?.count ?? 0 })}
        </div>
      )}
    </div>
  );
}
