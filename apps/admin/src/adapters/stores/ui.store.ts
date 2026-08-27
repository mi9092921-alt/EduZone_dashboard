'use client';

import { create } from 'zustand';

interface UiState {
  /** Sidebar expanded/collapsed (Mobile Drawer) */
  sidebarOpen: boolean;
  /** Sidebar mini state (Desktop) */
  sidebarMini: boolean;
  /** Toggle mobile sidebar */
  toggleSidebar: () => void;
  /** Toggle desktop mini sidebar */
  toggleSidebarMini: () => void;
  /** Set mobile sidebar state directly */
  setSidebarOpen: (open: boolean) => void;
  /** Set desktop mini sidebar state directly */
  setSidebarMini: (mini: boolean) => void;

  /** Active dialog ID stack */
  activeDialogId: string | null;
  /** Open a dialog */
  openDialog: (id: string) => void;
  /** Close the active dialog */
  closeDialog: () => void;

  /** Global network status */
  isOnline: boolean;
  /** Update network status */
  setOnline: (online: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  sidebarMini: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleSidebarMini: () => set((s) => ({ sidebarMini: !s.sidebarMini })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarMini: (sidebarMini) => set({ sidebarMini }),

  activeDialogId: null,
  openDialog: (id) => set({ activeDialogId: id }),
  closeDialog: () => set({ activeDialogId: null }),

  isOnline: true,
  setOnline: (isOnline) => set({ isOnline }),
}));

// ── Derived selectors ──────────────────────────────────────────
export const useSidebarOpen = () => useUiStore((s) => s.sidebarOpen);
export const useSidebarMini = () => useUiStore((s) => s.sidebarMini);
export const useIsOnline = () => useUiStore((s) => s.isOnline);
