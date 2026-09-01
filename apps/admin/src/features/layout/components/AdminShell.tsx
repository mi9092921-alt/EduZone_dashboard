'use client';

import { Lock } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { useLayout } from '../hooks/useLayout';

import { MaintenanceBanner } from './MaintenanceBanner';
import { NetworkBanner } from './NetworkBanner';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

import { useSetting } from '@/adapters/queries/settings.queries';
import { useAuthUser, useAuthLoading } from '@/adapters/stores/auth.store';
import { isRouteAllowed } from '@/config/nav.config';
import { usePathname, useRouter } from '@/i18n/routing';

export function AdminShell({ children }: { children: React.ReactNode }) {
  useLayout();
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const isLoading = useAuthLoading();
  const t = useTranslations('settings');
  const mainRef = useRef<HTMLElement>(null);

  // ── Scroll reset on navigation ──────────────────────────────────
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname]);

  // ── App lock check ──────────────────────────────────────────────
  const { data: appLocked } = useSetting('app_locked');
  const isAppLocked = appLocked === 'true';

  // ── Auth guard + role-based route guard (merged into one effect) ─
  useEffect(() => {
    if (!user && !isLoading) {
      router.replace('/login');
      return;
    }
    if (user && !isRouteAllowed(user.primary_role, pathname)) {
      router.replace('/courses');
    }
  }, [user, isLoading, pathname, router]);

  // Prevent flicker of admin layout during redirect
  if (!user) return null;

  return (
    <div className="flex w-full h-[100dvh] relative overflow-hidden bg-background text-foreground leading-relaxed">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area with fluid margin shift */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden transition-[margin,width,padding] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]">
        {/* Topbar */}
        <Topbar />

        {/* System Health Banners */}
        <NetworkBanner />
        <MaintenanceBanner />

        {/* App Lock Warning Banner */}
        {isAppLocked && (
          <div
            role="alert"
            aria-live="polite"
            className="bg-destructive text-destructive-foreground px-6 py-2 flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300 font-medium text-sm shrink-0"
          >
            <Lock sx={{ fontSize: 18 }} aria-hidden="true" />
            <span>{t('app_lock.banner_locked')}</span>
          </div>
        )}

        {/* Page content wrapper */}
        <main
          ref={mainRef}
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-background"
        >
          <div className="container-faang animate-in fade-in duration-500 pb-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
