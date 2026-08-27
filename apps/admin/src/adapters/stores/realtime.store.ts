'use client';

import { create } from 'zustand';

export interface RealtimeAlert {
  id: string;
  type: string;
  userId?: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  isRead: boolean;
}

interface RealtimeState {
  /** Realtime security alerts */
  alerts: RealtimeAlert[];

  /** Add a new alert */
  addAlert: (alert: Omit<RealtimeAlert, 'id' | 'isRead'>) => void;
  /** Mark an alert as read */
  markRead: (id: string) => void;
  /** Mark all alerts as read */
  markAllRead: () => void;
  /** Clear all alerts */
  clearAlerts: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  alerts: [],

  addAlert: (alert) =>
    set((s) => ({
      alerts: [
        {
          ...alert,
          id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          isRead: false,
        },
        ...s.alerts,
      ].slice(0, 200), // max 200
    })),

  markRead: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, isRead: true } : a)),
    })),

  markAllRead: () =>
    set((s) => ({
      alerts: s.alerts.map((a) => ({ ...a, isRead: true })),
    })),

  clearAlerts: () => set({ alerts: [] }),
}));

// Derived — always consistent, can never desync from the alerts array
export const useUnreadAlertCount = () =>
  useRealtimeStore((s) => s.alerts.filter((a) => !a.isRead).length);
