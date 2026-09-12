/**
 * FCM push registration for HRO Admin:
 * - Android APK: Capacitor PushNotifications
 * - Browser / iOS Home Screen PWA: Firebase web messaging → same admin_push_tokens table
 *
 * Device Tracker (Settings) mute / per-type prefs apply to both platforms.
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { deliverAdminPushDeepLink } from '@/lib/adminPushDeepLink';
import { registrationDeviceName } from '@/lib/deviceTracker';
import { getNativeDeviceLabel, syncDevicePrefsToNative } from '@/lib/devicePrefs';
import { dismissWhatsAppTrayForPhone } from '@/lib/whatsappInbox';
import { isViewingWhatsAppPhone } from '@/lib/whatsappInboxActivity';
import { getFirebaseApp, isFirebaseConfigured, firebaseWebConfig } from '@/lib/firebase';
import { ensureAdminServiceWorker, isPWAMode } from '@/lib/pwa';

let registered = false;
let webRegistered = false;
let lastToken: string | null = null;
let lastPlatform: 'android' | 'web' | null = null;
let actionListenerAttached = false;
let webMessageListenerAttached = false;
let swClickListenerAttached = false;

/** Persisted registration — survives app restarts until logout or token change. */
const PERSIST_KEY = 'hro_admin_push_persist_v2';

type AdminPushPersist = {
  token: string;
  userId: string;
  callAlertsEnabled: boolean;
  platform?: 'android' | 'web';
};

export type AdminWebPushStatus =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | 'native_app'
        | 'unsupported'
        | 'ios_not_installed'
        | 'permission_denied'
        | 'vapid_missing'
        | 'firebase_missing'
        | 'sw_missing'
        | 'error';
      message: string;
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

function isIosSafariFamily(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

/** Friendly device label for Device Tracker (browser / PWA). */
export function webAdminDeviceLabel(): string {
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua) && !/Edg\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  if (isIosSafariFamily()) return `${browser} · iPhone (Home Screen)`;
  if (/Android/i.test(ua)) return `${browser} · Android`;
  if (/Mac/i.test(ua)) return `${browser} · Mac`;
  if (/Windows/i.test(ua)) return `${browser} · Windows`;
  return `${browser} · Desktop`;
}

/**
 * Best-effort: remove this device's token so a logged-out phone stops
 * receiving admin pushes. Must be called BEFORE the Supabase session is
 * cleared (the delete needs the admin's RLS credentials).
 */
