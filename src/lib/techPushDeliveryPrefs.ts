/**
 * Shared admin preference: technician nudges / messages can optionally
 * also show the draw-over-apps card (requires tech APK + overlay permission).
 * Default is tray notification only.
 *
 * Ask OTP uses a separate preference that defaults ON.
 */
const KEY = 'hro_tech_push_show_overlay';
const OTP_KEY = 'hro_otp_push_show_overlay';

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

/** Ask OTP overlay — defaults ON when never set. */
export function getOtpPushOverlayPref(): boolean {
  try {
    const v = localStorage.getItem(OTP_KEY);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export function setOtpPushOverlayPref(enabled: boolean): void {
  try {
    localStorage.setItem(OTP_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
