/**
 * Sync per-device call-alert prefs from Supabase to native SharedPreferences.
 * Also persists the registered FCM token so CallAlertReceiver can auth with
 * the same token the server has (ring-time getToken() can race rotations).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceNativePrefs {
  callAlertsEnabled: boolean;
  fcmToken?: string | null;
  /** technicians.phone — company calling line, synced once (not polled). */
  companyPhone?: string | null;
}

interface DevicePrefsPlugin {
  setPrefs(options: {
    callAlertsEnabled: boolean;
    fcmToken?: string;
    companyPhone?: string;
  }): Promise<void>;
  setCompanyPhone(options: { phone: string }): Promise<{ companyPhone: string }>;
  getPrefs(): Promise<{ callAlertsEnabled: boolean; companyPhone?: string }>;
  getDeviceLabel(): Promise<{ label: string }>;
}

const DevicePrefs = registerPlugin<DevicePrefsPlugin>('DevicePrefs');

export async function getNativeDeviceLabel(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { label } = await DevicePrefs.getDeviceLabel();
    return typeof label === 'string' && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}

export async function syncDevicePrefsToNative(prefs: DeviceNativePrefs): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const payload: {
      callAlertsEnabled: boolean;
      fcmToken?: string;
      companyPhone?: string;
    } = {
      callAlertsEnabled: prefs.callAlertsEnabled !== false,
    };
    const token = typeof prefs.fcmToken === 'string' ? prefs.fcmToken.trim() : '';
    if (token.length >= 20) payload.fcmToken = token;
    const company =
      typeof prefs.companyPhone === 'string' ? prefs.companyPhone.replace(/\D/g, '') : '';
    if (company.length >= 10) payload.companyPhone = company.slice(-10);
    await DevicePrefs.setPrefs(payload);
  } catch {
    // Plugin missing on old APK — call alerts use defaults until APK update.
  }
}

/** Persist company calling number on the phone once (from technicians.phone). */
export async function syncCompanyPhoneToNative(phone: string | null | undefined): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return;
  try {
    await DevicePrefs.setCompanyPhone({ phone: digits.slice(-10) });
  } catch {
    /* old APK */
  }
}
