'use client';

import { useEffect, useState } from 'react';

import { useUiStore } from '@/adapters/stores/ui.store';

// Breakpoints matching Tailwind md (768px) and lg (1024px)
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useLayout() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < MOBILE_BREAKPOINT;
  const isTablet = windowWidth >= MOBILE_BREAKPOINT && windowWidth < TABLET_BREAKPOINT;
  const isDesktop = windowWidth >= TABLET_BREAKPOINT;

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // Unified Toggle Logic
  const handleToggle = () => {
    toggleSidebar();
  };

  return {
    isMobile,
    isTablet,
    isDesktop,
    sidebarOpen,
    setSidebarOpen,
    handleToggle,
  };
}
