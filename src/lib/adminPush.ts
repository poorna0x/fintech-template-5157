/**
 * FCM push registration for the HRO Admin Android app.
 *
 * Runs once per app start when the admin dashboard loads inside the native
 * wrapper. Saves the device token to admin_push_tokens so the notify-admins
 * function can push job started/completed alerts to this phone.
 * No-op in the browser.
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

let registered = false;

const TOKEN_CACHE_KEY = 'admin-fcm-token-saved';

async function saveToken(token: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return;

  // FCM tokens rarely rotate; skip the DB write when nothing changed.
  if (localStorage.getItem(TOKEN_CACHE_KEY) === `${userId}:${token}`) return;

  const { error } = await supabase
    .from('admin_push_tokens')
    .upsert({ token, user_id: userId, updated_at: new Date().toISOString() });
  if (!error) localStorage.setItem(TOKEN_CACHE_KEY, `${userId}:${token}`);
}

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token. Safe to call on every admin dashboard load.
 */
export async function registerAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform() || registered) return;
  registered = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    // Channel referenced by job-event pushes (visible name in Android settings).
    await PushNotifications.createChannel({
      id: 'job_alerts',
      name: 'Job alerts',
      description: 'Technician job updates',
      importance: 5,
      visibility: 1,
      vibration: true,
    }).catch(() => {});

    await PushNotifications.addListener('registration', (token) => {
      if (token?.value) void saveToken(token.value);
    });

    await PushNotifications.register();
  } catch {
    // Push is best-effort; the dashboard works without it.
  }
}
