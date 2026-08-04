import { Capacitor } from '@capacitor/core';

/** True inside Capacitor Android/iOS WebView (APK / native shell). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isAndroidWebView(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'android';
  } catch {
    /* UA fallback below */
  }
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Android WebView auto-scrolls focused inputs above the keyboard.
 * Intercept the tap, focus with preventScroll, and never let the page jump.
 */
export function focusAndroidInputWithoutScroll(
  e: { preventDefault(): void; currentTarget: HTMLInputElement },
): void {
  if (!isAndroidWebView()) return;
  e.preventDefault();
  e.currentTarget.focus({ preventScroll: true });
}
