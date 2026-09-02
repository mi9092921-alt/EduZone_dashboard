'use client';

import type { PermissionName } from '@eduzone/types';
import { Box, CircularProgress } from '@mui/material';
import { useEffect } from 'react';

import { recordCurrentSessionAction } from '@/adapters/actions/session.actions';
import { useSessionCheck } from '@/adapters/hooks/useSessionCheck';
import { useAuthStore, useAuthUser, type PrimaryRole } from '@/adapters/stores/auth.store';
import { useRouter, usePathname } from '@/i18n/routing';
import { clearBrowserSessionId, getBrowserSessionId } from '@/infrastructure/auth/browserSession';
import { checkDashboardAccess } from '@/infrastructure/repos/auth-rpc.service';
import { createBrowserClient } from '@/infrastructure/supabase/client';

/**
 * Authentication Provider
 * Manages Supabase session hydration and user state at the root of the application.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthUser();
  const { isInitialized, isLoading, setUser, setInitialized, setLoading, logout } = useAuthStore();

  // Use session check hook to monitor session health (optional but kept as per original)
  useSessionCheck();

  /**
   * Refined Hydration Logic
   */
  useEffect(() => {
    const supabase = createBrowserClient();
    let isMounted = true;

    const hydrateAuth = async () => {
      try {
        setLoading(true);
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        if (!session) {
          if (isMounted) {
            logout();
            setInitialized();
            setLoading(false);
          }
          return;
        }

        // v13: Use the SECURITY DEFINER RPC to bypass RLS token_version validation.
        // Direct SELECT on users fails if JWT lacks token_version/tenant_id custom claims.
        // M11: RPC call lives in infrastructure/repos/auth-rpc.service.ts.
        const access = await checkDashboardAccess();

        if (!access.ok) {
          console.error('[AuthProvider] check_dashboard_access RPC failed:', access.error);
          throw new Error(access.error);
        }

        const accessResult = access.access;

        // RPC returned a valid response but access is denied
        if (!accessResult?.allowed) {
          const reason = accessResult?.reason ?? 'unknown';
          console.warn('[AuthProvider] Access denied:', reason);
          if (isMounted) {
            logout();
            setInitialized();
            setLoading(false);
          }
          return;
        }

        const browserSessionId = getBrowserSessionId();
        if (browserSessionId) {
          const sessionResult = await recordCurrentSessionAction(browserSessionId);
          if (!sessionResult.success && sessionResult.active === false) {
            await supabase.auth.signOut();
            if (isMounted) {
              clearBrowserSessionId();
              logout();
              setInitialized();
              setLoading(false);
            }
            return;
          }
        }

        // Now fetch the minimal user profile fields needed for the store
        const { data: userRecord, error: userError } = await supabase
          .from('users')
          .select('id, primary_role, tenant_id, token_version')
          .eq('id', session.user.id)
          .is('deleted_at', null)
          .maybeSingle();

        // Fetch user permissions from the cache table
        const { data: permissionRows, error: permError } = await supabase
          .from('user_permission_cache')
          .select('permission_name')
          .eq('user_id', session.user.id)
          .eq('tenant_id', userRecord?.tenant_id || accessResult.tenant_id);

        if (permError) {
          console.error('[AuthProvider] Permissions fetch failed:', permError);
        }

        const permissions = ((permissionRows ?? []) as { permission_name: string }[]).map(
          (p) => p.permission_name,
        ) as PermissionName[];

        // Fallback: if RLS still blocks the direct query, build from RPC result
        const resolvedUser = userRecord ?? {
          id: session.user.id,
          primary_role: accessResult.role,
          tenant_id: accessResult.tenant_id,
          token_version: accessResult.token_version ?? 1,
        };

        if (userError && !resolvedUser) {
          console.error('[AuthProvider] User record fetch failed:', userError);
          throw userError;
        }

        if (isMounted) {
          setUser({
            id: resolvedUser.id,
            email: session.user.email!,
            primary_role: resolvedUser.primary_role as PrimaryRole,
            tenant_id: resolvedUser.tenant_id,
            token_version: resolvedUser.token_version ?? 1,
            permissions,
          });
          setInitialized();
          setLoading(false);
        }
      } catch (err: unknown) {
        const errObj = err as {
          message?: string;
          code?: string;
          details?: string;
          hint?: string;
          status?: number;
        } | null;
        console.error('[AuthProvider] Initialization failed:', {
          message: errObj?.message || String(err) || 'Unknown error',
          code: errObj?.code,
          details: errObj?.details,
          hint: errObj?.hint,
          status: errObj?.status,
          raw: JSON.stringify(err),
        });
        if (isMounted) {
          logout();
          setInitialized();
          setLoading(false);
        }
      }
    };

    // 1. Initial Hydration
    hydrateAuth();

    // 2. Auth State Change Listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, _session) => {
      if (event === 'SIGNED_OUT') {
        clearBrowserSessionId();
        logout();

        if (typeof window !== 'undefined') {
          // Attempting clean localized redirect. If it feels sluggish,
          // we use window.location.href for a full state reset.
          console.log('[AuthProvider] SIGNED_OUT detected, redirecting...');
          router.replace('/login');

          // Safety fallback: if URL doesn't change after 1.5s, force it.
          setTimeout(() => {
            if (window.location.pathname.includes('/login')) return;
            const locale = window.location.pathname.split('/')[1] || 'en';
            window.location.href = `/${locale}/login?logout=success`;
          }, 1500);
        }
      } else if (event === 'SIGNED_IN' && !user) {
        hydrateAuth();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setUser, setInitialized, setLoading, logout, router]); // Stable dependencies

  /**
   * Separate side-effect for forcing unauthorized users to login
   */
  useEffect(() => {
    if (isInitialized && !user && !isLoading && pathname !== '/login') {
      router.replace('/login');
    }
  }, [isInitialized, user, isLoading, pathname, router]);

  /**
   * Unified Loading & Protection State
   */
  const isLoginPage = pathname === '/login';
  const shouldShowLoading = (!isInitialized || isLoading) && !isLoginPage;

  if (shouldShowLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          height: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress color="primary" size={48} />
      </Box>
    );
  }

  return <>{children}</>;
}
