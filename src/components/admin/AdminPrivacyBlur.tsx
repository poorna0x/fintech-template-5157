import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { adminPrivacyChord, ADMIN_PRIVACY_IDLE_MS, isDesktopPrivacyTarget, isMacPrivacyPlatform, readAdminPrivacyBlurEnabled, subscribeAdminPrivacyBlurEnabled } from '@/lib/adminPrivacyBlur';
import { isNativeApp } from '@/lib/isNativeApp';

/** Survives Admin Portal remounts (dashboard ↔ settings). Refresh clears it. */
let privacyBlurred = false;
const privacyListeners = new Set<() => void>();

function setPrivacyBlurred(next: boolean) {
  if (privacyBlurred === next) return;
  privacyBlurred = next;
  if (next) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }
  privacyListeners.forEach((listener) => listener());
}

/**
 * Blurs the admin website in place. Jobs, calls, and live phone updates keep
 * running behind the cover. Desktop only. Command+Shift+L locks on Mac; Control+Shift+L on
 * Windows. U instead of L unlocks. No pointer or key use for 3 minutes locks too.
 */
export function AdminPrivacyBlur() {
  const [blurred, setBlurred] = useState(privacyBlurred);
  const [enabled, setEnabled] = useState(readAdminPrivacyBlurEnabled);

  useEffect(() => subscribeAdminPrivacyBlurEnabled(() => setEnabled(readAdminPrivacyBlurEnabled())), []);

  useEffect(() => {
    const sync = () => setBlurred(privacyBlurred);
    privacyListeners.add(sync);
    const desktop = isDesktopPrivacyTarget({
      nativeApp: isNativeApp(),
      hover: window.matchMedia('(hover: hover)').matches,
      finePointer: window.matchMedia('(pointer: fine)').matches,
    });
    if (!desktop || !enabled) {
      setPrivacyBlurred(false);
      return () => {
        privacyListeners.delete(sync);
      };
    }
    const mac = isMacPrivacyPlatform(navigator.platform || navigator.userAgent || '');

    const onKey = (event: KeyboardEvent) => {
      const chord = adminPrivacyChord(event, mac);
      if (chord === 'lock') {
        event.preventDefault();
        event.stopPropagation();
        setPrivacyBlurred(true);
        return;
      }
      if (chord === 'unlock') {
        event.preventDefault();
        event.stopPropagation();
        setPrivacyBlurred(false);
        return;
      }
      if (!privacyBlurred) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', onKey, true);

    let idleTimer = 0;
    const armIdle = () => {
      window.clearTimeout(idleTimer);
      if (privacyBlurred) return;
      idleTimer = window.setTimeout(() => setPrivacyBlurred(true), ADMIN_PRIVACY_IDLE_MS);
    };
    const onIdleChange = () => armIdle();
    privacyListeners.add(onIdleChange);
    const onActivity = () => {
      if (privacyBlurred) return;
      armIdle();
    };
    let lastMove = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove < 1000) return;
      lastMove = now;
      onActivity();
    };
    const activityOpts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', onActivity, activityOpts);
    window.addEventListener('keydown', onActivity, activityOpts);
    window.addEventListener('wheel', onActivity, activityOpts);
    window.addEventListener('touchstart', onActivity, activityOpts);
    window.addEventListener('pointermove', onMove, activityOpts);
    armIdle();

    return () => {
      privacyListeners.delete(sync);
      privacyListeners.delete(onIdleChange);
      window.clearTimeout(idleTimer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onActivity, activityOpts);
      window.removeEventListener('keydown', onActivity, activityOpts);
      window.removeEventListener('wheel', onActivity, activityOpts);
      window.removeEventListener('touchstart', onActivity, activityOpts);
      window.removeEventListener('pointermove', onMove, activityOpts);
    };
  }, [enabled]);

  if (!blurred || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000]"
      style={{
        backdropFilter: 'blur(48px)',
        WebkitBackdropFilter: 'blur(48px)',
        background: 'transparent',
      }}
      role="presentation"
    />,
    document.body
  );
}
