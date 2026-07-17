import { Capacitor } from '@capacitor/core';

/** True inside Capacitor Android/iOS WebView (APK / native shell). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
