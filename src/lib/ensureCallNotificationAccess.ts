/**
 * Truecaller / Moto fallback: ask once to enable Notification access so we
 * can read the caller number from the dialer notification when CallLog is empty.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';

interface DevicePrefsNotifAccess {
  isNotificationAccessEnabled(): Promise<{ enabled: boolean }>;
  openNotificationAccessSettings(): Promise<void>;
}

const DevicePrefs = registerPlugin<DevicePrefsNotifAccess>('DevicePrefs');

const PROMPT_KEY = 'hro_tech_notif_access_prompted_v1';

export async function ensureCallNotificationAccessPrompt(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!Capacitor.isPluginAvailable('DevicePrefs')) return;
    const { enabled } = await DevicePrefs.isNotificationAccessEnabled();
    if (enabled) return;
    if (sessionStorage.getItem(PROMPT_KEY) === '1') return;
    sessionStorage.setItem(PROMPT_KEY, '1');

    toast.message('Enable notification access for call alerts', {
      description:
        'Needed on Truecaller phones (e.g. Moto). Turn on HRO Technician in the next screen.',
      duration: 12_000,
      action: {
        label: 'Open settings',
        onClick: () => {
          void DevicePrefs.openNotificationAccessSettings().catch(() => {
            toast.error('Could not open settings — enable Notification access manually');
          });
        },
      },
    });
  } catch {
    /* old APK / plugin missing */
  }
}
