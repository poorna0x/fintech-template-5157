/**
 * Capacitor bridge to admin BiometricAuthPlugin (fingerprint / face / device PIN).
 * No-op / unavailable outside the Admin APK (or old APKs without the plugin).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export type BiometricAvailability = {
  available: boolean;
  biometryEnrolled: boolean;
  status: string;
};

type BiometricAuthPluginApi = {
  isAvailable(): Promise<BiometricAvailability>;
  authenticate(options?: {
    reason?: string;
    title?: string;
    subtitle?: string;
  }): Promise<{ ok: boolean }>;
};

const BiometricAuth = registerPlugin<BiometricAuthPluginApi>('BiometricAuth');

export function isBiometricPluginPresent(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BiometricAuth')
    );
  } catch {
    return false;
  }
}

export async function checkBiometricAvailable(): Promise<BiometricAvailability> {
  if (!isBiometricPluginPresent()) {
    return { available: false, biometryEnrolled: false, status: 'no_plugin' };
  }
  try {
    return await BiometricAuth.isAvailable();
  } catch {
    return { available: false, biometryEnrolled: false, status: 'error' };
  }
}

export async function promptBiometricUnlock(options?: {
  reason?: string;
  title?: string;
  subtitle?: string;
}): Promise<'ok' | 'canceled' | 'failed'> {
  if (!isBiometricPluginPresent()) return 'failed';
  try {
    await BiometricAuth.authenticate({
      title: options?.title || 'Unlock Admin',
      reason: options?.reason || 'Confirm it is you',
      subtitle: options?.subtitle || options?.reason || 'Confirm it is you',
    });
    return 'ok';
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code || '')
        : '';
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: string }).message || '')
        : String(err || '');
    if (code === 'canceled' || /cancel/i.test(message)) return 'canceled';
    return 'failed';
  }
}
