/**
 * Shared admin preference: technician nudges / messages / OTP can optionally
 * also show the draw-over-apps card (requires tech APK + overlay permission).
 * Default is tray notification only.
 */
const KEY = 'hro_tech_push_show_overlay';

export function getTechPushOverlayPref(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setTechPushOverlayPref(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
