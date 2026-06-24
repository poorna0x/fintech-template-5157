import { useEffect, useRef, type MutableRefObject } from 'react';
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
 * Android / desktop: short vibration on button press (user gesture).
 * iOS: relies on invisible native switch overlays rendered inside <Button>.
 */
export function useGlobalButtonHaptics(enabled = true): void {
  const lastHapticAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !canHaptic() || isIOS()) return;

    const shouldHapticForTarget = (target: EventTarget | null): HTMLElement | null => {
      const node = target as HTMLElement | null;
      if (!node) return null;
      const el = node.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
      if (!el || isDisabled(el)) return null;
      return el;
    };

    const fire = () => {
      const now = Date.now();
      if (now - lastHapticAtRef.current < 120) return;
      lastHapticAtRef.current = now;
      hapticTap();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!shouldHapticForTarget(e.target)) return;
      fire();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!shouldHapticForTarget(e.target)) return;
      fire();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!shouldHapticForTarget(e.target)) return;
      fire();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('touchstart', onTouchStart as EventListener, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
}

export function markHapticFired(lastHapticAtRef: MutableRefObject<number>): void {
  lastHapticAtRef.current = Date.now();
}
