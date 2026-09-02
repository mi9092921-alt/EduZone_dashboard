'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { recordCurrentSessionAction } from '@/adapters/actions/session.actions';
import { useAuthStore } from '@/adapters/stores/auth.store';
import { container } from '@/container';
import { clearBrowserSessionId, getBrowserSessionId } from '@/infrastructure/auth/browserSession';
import { checkDashboardAccess } from '@/infrastructure/repos/auth-rpc.service';

/**
 * 1-minute security heartbeat.
 * Checks session validity, token version, and account status.
 * If invalid, triggers a hard logout.
 */
export function useSessionCheck() {
  const { user, logout } = useAuthStore();
  const { supabase } = container;
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const checkSession = async () => {
      try {
        // M11: RPC call lives in infrastructure/repos/auth-rpc.service.ts
        const access = await checkDashboardAccess();
        const accessResult = access.ok ? access.access : undefined;
        const browserSessionId = getBrowserSessionId();
        const sessionResult = browserSessionId
          ? await recordCurrentSessionAction(browserSessionId)
          : { success: true, active: true };

        // Only sign out on explicit denial or explicit version mismatch.
        // If token_version is absent from the JWT (hook not yet configured),
        // both values may be undefined/null — treat that as "no mismatch" to
        // avoid a forced sign-out loop while the hook is being wired up.
        const serverVersion =
          accessResult?.token_version != null ? Number(accessResult.token_version) : undefined;
        const clientVersion =
          user.token_version != null ? Number(user.token_version) : undefined;
        const versionMismatch =
          serverVersion !== undefined &&
          !isNaN(serverVersion) &&
          clientVersion !== undefined &&
          !isNaN(clientVersion) &&
          serverVersion !== clientVersion;

        const sessionInvalidated = !sessionResult.success && sessionResult.active === false;
        const shouldInvalidate =
          !access.ok || !accessResult?.allowed || versionMismatch || sessionInvalidated;

        // Only warn when there's an actual problem; use debug for healthy heartbeats
        const logData = {
          rpcError: access.ok ? null : access.error,
          allowed: accessResult?.allowed,
          serverVersion,
          clientVersion,
          versionMismatch,
          sessionInvalidated,
          shouldInvalidate,
        };

        if (shouldInvalidate) {
          console.warn('[SessionCheck] Session invalidated:', logData);
        } else if (process.env.NODE_ENV === 'development') {
          console.debug('[SessionCheck] OK', logData);
        }

        if (shouldInvalidate) {
          await supabase.auth.signOut();
          clearBrowserSessionId();
          logout();

          if (pathname !== '/login') {
            router.push('/login?reason=session_invalidated');
          }
        }
      } catch (err) {
        console.error('[SessionCheck] Heartbeat failed', err);
      }
    };

    // Initial check is usually handled by AuthProvider, but we set up the interval
    timerRef.current = setInterval(checkSession, 60 * 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, logout, supabase, router, pathname, user?.token_version]);
}
