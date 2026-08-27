'use client';

import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useRouter, usePathname } from '@/i18n/routing';
import { useAuthStore, useAuthUser } from '@/adapters/stores/auth.store';
import { useSessionCheck } from '@/adapters/hooks/useSessionCheck';
import { container } from '@/container';
import { recordCurrentSessionAction } from '@/application/actions/session.actions';
import { clearBrowserSessionId, getBrowserSessionId } from '@/infrastructure/auth/browserSession';

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
    const { supabase } = container;
    let isMounted = true;

    const hydrateAuth = async () => {
      try {
        setLoading(true);
        const { data: { session }, error } = await supabase.auth.getSession();

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
        const { data: accessResult, error: accessError } = await supabase
          .rpc('check_user_access');

        if (accessError) {
          console.error('[AuthProvider] check_user_access RPC failed:', {
            message: accessError.message,
            code: accessError.code,
            details: accessError.details,
            hint: accessError.hint,
          });
          throw accessError;
        }

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

        const permissions = (permissionRows ?? []).map(p => p.permission_name as any);

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
          container.actorId = resolvedUser.id;
          container.tenantId = resolvedUser.tenant_id;

          setUser({
            id: resolvedUser.id,
            email: session.user.email!,
            primary_role: resolvedUser.primary_role as any,
            tenant_id: resolvedUser.tenant_id,
            token_version: resolvedUser.token_version ?? 1,
            permissions,
          });
          setInitialized();
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[AuthProvider] Initialization failed:', {
          message: err?.message || String(err) || 'Unknown error',
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          status: err?.status,
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        container.actorId = '';
        container.tenantId = '';
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
