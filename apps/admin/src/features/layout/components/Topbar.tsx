'use client';

import {
  Menu as MenuIcon,
  Logout,
  Person,
  DarkMode,
  ChevronRight,
} from '@mui/icons-material';
import {
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { useState } from 'react';

import { useLayout } from '../hooks/useLayout';

import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { TenantSwitcher } from './TenantSwitcher';

import { useAuthUser, useAuthStore, useIsSuperAdmin } from '@/adapters/stores/auth.store';
import { useUiStore } from '@/adapters/stores/ui.store';
import { NAV_ITEMS } from '@/config/nav.config';
import { useRouter, usePathname } from '@/i18n/routing';
import { clearBrowserSessionId } from '@/infrastructure/auth/browserSession';
import { logoutCurrentUser } from '@/infrastructure/repos/auth-rpc.service';
import { createBrowserClient } from '@/infrastructure/supabase/client';
import { cn } from '@/lib/utils';

export function Topbar() {
  const t = useTranslations('common');
  const { sidebarOpen, handleToggle, isDesktop } = useLayout();

  const user = useAuthUser();
  const isSuperAdmin = useIsSuperAdmin();
  const logout = useAuthStore((s) => s.logout);
  const pageSubtitle = useUiStore((s) => s.pageSubtitle);
  const router = useRouter();
  const pathname = usePathname();

  const activeItem = NAV_ITEMS.find((item) =>
    pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path + '/'))
  );
  const pageTitle = activeItem ? t(activeItem.label as Parameters<typeof t>[0]) : t('dashboard');

  // Detect sub-page depth: e.g. /courses/abc-123 → show breadcrumb
  const isSubPage = activeItem && pathname !== activeItem.path;
  const parentLabel = activeItem ? t(activeItem.label as Parameters<typeof t>[0]) : '';

  const locale = useLocale();
  const isRtl = locale === 'ar';

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  async function handleLogout() {
    setAnchorEl(null);
    // M11: RPC call lives in infrastructure/repos/auth-rpc.service.ts
    await logoutCurrentUser();
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    clearBrowserSessionId();
    logout();
    router.replace('/login');
    router.refresh();
  }

  const { resolvedTheme, setTheme } = useTheme();

  const handleThemeToggle = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    setAnchorEl(null);
  };

  const initial = user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <header
      className="sticky top-0 z-[var(--z-header)] w-full border-b border-border/40 bg-popover/80 backdrop-blur-md flex items-center justify-between min-w-0 shrink-0 h-16"
      style={{
        paddingTop: 'env(safe-area-inset-top)'
      }}
    >
      <div className="flex items-center h-full px-3 sm:px-6 gap-3 min-w-0 flex-1">
        {/* Mobile/Tablet Hamburger: Placed at the extreme start (right in RTL) */}
        {!isDesktop && (
          <button
            id="toggle-sidebar"
            onClick={handleToggle}
            aria-label={sidebarOpen ? t('close_sidebar') : t('open_sidebar')}
            className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all flex items-center justify-center shrink-0"
          >
            <MenuIcon fontSize="small" />
          </button>
        )}

        {/* Breadcrumb / Page Title */}
        {isSubPage && pageSubtitle ? (
          <nav aria-label="breadcrumb" className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => activeItem && router.push(activeItem.path as Parameters<typeof router.push>[0])}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 whitespace-nowrap"
            >
              {parentLabel}
            </button>
            <ChevronRight
              className="text-border/70 shrink-0"
              style={{ fontSize: '0.9rem' }}
            />
            <span className="text-sm font-semibold text-foreground truncate max-w-[280px] sm:max-w-[480px] md:max-w-[600px]">
              {pageSubtitle}
            </span>
          </nav>
        ) : (
          <h1 className="text-base font-semibold text-foreground tracking-wide min-w-0 truncate">
            {pageTitle}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 shrink-0">
        {/* Tenant Switcher (super_admin only) */}
        {isSuperAdmin && <TenantSwitcher />}

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Notification Bell */}
        <NotificationBell />

        <div className="hidden sm:block h-5 w-px bg-border/40 mx-1" />

        {/* User avatar + menu */}
        <button
          id="user-menu-button"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={user?.email || 'Account'}
          className="flex items-center gap-2 p-1 rounded-full hover:bg-muted/60 transition-colors ms-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold flex items-center justify-center text-xs ring-1 ring-indigo-500/20">
            {initial}
          </div>
        </button>

        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
          slotProps={{
            paper: {
              className: cn(
                "mt-3 min-w-[240px] rounded-xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150",
              ),
              sx: {
                boxShadow: 'none',
                backgroundImage: 'none',
                backgroundColor: 'hsl(var(--card) / 0.95)',
                backdropFilter: 'blur(12px)',
                color: 'hsl(var(--foreground))',
                '& .MuiList-root': { padding: '6px' },
                zIndex: 9999,
              }
            },
          }}
        >
          <div className="px-3 py-2.5 mb-1.5 rounded-lg bg-muted/40 border border-border/30 mx-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{user?.email}</p>
            <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-tight mt-1">
              {user?.primary_role?.replaceAll('_', ' ')}
            </p>
          </div>

          <MenuItem
            onClick={() => setAnchorEl(null)}
            className="rounded-lg text-sm px-3 py-2.5 hover:bg-muted focus:bg-muted transition-all duration-200"
            sx={{ margin: '2px 6px' }}
          >
            <div className="flex items-center gap-3 w-full">
              <Person fontSize="small" className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">{t('profile')}</span>
            </div>
          </MenuItem>

          <MenuItem
            onClick={handleThemeToggle}
            className="rounded-lg text-sm px-3 py-2.5 hover:bg-muted focus:bg-muted transition-all duration-200"
            sx={{ margin: '2px 6px' }}
          >
            <div className="flex items-center gap-3 w-full">
              <DarkMode fontSize="small" className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">{t('appearance')}</span>
            </div>
          </MenuItem>

          <Divider className="my-1.5 border-border/40 mx-2" />

          <MenuItem
            onClick={handleLogout}
            className="rounded-lg text-sm px-3 py-2.5 hover:bg-red-500/10 focus:bg-red-500/10 transition-all duration-200"
            sx={{ margin: '2px 6px' }}
          >
            <div className="flex items-center gap-3 w-full">
              <Logout fontSize="small" className="text-red-600 dark:text-red-400 shrink-0" />
              <span className="text-sm font-medium text-red-600 dark:text-red-400">{t('logout')}</span>
            </div>
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
}
