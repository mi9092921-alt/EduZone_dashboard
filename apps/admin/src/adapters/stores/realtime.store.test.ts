import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { useRealtimeStore, useUnreadAlertCount } from './realtime.store';

describe('realtime.store', () => {
  const initialStore = useRealtimeStore.getState();

  beforeEach(() => {
    useRealtimeStore.setState(initialStore, true);
  });

  it('starts with empty alerts', () => {
    const state = useRealtimeStore.getState();
    expect(state.alerts).toHaveLength(0);
  });

  it('adds alerts and unread count reflects via derived selector', () => {
    useRealtimeStore.getState().addAlert({
      type: 'SECURITY',
      risk: 'high',
      message: 'test',
      timestamp: new Date().toISOString(),
    });

    const state = useRealtimeStore.getState();
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.isRead).toBe(false);

    // unreadCount is a derived selector — use renderHook
    const { result } = renderHook(() => useUnreadAlertCount());
    expect(result.current).toBe(1);
  });

  it('clearAlerts removes all alerts', () => {
    useRealtimeStore.getState().addAlert({ type: 'A', risk: 'low', message: 'A', timestamp: '1' });
    useRealtimeStore.getState().addAlert({ type: 'B', risk: 'medium', message: 'B', timestamp: '2' });

    expect(useRealtimeStore.getState().alerts).toHaveLength(2);

    useRealtimeStore.getState().clearAlerts();
    expect(useRealtimeStore.getState().alerts).toHaveLength(0);
  });

  it('markRead marks a specific alert as read', () => {
    useRealtimeStore.getState().addAlert({ type: 'A', risk: 'low', message: 'A', timestamp: '1' });
    useRealtimeStore.getState().addAlert({ type: 'B', risk: 'medium', message: 'B', timestamp: '2' });

    const state = useRealtimeStore.getState();
    expect(state.alerts).toHaveLength(2);

    const firstId = state.alerts[0]!.id;
    state.markRead(firstId);

    const updated = useRealtimeStore.getState();
    expect(updated.alerts.find((a) => a.id === firstId)?.isRead).toBe(true);
    expect(updated.alerts.find((a) => a.id !== firstId)?.isRead).toBe(false);
  });

  it('markAllRead marks all alerts as read', () => {
    useRealtimeStore.getState().addAlert({ type: 'A', risk: 'low', message: 'A', timestamp: '1' });
    useRealtimeStore.getState().addAlert({ type: 'B', risk: 'medium', message: 'B', timestamp: '2' });

    useRealtimeStore.getState().markAllRead();

    const updated = useRealtimeStore.getState();
    expect(updated.alerts.every((a) => a.isRead)).toBe(true);

    // Derived unread count
    const { result } = renderHook(() => useUnreadAlertCount());
    expect(result.current).toBe(0);
  });

  it('caps alerts at 200 entries', () => {
    for (let i = 0; i < 205; i++) {
      useRealtimeStore.getState().addAlert({
        type: 'A', risk: 'low', message: `alert-${i}`, timestamp: new Date().toISOString(),
      });
    }
    expect(useRealtimeStore.getState().alerts).toHaveLength(200);
  });
});
