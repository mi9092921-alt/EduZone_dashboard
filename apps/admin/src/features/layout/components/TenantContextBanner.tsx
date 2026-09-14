'use client';

import { CorporateFare } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { switchTenantAction } from '@/adapters/actions/tenants.actions';
import { queryKeys } from '@/adapters/queries/keys';
import { useActingTenantId, useAuthStore } from '@/adapters/stores/auth.store';
import { useRouter } from '@/i18n/routing';
import { getTenantById } from '@/infrastructure/repos/tenants.service';

/**
 * "Assumed role" style banner (same purpose as AWS/GCP's assumed-role
 * indicator, or Slack's "you're impersonating" bar): a persistent,
 * impossible-to-miss reminder that a super_admin is currently acting on
 * a tenant other than their own, so an edit/delete made in this state is
 * never mistaken for one made on their own institution.
 */
export function TenantContextBanner() {
  const t = useTranslations('layout');
  const actingTenantId = useActingTenantId();
  const setActingTenantId = useAuthStore((s) => s.setActingTenantId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const { data: tenant } = useQuery({
    queryKey: queryKeys.tenants.detail(actingTenantId ?? ''),
    queryFn: () => getTenantById(actingTenantId as string),
    enabled: !!actingTenantId,
    staleTime: 30_000,
  });

  if (!actingTenantId) return null;

  function handleExit() {
    startTransition(async () => {
      await switchTenantAction(null);
      setActingTenantId(null);
      await queryClient.invalidateQueries();
      router.refresh();
    });
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300 font-medium text-sm shrink-0 border-b border-amber-600/30"
    >
      <CorporateFare sx={{ fontSize: 18 }} aria-hidden="true" />
      <span>{t('tenant_switcher.banner', { tenantName: tenant?.name ?? '…' })}</span>
      <button
        onClick={handleExit}
        disabled={isPending}
        className="underline underline-offset-2 font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        {t('tenant_switcher.banner_exit')}
      </button>
    </div>
  );
}
