'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useUiStore } from '@/adapters/stores/ui.store';

// Breakpoints matching Tailwind md (768px) and lg (1024px).
// matchMedia (not window.innerWidth) avoids per-pixel resize re-renders —
// components only re-render when they cross a breakpoint.
const MOBILE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';
const DESKTOP_QUERY = '(min-width: 1024px)';

interface LayoutSnapshot {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

// SSR/hydration default: desktop — same assumption the previous
// window.innerWidth state made before mount.
const SERVER_SNAPSHOT: LayoutSnapshot = {
  isMobile: false,
  isTablet: false,
  isDesktop: true,
};

// Cached so getSnapshot returns a stable reference between store updates.
let clientSnapshot: LayoutSnapshot | null = null;

function computeSnapshot(): LayoutSnapshot {
  const isMobile = window.matchMedia(MOBILE_QUERY).matches;
  const isTablet = window.matchMedia(TABLET_QUERY).matches;
  return {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
  };
}

function getLayoutSnapshot(): LayoutSnapshot {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  if (!clientSnapshot) clientSnapshot = computeSnapshot();
  return clientSnapshot;
}

function getServerSnapshot(): LayoutSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribeLayout(callback: () => void): () => void {
  const queries = [MOBILE_QUERY, TABLET_QUERY, DESKTOP_QUERY].map((q) => window.matchMedia(q));
  const handleChange = () => {
    clientSnapshot = computeSnapshot();
    callback();
  };
  queries.forEach((mql) => mql.addEventListener('change', handleChange));
  return () => queries.forEach((mql) => mql.removeEventListener('change', handleChange));
}

export function useLayout() {
  const layout = useSyncExternalStore(
    subscribeLayout,
    getLayoutSnapshot,
    getServerSnapshot,
  );

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // Unified Toggle Logic
  const handleToggle = () => {
    toggleSidebar();
  };

  // Mobile/tablet drawer: close on Escape. The fixed backdrop already blocks
  // background scrolling (it is not a descendant of the main scroller).
  useEffect(() => {
    if (layout.isDesktop || !sidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layout.isDesktop, sidebarOpen, setSidebarOpen]);

  return {
    isMobile: layout.isMobile,
    isTablet: layout.isTablet,
    isDesktop: layout.isDesktop,
    sidebarOpen,
    setSidebarOpen,
    handleToggle,
  };
}
