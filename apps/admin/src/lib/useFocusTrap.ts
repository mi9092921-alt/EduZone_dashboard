'use client';

import * as React from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Traps keyboard focus inside a container while `active` is true — required
 * for any modal/drawer/dialog-style overlay (WCAG 2.4.3 / 2.1.2).
 *
 * - Moves focus into the container as soon as it opens (first focusable
 *   element, falling back to the container itself).
 * - Wraps Tab / Shift+Tab at the edges so focus can never leak to the page
 *   behind the overlay.
 * - Restores focus to whatever was focused before the overlay opened, once
 *   it closes — otherwise keyboard users lose their place in the page.
 * - Invokes `onEscape` on the Escape key, typically to close the overlay.
 *
 * Attach the returned ref to the outermost focusable panel of the overlay
 * (the element that should carry `role="dialog"`/`aria-modal`).
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, onEscape?: () => void) {
  const containerRef = React.useRef<T | null>(null);
  const onEscapeRef = React.useRef(onEscape);
  onEscapeRef.current = onEscape;

  React.useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Defer to let the overlay finish mounting/animating in before we steal focus.
    const raf = requestAnimationFrame(() => {
      const [first] = getFocusable(container);
      (first ?? container).focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const items = getFocusable(container);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return containerRef;
}
