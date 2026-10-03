import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { adminPrivacyChord, isMacPrivacyPlatform } from '@/lib/adminPrivacyBlur';

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
 * Blurs the admin website in place. Jobs, calls, and timers keep running
 * behind the cover. Command+Shift+L locks on Mac; Control+Shift+L on Windows.
 * U instead of L unlocks.
 */
export function AdminPrivacyBlur() {
  const [blurred, setBlurred] = useState(privacyBlurred);

  useEffect(() => {
    const sync = () => setBlurred(privacyBlurred);
    privacyListeners.add(sync);
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
    return () => {
      privacyListeners.delete(sync);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

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
