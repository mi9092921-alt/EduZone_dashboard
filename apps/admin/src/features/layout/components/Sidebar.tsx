'use client';

import React, { useMemo } from 'react';
import { AdminPanelSettings } from '@mui/icons-material';
import { Zoom } from '@mui/material';

const SIDEBAR_WIDTH = '220px';
const COLLAPSED_WIDTH = '80px';
const MOBILE_DRAWER_CLASS = 'w-[220px]';

interface SidebarContentProps {
  isMobile: boolean;
  role: PrimaryRole | 'guest';
  filteredNav: typeof NAV_ITEMS;
  pathname: string;
  setSidebarOpen: (open: boolean) => void;
  isCollapsed?: boolean;
}

import { ChevronLeft, Menu as MenuIcon } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';

function SidebarInnerContent({
  isMobile,
  role,
  filteredNav,
  pathname,
  setSidebarOpen,
  isCollapsed = false,
}: SidebarContentProps) {
  const t = useTranslations('common');
  const theme = useTheme();
  const isRtl = theme.direction === 'rtl';

  return (
    <div
      style={{ width: isCollapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      className="flex flex-col h-[100dvh] bg-popover border-e border-border/40 transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden"
    >
      {/* BRANDING & CLOSE AREA */}
      <div className={cn("h-16 flex items-center shrink-0 px-4", isCollapsed ? "justify-center" : "justify-between")}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={cn("w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary ring-1 ring-primary/20 transition-all duration-300",
            "hover:-translate-y-[2px] hover:shadow-lg hover:shadow-primary/20", // Glassmorphism & Depth
          )}>
            <AdminPanelSettings fontSize="small" />
          </div>
          {!isCollapsed && (
            <span className="font-semibold tracking-tight text-foreground text-base whitespace-nowrap">EduZone</span>
          )}
        </div>

        {/* Close Button (Hamburger Style) */}
        {!isCollapsed && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/60 transition-colors"
            aria-label={t('close_sidebar')}
          >
            <MenuIcon fontSize="small" />
          </button>
        )}
      </div>

      {/* MAIN NAVIGATION */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto no-scrollbar [--scrollbar-color:transparent] hover:[--scrollbar-color:theme(colors.border/50)] [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-color)] [&::-webkit-scrollbar-thumb]:rounded-full transition-colors duration-300">
        {filteredNav.map((item) => {
          const isActive =
            pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path + '/'));
          const Icon = item.icon;

          const buttonContent = (
            <Link
              key={item.id}
              href={item.path}
              aria-current={isActive ? 'page' : undefined}
              aria-label={isCollapsed ? t(item.label) : undefined}
              onClick={() => isMobile && setSidebarOpen(false)}
              className={cn(
                'group relative flex items-center rounded-lg transition-all duration-200 gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]',
                isCollapsed ? 'justify-center px-0 py-2.5 mx-auto w-10' : 'px-3 py-2.5',
                isActive
                  ? 'bg-muted/60 text-foreground font-medium shadow-sm ring-1 ring-border/50'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {/* Animated Active Indicator */}
              <div 
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-1 bg-primary rounded-full transition-all duration-300 pointer-events-none",
                  isActive ? "h-1/2 opacity-100" : "h-0 opacity-0",
                  isRtl ? "right-[2px]" : "left-[2px]"
                )} 
              />

              <Icon
                fontSize="small"
                className={cn(
                  'shrink-0 transition-transform duration-300 group-hover:scale-[1.15]',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              {!isCollapsed && (
                <span className="text-sm truncate">{t(item.label)}</span>
              )}
            </Link>
          );

          return isCollapsed ? (
            <Tooltip 
              key={item.id} 
              title={t(item.label)} 
              placement={isRtl ? "left" : "right"} 
              arrow 
              TransitionComponent={Zoom as any}
            >
              <div>{buttonContent}</div>
            </Tooltip>
          ) : buttonContent;
        })}
      </nav>

      {/* FOOTER — User Profile / Role */}
      <div className="p-3 mt-auto shrink-0 mb-2 border-t border-border/40 backdrop-blur-[8px] bg-popover/50">
        <div className={cn("flex items-center hover:bg-muted/40 transition-colors cursor-pointer border border-transparent hover:border-border/40 rounded-lg",
           isCollapsed ? "justify-center p-2" : "justify-between p-2"
        )}>
          {!isCollapsed && (
            <div className="flex-col flex overflow-hidden">
              <p className="text-sm font-medium text-foreground capitalize truncate">
                {role.replaceAll('_', ' ')}
              </p>
              <span className="text-xs text-muted-foreground truncate">
                {t('access_level')}
              </span>
            </div>
          )}
          <div className={cn("w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0", isCollapsed && "w-3 h-3")} />
        </div>
      </div>
    </div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { useLayout } from '../hooks/useLayout';

import type { PrimaryRole } from '@/adapters/stores/auth.store';
import { useAuthUser } from '@/adapters/stores/auth.store';
import { NAV_ITEMS } from '@/config/nav.config';
import { usePathname, Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const theme = useTheme();
  const isRtl = theme.direction === 'rtl';
  const { isDesktop, sidebarOpen, setSidebarOpen } = useLayout();

  const user = useAuthUser();
  const role = (user?.primary_role ?? 'guest') as PrimaryRole | 'guest';

  const filteredNav = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(role as PrimaryRole)),
    [role],
  );

  const contentProps: SidebarContentProps = {
    isMobile: !isDesktop, 
    role,
    filteredNav,
    pathname,
    setSidebarOpen,
    isCollapsed: isDesktop && !sidebarOpen,
  };

  return (
    <>
      {/* DESKTOP (Persistent: Expanded or Collapsed state) */}
      {isDesktop && (
        <aside
          className={cn(
            "relative h-[100dvh] z-30 shrink-0 overflow-hidden bg-background border-e border-border/40",
            "transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
            sidebarOpen ? "w-[220px]" : "w-[80px]"
          )}
        >
          <div className="w-[220px] h-full"> 
            <SidebarInnerContent {...contentProps} />
          </div>
        </aside>
      )}

      {/* MOBILE / TABLET (Temporary Drawer overlay) */}
      {!isDesktop && (
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setSidebarOpen(false)}
              />

              {/* Drawer Sheet */}
              <motion.aside
                initial={{ x: isRtl ? '100%' : '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: isRtl ? '100%' : '-100%' }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                className="fixed top-0 bottom-0 start-0 z-50 w-[220px] shadow-2xl overflow-hidden bg-background"
              >
                <div className="w-[220px] h-full absolute top-0 start-0">
                  <SidebarInnerContent {...contentProps} isCollapsed={false} />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      )}
    </>
  );
}