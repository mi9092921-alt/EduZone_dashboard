'use client';

import { useSetting } from '@/adapters/queries/settings.queries';
import { Engineering } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

/**
 * Banner that appears when maintenance mode is active.
 * Only shown if the user is NOT a super_admin (who has bypass permissions).
 */
export function MaintenanceBanner() {
  const { data: maintenanceMode } = useSetting('maintenance_mode');
  const t = useTranslations('layout');
  
  const isActive = maintenanceMode === 'true';

  if (!isActive) return null;

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 font-medium text-sm shrink-0 border-b border-primary-foreground/10">
      <Engineering sx={{ fontSize: 18 }} />
      <span>{t('maintenance.active')}</span>
    </div>
  );
}
