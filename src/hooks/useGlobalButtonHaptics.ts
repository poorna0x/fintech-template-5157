import { useEffect } from 'react';
import {
  attachIOSHapticOverlay,
  canHaptic,
  hapticTap,
  IOS_INTERACTIVE_SELECTOR,
  isIOS,
} from '@/lib/haptics';
import { initIOSScrollTapGuard } from '@/lib/iosScrollTapGuard';

function isDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('data-disabled') === 'true'
  );
}

function shouldHapticForTarget(target: EventTarget | null): HTMLElement | null {
  const node = target as HTMLElement | null;
  if (!node) return null;
  if (node.closest('[data-haptic-skip]')) return null;
  const el = node.closest(IOS_INTERACTIVE_SELECTOR) as HTMLElement | null;
  if (!el || isDisabled(el)) return null;
  return el;
}

function scanIOSInteractiveElements(root: ParentNode = document.body): void {
  root.querySelectorAll(IOS_INTERACTIVE_SELECTOR).forEach((node) => {
    attachIOSHapticOverlay(node as HTMLElement);
  });
}

/**
 * Android / desktop: one short vibration per button click.
 * iOS: invisible native switch overlays on all interactive targets (buttons, role=button, etc.).
 */
export function useGlobalButtonHaptics(enabled = true): void {
  useEffect(() => {
    if (!enabled || !canHaptic()) return;

    if (isIOS()) {
      const removeScrollGuard = initIOSScrollTapGuard();
      scanIOSInteractiveElements();

      let debounceId: ReturnType<typeof setTimeout> | undefined;
      const observer = new MutationObserver((mutations) => {
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                if (node.matches(IOS_INTERACTIVE_SELECTOR)) {
                  attachIOSHapticOverlay(node);
                }
                scanIOSInteractiveElements(node);
              }
            });
          }
        }, 50);
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        if (debounceId) clearTimeout(debounceId);
        observer.disconnect();
        removeScrollGuard();
      };
    }

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!shouldHapticForTarget(e.target)) return;
      hapticTap();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!shouldHapticForTarget(e.target)) return;
      hapticTap();
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
}
