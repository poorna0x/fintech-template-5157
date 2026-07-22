/**
 * Sync per-device call-alert prefs from Supabase to native SharedPreferences.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceNativePrefs {
  callAlertsEnabled: boolean;
}

interface DevicePrefsPlugin {
  setPrefs(options: { callAlertsEnabled: boolean }): Promise<void>;
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
    await DevicePrefs.setPrefs({
      callAlertsEnabled: prefs.callAlertsEnabled !== false,
    });
  } catch {
    // Plugin missing on old APK — call alerts use defaults until APK update.
  }
}