export async function unregisterAdminPushToken(): Promise<void> {
  const token = lastToken || readPersist()?.token;
  const platform = lastPlatform || readPersist()?.platform || null;
  clearPersist();
  lastToken = null;
  lastPlatform = null;

  if (platform === 'web' || (!Capacitor.isNativePlatform() && token)) {
    try {
      const { getMessaging, deleteToken, isSupported } = await import('firebase/messaging');
      if (isFirebaseConfigured() && (await isSupported())) {
        const messaging = getMessaging(getFirebaseApp());
        await deleteToken(messaging).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  if (!token) return;
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

async function saveToken(token: string, platform: 'android' | 'web'): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  lastToken = token;
  lastPlatform = platform;

  // Same device + same admin already registered — skip token upsert, but still
  // refresh call-detect prefs from the server (Settings may have changed them).
  if (isAlreadyPersisted(token, userId)) {
    const { data: prefsRow } = await supabase
      .from('admin_push_tokens')
      .select('call_alerts_enabled')
      .eq('token', token)
      .maybeSingle();
    const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
    const cached = readPersist();
    if (cached) writePersist({ ...cached, callAlertsEnabled, platform });
    if (platform === 'android') {
      await syncDevicePrefsToNative({ callAlertsEnabled });
    }
    return;
  }

  const deviceLabel =
    platform === 'android' ? await getNativeDeviceLabel() : webAdminDeviceLabel();
  const row: Record<string, unknown> = {
    token,
    user_id: userId,
    updated_at: new Date().toISOString(),
    platform,
  };
  if (deviceLabel) row.device_model = deviceLabel;

  const prior = readPersist();
  const isNewToken = prior?.token !== token;
  if (isNewToken || !prior) {
    row.display_name = registrationDeviceName('admin', token, deviceLabel);
  }

  const { error } = await supabase.from('admin_push_tokens').upsert(row);
  if (error) {
    // Older DBs without platform column — retry without it.
    if (String(error.message || '').toLowerCase().includes('platform')) {
      delete row.platform;
      const retry = await supabase.from('admin_push_tokens').upsert(row);
      if (retry.error) return;
    } else {
      return;
    }
  }

  const { data: prefsRow } = await supabase
    .from('admin_push_tokens')
    .select('call_alerts_enabled')
    .eq('token', token)
    .maybeSingle();

  const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
  writePersist({ token, userId, callAlertsEnabled, platform });
  if (platform === 'android') {
    await syncDevicePrefsToNative({ callAlertsEnabled });
  }
}

async function fetchWebVapidKey(): Promise<string | null> {
  const fromEnv = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
  if (fromEnv) return fromEnv;

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (accessToken) {
      const res = await fetch('/.netlify/functions/admin-web-push-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const json = (await res.json()) as { configured?: boolean; vapidKey?: string };
        const key = String(json.vapidKey || '').trim();
        if (json.configured && key) return key;
      }
    }
  } catch {
    /* fall through */
  }
  const { FIREBASE_WEB_VAPID_PUBLIC_KEY } = await import('@/lib/firebase');
  return FIREBASE_WEB_VAPID_PUBLIC_KEY || null;
}

function attachWebClickAndForegroundListeners(): void {
  if (!swClickListenerAttached && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    swClickListenerAttached = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data as { type?: string; data?: Record<string, unknown> } | null;
      if (msg?.type === 'ADMIN_PUSH_CLICK') {
        deliverAdminPushDeepLink(msg.data || {});
      }
    });
  }
}

async function attachWebForegroundListener(): Promise<void> {
  if (webMessageListenerAttached) return;
  if (!isFirebaseConfigured()) return;
  try {
    const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return;
    const messaging = getMessaging(getFirebaseApp());
    webMessageListenerAttached = true;
    onMessage(messaging, (payload) => {
      const data = (payload.data || {}) as Record<string, unknown>;
      const type = String(data.type || '').trim();
      if (type === 'whatsapp_tray_clear') {
        const inbound = String(data.phone || data.phone_e164 || '').replace(/\D/g, '');
        if (inbound) dismissWhatsAppTrayForPhone(inbound);
        return;
      }
      if (type === 'whatsapp_inbound') {
        const inbound = String(data.phone || data.phone_e164 || '').replace(/\D/g, '');
        if (inbound) dismissWhatsAppTrayForPhone(inbound);
        if (isViewingWhatsAppPhone(inbound)) return;
      }
      // Foreground: show a system notification so admins still notice.
      const title =
        payload.notification?.title ||
        String(data.title || '').trim() ||
        'Hydrogen RO';
      const body =
        payload.notification?.body ||
        String(data.body || data.message || '').trim() ||
        '';
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: '/favicon-32x32.png',
            data,
          });
          n.onclick = () => {
            window.focus();
            deliverAdminPushDeepLink(data);
            n.close();
          };
        } catch {
          deliverAdminPushDeepLink(data);
        }
      } else {
        deliverAdminPushDeepLink(data);
      }
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Register this browser / Home Screen PWA for admin FCM web push.
 * Appears in Device Tracker — mute / types work like the Android app.
 */
