import { render, screen, act } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useFocusTrap } from './useFocusTrap';

function TrapModal({
  isOpen,
  onEscape,
}: {
  isOpen: boolean;
  onEscape?: () => void;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen, onEscape);

  if (!isOpen) return null;

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1}>
      <button data-testid="first-btn">First</button>
      <input data-testid="input-field" placeholder="test" />
      <button data-testid="last-btn">Last</button>
    </div>
  );
}

describe('useFocusTrap (Accessibility Keyboard Trapping)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentNode;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves focus to the first focusable element inside the trapped container', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    render(<TrapModal isOpen={true} />);

    // flush requestAnimationFrame in useFocusTrap
    act(() => {
      vi.runAllTimers();
    });

    const firstBtn = screen.getByTestId('first-btn');
    expect(document.activeElement).toBe(firstBtn);

    document.body.removeChild(trigger);
  });

  it('invokes onEscape callback when Escape key is pressed', () => {
    const handleEscape = vi.fn();
    render(<TrapModal isOpen={true} onEscape={handleEscape} />);

    act(() => {
      vi.runAllTimers();
    });

    const dialog = screen.getByRole('dialog');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handleEscape).toHaveBeenCalledTimes(1);
  });

  it('wraps focus from last to first element on Tab', () => {
    render(<TrapModal isOpen={true} />);

    act(() => {
      vi.runAllTimers();
    });

    const firstBtn = screen.getByTestId('first-btn');
    const lastBtn = screen.getByTestId('last-btn');

    // Focus last element
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    const dialog = screen.getByRole('dialog');
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstBtn);
  });

  it('wraps focus from first to last element on Shift+Tab', () => {
    render(<TrapModal isOpen={true} />);

    act(() => {
      vi.runAllTimers();
    });

    const firstBtn = screen.getByTestId('first-btn');
    const lastBtn = screen.getByTestId('last-btn');

    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);

    const dialog = screen.getByRole('dialog');
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lastBtn);
  });

  it('restores focus to previously focused trigger when closed', () => {
    function Parent() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="open-btn" onClick={() => setOpen(true)}>Open</button>
          <TrapModal isOpen={open} onEscape={() => setOpen(false)} />
        </div>
      );
    }

    render(<Parent />);
    const openBtn = screen.getByTestId('open-btn');
    openBtn.focus();
    expect(document.activeElement).toBe(openBtn);

    // Open modal
    act(() => {
      openBtn.click();
    });

    // Flush requestAnimationFrame
    act(() => {
      vi.runAllTimers();
    });

    const firstBtn = screen.getByTestId('first-btn');
    expect(document.activeElement).toBe(firstBtn);

    // Close modal by firing Escape
    act(() => {
      const dialog = screen.getByRole('dialog');
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    act(() => {
      vi.runAllTimers();
    });

    // Focus should be restored to openBtn
    expect(document.activeElement).toBe(openBtn);
  });
});
