'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';

interface QueryErrorBannerProps {
  /** True when the underlying React Query hook failed (isError). */
  isError: boolean;
  /** Re-run the failed query (the hook's refetch). */
  refetch: () => Promise<unknown>;
}

/**
 * Launch-audit B5: query failures used to render as an empty "no data" state,
 * which made admins believe their data was lost. Rendered whenever a list
 * query is in the error state, with a retry affordance.
 */
export function QueryErrorBanner({ isError, refetch }: QueryErrorBannerProps) {
  const t = useTranslations('errors');

  if (!isError) return null;

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <div>
        <p className="font-semibold">{t('title')}</p>
        <p className="mt-1 opacity-80">{t('desc')}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
        {t('retry')}
      </Button>
    </div>
  );
}
