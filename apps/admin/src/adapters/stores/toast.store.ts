'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

interface ToastState {
  open: boolean;
  message: string;
  severity: ToastSeverity;
  showToast: (message: string, severity?: ToastSeverity) => void;
  hideToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  open: false,
  message: '',
  severity: 'success',
  showToast: (message, severity = 'success') => set({ open: true, message, severity }),
  hideToast: () => set({ open: false }),
}));

// Derived selectors for performance optimization
export const useToast = () =>
  useToastStore(
    useShallow((state) => ({
      showToast: state.showToast,
      hideToast: state.hideToast,
      open: state.open,
      message: state.message,
      severity: state.severity,
    })),
  );
