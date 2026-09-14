'use client';

import { CorporateFare, Check, ExitToApp } from '@mui/icons-material';
import { Menu, MenuItem, Divider, CircularProgress } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { switchTenantAction } from '@/adapters/actions/tenants.actions';
import { queryKeys } from '@/adapters/queries/keys';
import { useAuthUser, useAuthStore, useIsSuperAdmin } from '@/adapters/stores/auth.store';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/routing';
import { getTenants } from '@/infrastructure/repos/tenants.service';

/**
 * Tenant Switcher (super_admin only). Lets super_admin view/manage any
 * active institution instead of just their own home tenant -- the
 * server-side authorization boundary (authorization.service.ts,
 * switch_tenant_context RPC) is what actually enforces this; this
 * component is purely the entry point into that already-secured flow.
 */
export function TenantSwitcher() {
  const t = useTranslations('layout');
  const isSuperAdmin = useIsSuperAdmin();
  const user = useAuthUser();
  const setActingTenantId = useAuthStore((s) => s.setActingTenantId);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const menuOpen = Boolean(anchorEl);

  // Small, fixed page size: institution counts in this product are in the
  // tens, not thousands -- a searchable/paginated picker is a reasonable
  // future enhancement if that stops being true, out of scope here.
  // A plain useQuery (not the shared useTenants hook) so this can stay
  // disabled until the dropdown actually opens -- useTenants has no
  // `enabled` option, and always fetching on every page load for every
  // super_admin, whether or not they ever open this menu, would be
  // wasteful.
  const { data: tenantsPage } = useQuery({
    queryKey: queryKeys.tenants.list({ status: 'active', page: 1, pageSize: 100 }),
    queryFn: () => getTenants({ status: 'active' }, 1, 100),
    enabled: isSuperAdmin && menuOpen,
    staleTime: 30_000,
  });

  if (!isSuperAdmin || !user) return null;

  const homeTenantId = user.tenant_id;
  const actingTenantId = user.acting_tenant_id && user.acting_tenant_id !== homeTenantId
    ? user.acting_tenant_id
    : null;
  const tenants = tenantsPage?.data ?? [];
  const currentTenant = tenants.find((tenant) => tenant.id === (actingTenantId ?? homeTenantId));
  const label = currentTenant?.name ?? (actingTenantId ? '…' : undefined);

  function handleSwitch(tenantId: string | null) {
    setAnchorEl(null);
    startTransition(async () => {
      const result = await switchTenantAction(tenantId);
      setActingTenantId(result.tenantId === homeTenantId ? null : result.tenantId);
      await queryClient.invalidateQueries();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        disabled={isPending}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        className="flex items-center gap-2 px-3 transition-faang max-w-[200px]"
      >
        {isPending ? <CircularProgress size={14} /> : <CorporateFare className="text-sm shrink-0" />}
        <span className="font-medium truncate">{label ?? t('tenant_switcher.label')}</span>
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            className: 'mt-3 min-w-[260px] max-h-[400px] rounded-xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150',
            sx: {
              boxShadow: 'none',
              backgroundImage: 'none',
              backgroundColor: 'hsl(var(--card) / 0.95)',
              backdropFilter: 'blur(12px)',
              color: 'hsl(var(--foreground))',
              '& .MuiList-root': { padding: '6px' },
              zIndex: 9999,
            },
          },
        }}
      >
        {actingTenantId ? (
          <MenuItem
            key="exit-to-home"
            onClick={() => handleSwitch(null)}
            className="rounded-lg text-sm px-3 py-2.5 hover:bg-muted focus:bg-muted transition-all duration-200"
            sx={{ margin: '2px 6px' }}
          >
            <div className="flex items-center gap-3 w-full">
              <ExitToApp fontSize="small" className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">{t('tenant_switcher.exit_to_home')}</span>
            </div>
          </MenuItem>
        ) : null}
        {actingTenantId ? <Divider key="exit-divider" className="my-1.5 border-border/40 mx-2" /> : null}

        {!tenantsPage && (
          <div className="px-3 py-4 flex justify-center">
            <CircularProgress size={20} />
          </div>
        )}

        {tenantsPage && tenants.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {t('tenant_switcher.no_tenants')}
          </div>
        )}

        {tenants.map((tenant) => {
          const isCurrent = tenant.id === (actingTenantId ?? homeTenantId);
          return (
            <MenuItem
              key={tenant.id}
              onClick={() => (tenant.id === homeTenantId ? handleSwitch(null) : handleSwitch(tenant.id))}
              selected={isCurrent}
              className="rounded-lg text-sm px-3 py-2.5 hover:bg-muted focus:bg-muted transition-all duration-200"
              sx={{ margin: '2px 6px' }}
            >
              <div className="flex items-center gap-3 w-full min-w-0">
                <span className="text-sm font-medium text-foreground truncate flex-1">{tenant.name}</span>
                {tenant.id === homeTenantId && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 shrink-0">
                    {t('tenant_switcher.home_badge')}
                  </span>
                )}
                {isCurrent && <Check fontSize="small" className="text-primary shrink-0" />}
              </div>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
