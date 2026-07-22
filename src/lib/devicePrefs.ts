/**
 * Sync per-device call-alert prefs from Supabase to native SharedPreferences.
 * Also persists the registered FCM token so CallAlertReceiver can auth with
 * the same token the server has (ring-time getToken() can race rotations).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceNativePrefs {
  callAlertsEnabled: boolean;
  fcmToken?: string | null;
}

interface DevicePrefsPlugin {
  setPrefs(options: {
    callAlertsEnabled: boolean;
    fcmToken?: string;
  }): Promise<void>;
  getPrefs(): Promise<{ callAlertsEnabled: boolean }>;
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
    const payload: { callAlertsEnabled: boolean; fcmToken?: string } = {
      callAlertsEnabled: prefs.callAlertsEnabled !== false,
    };
    const token = typeof prefs.fcmToken === 'string' ? prefs.fcmToken.trim() : '';
    if (token.length >= 20) payload.fcmToken = token;
    await DevicePrefs.setPrefs(payload);
  } catch {
    // Plugin missing on old APK — call alerts use defaults until APK update.
  }
}
