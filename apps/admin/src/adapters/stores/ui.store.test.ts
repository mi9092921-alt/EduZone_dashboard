import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore, useSidebarOpen, useIsOnline } from './ui.store';

describe('ui.store', () => {
  const initialStore = useUiStore.getState();

  beforeEach(() => {
    useUiStore.setState(initialStore, true);
  });

  it('sidebarOpen starts as false (mobile closed by default)', () => {
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('toggleSidebar flips sidebarOpen', () => {
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('setSidebarOpen sets value directly', () => {
    useUiStore.getState().setSidebarOpen(true);
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    useUiStore.getState().setSidebarOpen(false);
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('sidebarMini starts as false (desktop normal by default)', () => {
    expect(useUiStore.getState().sidebarMini).toBe(false);
  });

  it('toggleSidebarMini flips sidebarMini', () => {
    useUiStore.getState().toggleSidebarMini();
    expect(useUiStore.getState().sidebarMini).toBe(true);
    useUiStore.getState().toggleSidebarMini();
    expect(useUiStore.getState().sidebarMini).toBe(false);
  });

  it('manages dialogs', () => {
    expect(useUiStore.getState().activeDialogId).toBeNull();
    useUiStore.getState().openDialog('test-dialog');
    expect(useUiStore.getState().activeDialogId).toBe('test-dialog');
    useUiStore.getState().closeDialog();
    expect(useUiStore.getState().activeDialogId).toBeNull();
  });

  it('manages online status', () => {
    expect(useUiStore.getState().isOnline).toBe(true);
    useUiStore.getState().setOnline(false);
    expect(useUiStore.getState().isOnline).toBe(false);
    useUiStore.getState().setOnline(true);
    expect(useUiStore.getState().isOnline).toBe(true);
  });
});