export async function enableAdminWebPush(): Promise<AdminWebPushStatus> {
  if (Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: 'native_app',
      message: 'This device already uses the Admin app push channel.',
    };
  }

  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'This browser does not support web push.',
    };
  }

  if (isIosSafariFamily() && !isPWAMode()) {
    return {
      ok: false,
      reason: 'ios_not_installed',
      message:
        'On iPhone: Safari → Share → Add to Home Screen, open HRO Admin from that icon, then enable notifications here.',
    };
  }

  if (!isFirebaseConfigured() || !firebaseWebConfig.messagingSenderId) {
    return {
      ok: false,
      reason: 'firebase_missing',
      message: 'Firebase web config is missing (VITE_FIREBASE_*).',
    };
  }

  const vapidKey = await fetchWebVapidKey();
  if (!vapidKey) {
    return {
      ok: false,
      reason: 'vapid_missing',
      message:
        'Web push is not configured yet. Add the Firebase Web Push VAPID key (app_secrets.firebase_web_vapid_key or VITE_FIREBASE_VAPID_KEY).',
    };
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'permission_denied',
      message: 'Notification permission was denied. Enable it in browser / iOS Settings.',
    };
  }

  const registration = await ensureAdminServiceWorker();
  if (!registration) {
    return {
      ok: false,
      reason: 'sw_missing',
      message: 'Could not register the Admin service worker.',
    };
  }

  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) {
      return {
        ok: false,
        reason: 'unsupported',
        message: 'Firebase messaging is not supported in this browser.',
      };
    }
    const messaging = getMessaging(getFirebaseApp());
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      return {
        ok: false,
        reason: 'error',
        message: 'No FCM web token returned.',
      };
    }

    attachWebClickAndForegroundListeners();
    await attachWebForegroundListener();
    await saveToken(token, 'web');
    webRegistered = true;
    return { ok: true, token };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to enable web push';
    return { ok: false, reason: 'error', message };
  }
}

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token once per device. Safe on every dashboard load.
 * Native APK always; web/PWA only refreshes an existing registration (Enable button for first time).
 */
export async function registerAdminPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    // Soft refresh: if this browser already registered, renew token quietly.
    const cached = readPersist();
    if (cached?.platform === 'web' && cached.token) {
      void enableAdminWebPush();
    } else {
      attachWebClickAndForegroundListeners();
    }
    return;
  }

  if (registered) {
    if (lastToken) void saveToken(lastToken, 'android');
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
        void saveToken(token.value, 'android');
      }
    });

    if (!actionListenerAttached) {
      actionListenerAttached = true;
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = (action?.notification?.data || {}) as Record<string, unknown>;
        deliverAdminPushDeepLink(data);
      });
      // App already open: tray still shows (native), but also toast + search chip
      // so the admin sees context without opening the shade.
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = (notification?.data || {}) as Record<string, unknown>;
        const type = String(data.type || '').trim();
        if (type === 'whatsapp_tray_clear') {
          const inbound = String(data.phone || data.phone_e164 || '').replace(/\D/g, '');
          if (inbound) dismissWhatsAppTrayForPhone(inbound);
          return;
        }
        if (type === 'whatsapp_inbound') {
          const inbound = String(data.phone || data.phone_e164 || '').replace(/\D/g, '');
          // App is in the foreground — on-screen toast is enough; drop tray.
          if (inbound) dismissWhatsAppTrayForPhone(inbound);
          if (isViewingWhatsAppPhone(inbound)) return;
        }
        if (
          type === 'tech_call' ||
          type === 'wrong_line_call' ||
          type === 'tech_search' ||
          type === 'whatsapp_inbound'
        ) {
          deliverAdminPushDeepLink(data);
        }
      });
    }

    await PushNotifications.register();

    // FCM may not fire registration again if token unchanged — use cache.
    const cached = readPersist();
    if (cached?.token) {
      lastToken = cached.token;
      void saveToken(cached.token, 'android');
    }
  } catch {
    /* push is best-effort */
  }
}

/** FCM token for this admin device, if already registered (local only). */
export function getThisAdminDeviceToken(): string | null {
  return lastToken || readPersist()?.token || null;
}

export function getThisAdminDevicePlatform(): 'android' | 'web' | null {
  return lastPlatform || readPersist()?.platform || null;
}

/** True when this browser already has a web push registration cached. */
export function isAdminWebPushRegisteredLocally(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  const c = readPersist();
  return Boolean(c?.platform === 'web' && c.token) || webRegistered;
}

/** Update cached call-detect flag after Settings toggle (same phone). */
export function updateCachedAdminCallAlerts(enabled: boolean): void {
  const c = readPersist();
  if (!c) return;
  writePersist({ ...c, callAlertsEnabled: enabled });
}
