import { Capacitor } from '@capacitor/core';

/** True inside Capacitor Android/iOS WebView (APK / native shell). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Android WebView scrolls the focused input above the IME, which often
 * jumps the admin dashboard down when tapping customer search. Pin scroll
 * for the keyboard open animation so the page stays put.
 */
export function pinWindowScrollWhileKeyboardOpens(): void {
  if (typeof window === 'undefined') return;
  let isAndroid = /Android/i.test(navigator.userAgent || '');
  try {
    if (Capacitor.isNativePlatform()) isAndroid = Capacitor.getPlatform() === 'android';
  } catch {
    /* keep UA fallback */
  }
  if (!isAndroid) return;

  const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
  const pin = () => {
    const current = window.scrollY ?? document.documentElement.scrollTop ?? 0;
    if (Math.abs(current - y) > 1) window.scrollTo(0, y);
  };

  pin();
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(pin);
  });
  for (const ms of [50, 120, 250, 400]) {
    window.setTimeout(pin, ms);
  }
}
