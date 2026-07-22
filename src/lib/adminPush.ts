/**
 * FCM push registration for the HRO Admin Android app.
 *
 * Saves the device token once per phone (+ re-save if token or admin account
 * changes). Repeat app opens use localStorage only — no Supabase egress.
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { deliverAdminPushDeepLink } from '@/lib/adminPushDeepLink';
import { registrationDeviceName } from '@/lib/deviceTracker';
import { getNativeDeviceLabel, syncDevicePrefsToNative } from '@/lib/devicePrefs';

let registered = false;
let lastToken: string | null = null;
let actionListenerAttached = false;

/** Persisted registration — survives app restarts until logout or token change. */
const PERSIST_KEY = 'hro_admin_push_persist_v2';

type AdminPushPersist = {
  token: string;
  userId: string;
  callAlertsEnabled: boolean;
};

function readPersist(): AdminPushPersist | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as AdminPushPersist;
    if (!c.token || !c.userId) return null;
    return c;
  } catch {
    return null;
  }
}

function writePersist(data: AdminPushPersist): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function clearPersist(): void {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

function isAlreadyPersisted(token: string, userId: string): boolean {
  const c = readPersist();
  return c?.token === token && c?.userId === userId;
}

/**
 * Best-effort: remove this device's token so a logged-out phone stops
 * receiving admin pushes. Must be called BEFORE the Supabase session is
 * cleared (the delete needs the admin's RLS credentials).
 */
export async function unregisterAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const token = lastToken || readPersist()?.token;
  if (!token) return;
  clearPersist();
  try {
    await Promise.race([
      supabase.from('admin_push_tokens').delete().eq('token', token),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* pruned server-side when stale */
  }
}

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

  // Same phone + same admin already registered — zero Supabase calls.
  if (isAlreadyPersisted(token, userId)) {
    const cached = readPersist();
    if (cached) {
      await syncDevicePrefsToNative({ callAlertsEnabled: cached.callAlertsEnabled });
    }
    return;
  }

  const deviceLabel = await getNativeDeviceLabel();
  const row: Record<string, unknown> = {
    token,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (deviceLabel) row.device_model = deviceLabel;

  const prior = readPersist();
  const isNewToken = prior?.token !== token;
  if (isNewToken || !prior) {
    row.display_name = registrationDeviceName('admin', token, deviceLabel);
  }

  const { error } = await supabase.from('admin_push_tokens').upsert(row);
  if (error) return;

  const { data: prefsRow } = await supabase
    .from('admin_push_tokens')
    .select('call_alerts_enabled')
    .eq('token', token)
    .maybeSingle();

  const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
  writePersist({ token, userId, callAlertsEnabled });
  await syncDevicePrefsToNative({ callAlertsEnabled });
}

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token once per device. Safe on every dashboard load.
 */
export async function registerAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (registered) {
    if (lastToken) void saveToken(lastToken);
    return;
  }
  registered = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      registered = false;
      return;
    }

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

    // FCM may not fire registration again if token unchanged — use cache.
    const cached = readPersist();
    if (cached?.token) {
      lastToken = cached.token;
      void saveToken(cached.token);
    }
  } catch {
    /* push is best-effort */
  }
}
