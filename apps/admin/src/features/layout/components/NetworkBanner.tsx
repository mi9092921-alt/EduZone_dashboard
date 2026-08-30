'use client';

import { WifiOff } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * Banner that appears when the user loses internet connection.
 * Uses window.onLine API.
 */
export function NetworkBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const t = useTranslations('layout');

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    // Initial check
    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 font-medium text-sm shrink-0 border-b border-amber-700/50">
      <WifiOff sx={{ fontSize: 18 }} />
      <span>{t('network.offline')}</span>
    </div>
  );
}
