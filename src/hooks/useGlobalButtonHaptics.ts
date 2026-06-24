import { useEffect } from 'react';
import { canHaptic, hapticTap, isIOS } from '@/lib/haptics';

const INTERACTIVE_SELECTOR =
  'button:not([data-haptic-skip]),[role="button"]:not([data-haptic-skip]),a[role="button"]:not([data-haptic-skip])';

function isDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('data-disabled') === 'true'
  );
}

/**
 * Android / desktop: one short vibration per button click.
 * iOS: relies on invisible native switch overlays rendered inside <Button>.
 */
export function useGlobalButtonHaptics(enabled = true): void {
  useEffect(() => {
    if (!enabled || !canHaptic() || isIOS()) return;

    const shouldHapticForTarget = (target: EventTarget | null): HTMLElement | null => {
      const node = target as HTMLElement | null;
      if (!node) return null;
      if (node.closest('[data-haptic-skip]')) return null;
      const el = node.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
      if (!el || isDisabled(el)) return null;
      return el;
    };

    // Single click (capture) — avoids double fire from touchstart + onClick handler.
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
