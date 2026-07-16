/**
 * FCM push registration for the HRO Admin Android app.
 *
 * Runs on every admin dashboard load inside the native wrapper. Saves the
 * device token to admin_push_tokens so the notify-admins function can push
 * job started/completed alerts to this phone. Every registered device gets
 * every admin push, regardless of which admin account is logged in.
 * No-op in the browser.
 *
 * Also listens for notification taps (pushNotificationActionPerformed) and
 * deep-links into the dashboard job (Completed / Ongoing).
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { deliverAdminPushDeepLink } from '@/lib/adminPushDeepLink';

let registered = false;
let lastToken: string | null = null;
let actionListenerAttached = false;

const CACHE_KEY = 'hro_admin_push_token_v1';
// Re-write the row every 3 days even if unchanged. This self-heals the rare
// case where the server row was removed while the token is still alive,
// without paying for an upsert on every app start.
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function isFreshInCache(token: string, userId: string): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw) as { token?: string; userId?: string; savedAt?: number };
    return (
      c.token === token &&
      c.userId === userId &&
      typeof c.savedAt === 'number' &&
      Date.now() - c.savedAt < CACHE_TTL_MS
    );
  } catch {
    return false;
  }
}

function rememberInCache(token: string, userId: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ token, userId, savedAt: Date.now() }));
  } catch {
    // Cache is an optimization only; ignore storage failures.
  }
}

function readCachedToken(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { token?: string };
    return typeof c.token === 'string' && c.token ? c.token : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort: remove this device's token so a logged-out phone stops
 * receiving admin pushes. Must be called BEFORE the Supabase session is
 * cleared (the delete needs the admin's RLS credentials). Other devices —
 * same email or different — are untouched: rows are keyed by device token.
 */
export async function unregisterAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const token = lastToken || readCachedToken();
  if (!token) return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  try {
    // Don't let a slow network hold up logout.
    await Promise.race([
      supabase.from('admin_push_tokens').delete().eq('token', token),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    // Stale rows are pruned server-side when FCM reports the token dead.
  }
}

/** Session may still be hydrating right after app start; wait briefly. */
async function getUserId(): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id;
    if (userId) return userId;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function saveToken(token: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  // Skip the write when this exact token+user pair was saved recently.
  // Uninstalling the app clears localStorage, so a reinstall (which is when
  // FCM may hand out a new token) always re-registers.
  if (isFreshInCache(token, userId)) return;

  const { error } = await supabase
    .from('admin_push_tokens')
    .upsert({ token, user_id: userId, updated_at: new Date().toISOString() });
  if (!error) rememberInCache(token, userId);
}

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token. Safe to call on every admin dashboard load —
 * repeat calls just re-sync the saved token for the current user (cheap,
 * usually a localStorage check and no network write).
 */
export async function registerAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (registered) {
    // A new dashboard load, possibly after switching admin accounts on the
    // same phone: make sure the row points at the current user.
    if (lastToken) void saveToken(lastToken);
    return;
  }
  registered = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      // Allow a retry on the next dashboard load in case the user grants
      // notification permission from system settings later.
      registered = false;
      return;
    }

    // Legacy channel (kept so old-APK notifications still land somewhere).
    // The real channel is now job_alerts_v2 with the custom sound, created
    // NATIVELY in MainActivity/NotificationChannels — never from JS, because
    // this JS also runs inside old APKs that don't bundle the sound file and
    // a channel created without it would be locked silent forever.
    await PushNotifications.createChannel({
      id: 'job_alerts',
      name: 'Other alerts',
      description: 'Alerts from older app versions',
      importance: 5,
      visibility: 1,
      vibration: true,
    }).catch(() => {});

    await PushNotifications.addListener('registration', (token) => {
      if (token?.value) {
        lastToken = token.value;
        void saveToken(token.value);
      }
    });

    if (!actionListenerAttached) {
      actionListenerAttached = true;
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = (action?.notification?.data || {}) as Record<string, unknown>;
        deliverAdminPushDeepLink(data);
      });
    }

    await PushNotifications.register();
  } catch {
    // Push is best-effort; the dashboard works without it.
  }
}
