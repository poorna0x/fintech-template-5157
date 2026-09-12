/**
 * FCM push registration for the technician Android app.
 *
 * Saves once per device (+ re-save if token or technician changes).
 * Repeat app opens use localStorage — no Supabase egress.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';
import { registrationDeviceName } from '@/lib/deviceTracker';
import { getNativeDeviceLabel, syncDevicePrefsToNative, syncCompanyPhoneToNative } from '@/lib/devicePrefs';
import { normalizeTechPushPrefs } from '@/lib/pushNotificationPrefs';
import { toast } from 'sonner';

let listenersAttached = false;
let nativeListenerAttached = false;
let webMessageListenerAttached = false;
let swClickListenerAttached = false;
let activeTechnicianId: string | null = null;
let lastToken: string | null = null;
let lastPersistedKey: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retriesScheduled = 0;
let registerInFlight: Promise<void> | null = null;

const TOKEN_CACHE_KEY = 'hro_tech_push_token_v1';
const PERSIST_KEY = 'hro_tech_push_persist_v2';
const COMPANY_PHONE_KEY = 'hro_tech_company_phone_v1';
const MAX_RETRIES = 6;

type TechPushPersist = {
  token: string;
  technicianId: string;
  callAlertsEnabled: boolean;
  platform?: 'android' | 'web';
};

type CompanyPhoneCache = {
  technicianId: string;
  phone: string;
  /** yyyy-mm-dd IST-ish local — refresh at most once a day */
  day: string;
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readCompanyPhoneCache(): CompanyPhoneCache | null {
  try {
    const raw = localStorage.getItem(COMPANY_PHONE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CompanyPhoneCache;
    if (!c.technicianId || !c.phone) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCompanyPhoneCache(data: CompanyPhoneCache): void {
  try {
    localStorage.setItem(COMPANY_PHONE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Load technicians.phone at most once a day onto the device — not on every call. */
async function syncCompanyPhoneOnce(technicianId: string): Promise<void> {
  const day = todayKey();
  const cached = readCompanyPhoneCache();
  if (
    cached?.technicianId === technicianId &&
    cached.day === day &&
    cached.phone.length >= 10
  ) {
    await syncCompanyPhoneToNative(cached.phone);
    return;
  }

  const { data } = await supabase
    .from('technicians')
    .select('phone')
    .eq('id', technicianId)
    .maybeSingle();
  const phone = String(data?.phone || '').replace(/\D/g, '').slice(-10);
  if (phone.length < 10) return;
  writeCompanyPhoneCache({ technicianId, phone, day });
  await syncCompanyPhoneToNative(phone);
}

declare global {
  interface Window {
    __HRO_NATIVE_FCM_TOKEN?: string;
  }
}

function persistKey(technicianId: string, token: string): string {
  return `${technicianId}::${token}`;
}

function readPersist(): TechPushPersist | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as TechPushPersist;
    if (!c.token || !c.technicianId) return null;
    return c;
  } catch {
    return null;
  }
}

function writePersist(data: TechPushPersist): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
    localStorage.setItem(TOKEN_CACHE_KEY, data.token);
  } catch {
    /* ignore */
  }
}

function clearPersist(): void {
  try {
    localStorage.removeItem(PERSIST_KEY);
    localStorage.removeItem(TOKEN_CACHE_KEY);
    localStorage.removeItem(COMPANY_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

function rememberTokenLocally(token: string): void {
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, token);
  } catch {
    /* ignore */
  }
}

function readRememberedToken(): string | null {
  return readPersist()?.token || localStorage.getItem(TOKEN_CACHE_KEY) || null;
}

function readNativeInjectedToken(): string | null {
  try {
    const t = window.__HRO_NATIVE_FCM_TOKEN;
    return typeof t === 'string' && t.trim().length >= 20 ? t.trim() : null;
  } catch {
    return null;
  }
}

async function waitForSession(maxMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token && data.session.user?.id) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}

async function saveToken(
  technicianId: string,
  token: string,
  platform: 'android' | 'web' = 'android'
): Promise<boolean> {
  const key = persistKey(technicianId, token);

  const cached = readPersist();
  if (cached?.token === token && cached.technicianId === technicianId) {
    // Always re-fetch call-detect (Settings may have toggled it remotely).
    // Do not short-circuit on lastPersistedKey — resume must refresh native prefs.
    lastPersistedKey = key;
    lastToken = token;
    const { data: prefsRow } = await supabase
      .from('technician_push_tokens')
      .select('call_alerts_enabled, push_enabled, push_prefs')
      .eq('token', token)
      .maybeSingle();
    const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
    const pushEnabled = prefsRow?.push_enabled !== false;
    const wrongLineReminderEnabled =
      normalizeTechPushPrefs(prefsRow?.push_prefs).wrong_line !== false;
    writePersist({ ...cached, callAlertsEnabled, platform });
    // Soft refresh can leave DB platform stuck on android — keep web rows marked.
    if (platform === 'web') {
      await supabase
        .from('technician_push_tokens')
        .update({ platform: 'web' })
        .eq('token', token)
        .then(() => undefined)
        .catch(() => undefined);
    }
    if (platform === 'android') {
      await syncDevicePrefsToNative({
        callAlertsEnabled,
        pushEnabled,
        wrongLineReminderEnabled,
        fcmToken: token,
        companyPhone: readCompanyPhoneCache()?.phone,
      });
      void syncCompanyPhoneOnce(technicianId);
    }
    return true;
  }

  const ready = await waitForSession(5000);
  if (!ready) {
    console.warn('[tech-push] no session yet; will retry token save');
    return false;
  }

  const { error } = await supabase.rpc('register_technician_push_token', { p_token: token });
  if (error) {
    console.warn('[tech-push] token table registration failed:', error.message);
    return false;
  }

  const deviceLabel =
    platform === 'android' ? await getNativeDeviceLabel() : webTechnicianDeviceLabel();
  const prior = readPersist();
  const isNewToken = prior?.token !== token;
  const patch: Record<string, string> = { platform };
  if (deviceLabel) patch.device_model = deviceLabel;
  if (isNewToken || !prior) {
    patch.display_name = registrationDeviceName('technician', token, deviceLabel);
  }
  {
    const { error: patchErr } = await supabase
      .from('technician_push_tokens')
      .update(patch)
      .eq('token', token);
    if (patchErr && String(patchErr.message || '').toLowerCase().includes('platform')) {
      delete patch.platform;
      if (Object.keys(patch).length > 0) {
        await supabase.from('technician_push_tokens').update(patch).eq('token', token);
      }
    }
  }

  if (platform === 'android') {
    const { data: locData } = await supabase
      .from('technician_live_locations')
      .update({ fcm_token: token })
      .eq('technician_id', technicianId)
      .select('technician_id');
    if (!locData?.length) {
      await supabase.from('technician_live_locations').insert({
        technician_id: technicianId,
        fcm_token: token,
        is_tracking: false,
      });
    }
  }

  const { data: prefsRow } = await supabase
    .from('technician_push_tokens')
    .select('call_alerts_enabled, push_enabled, push_prefs')
    .eq('token', token)
    .maybeSingle();

  const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
  const pushEnabled = prefsRow?.push_enabled !== false;
  const wrongLineReminderEnabled =
    normalizeTechPushPrefs(prefsRow?.push_prefs).wrong_line !== false;
  writePersist({ token, technicianId, callAlertsEnabled, platform });
  lastToken = token;
  lastPersistedKey = key;
  rememberTokenLocally(token);
  if (platform === 'android') {
    await syncDevicePrefsToNative({
      callAlertsEnabled,
      pushEnabled,
      wrongLineReminderEnabled,
      fcmToken: token,
      companyPhone: readCompanyPhoneCache()?.phone,
    });
    void syncCompanyPhoneOnce(technicianId);
  }
  return true;
}

function trySaveAnyAvailableToken(technicianId: string): void {
  const cached = readPersist();
  if (cached?.technicianId === technicianId && cached.token) {
    void saveToken(technicianId, cached.token);
    return;
  }
  const candidate = lastToken || readNativeInjectedToken() || readRememberedToken();
  if (!candidate) return;
  void saveToken(technicianId, candidate).then((ok) => {
    if (!ok) scheduleRetry(technicianId, candidate);
  });
}

export async function unregisterTechnicianPushToken(): Promise<void> {
  const cached = readPersist();
  const platform = cached?.platform || (Capacitor.isNativePlatform() ? 'android' : 'web');
  const token = lastToken || readRememberedToken() || readNativeInjectedToken();
  lastToken = null;
  lastPersistedKey = null;
  retriesScheduled = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  clearPersist();
  try {
    delete window.__HRO_NATIVE_FCM_TOKEN;
  } catch {
    /* ignore */
  }
  if (platform === 'web' || !Capacitor.isNativePlatform()) {
    try {
      const { getMessaging, deleteToken, isSupported } = await import('firebase/messaging');
      const { getFirebaseApp, isFirebaseConfigured } = await import('@/lib/firebase');
      if (isFirebaseConfigured() && (await isSupported())) {
        await deleteToken(getMessaging(getFirebaseApp())).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
  if (!token) return;
  try {
    await Promise.race([
      Promise.allSettled([
        supabase.from('technician_push_tokens').delete().eq('token', token),
        supabase
          .from('technician_live_locations')
          .update({ fcm_token: null })
          .eq('fcm_token', token),
      ]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* pruned server-side if stale */
  }
}

function scheduleRetry(technicianId: string, pendingToken?: string | null): void {
  if (retriesScheduled >= MAX_RETRIES) return;
  if (pendingToken && lastPersistedKey === persistKey(technicianId, pendingToken)) return;
  retriesScheduled += 1;
  const delayMs =
    retriesScheduled === 1 ? 1500 : retriesScheduled === 2 ? 3000 : retriesScheduled === 3 ? 6000 : 12000;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (activeTechnicianId !== technicianId) return;
    if (pendingToken) {
      void saveToken(technicianId, pendingToken).then((ok) => {
        if (!ok) scheduleRetry(technicianId, pendingToken);
      });
      return;
    }
    trySaveAnyAvailableToken(technicianId);
    void registerTechnicianPushToken(technicianId);
  }, delayMs);
}

export async function registerTechnicianPushToken(technicianId: string): Promise<void> {
  if (!technicianId) return;
  activeTechnicianId = technicianId;

  // Browser / iOS Home Screen: soft-refresh existing web registration only.
  if (!Capacitor.isNativePlatform()) {
    attachWebClickListener();
    void attachWebForegroundListener();
    const cached = readPersist();
    if (cached?.platform === 'web' && cached.token && cached.technicianId === technicianId) {
      void enableTechnicianWebPush(technicianId);
    }
    return;
  }

  if (!nativeListenerAttached && typeof window !== 'undefined') {
    nativeListenerAttached = true;
    window.addEventListener('hro-native-fcm', ((ev: Event) => {
      const detail = (ev as CustomEvent<{ token?: string }>).detail;
      const value = detail?.token || readNativeInjectedToken();
      if (!value || !activeTechnicianId) return;
      void saveToken(activeTechnicianId, value).then((ok) => {
        if (!ok) scheduleRetry(activeTechnicianId!, value);
      });
    }) as EventListener);
  }

  trySaveAnyAvailableToken(technicianId);

  if (registerInFlight) {
    await registerInFlight;
    return;
  }

  registerInFlight = (async () => {
    try {
      if (!listenersAttached) {
        listenersAttached = true;
        await PushNotifications.addListener('registration', (token) => {
          const value = token?.value;
          if (!value || !activeTechnicianId) return;
          void saveToken(activeTechnicianId, value).then((ok) => {
            if (!ok) scheduleRetry(activeTechnicianId!, value);
          });
        });
        await PushNotifications.addListener('registrationError', (err) => {
          console.warn('[tech-push] FCM registrationError', err);
          trySaveAnyAvailableToken(technicianId);
          scheduleRetry(technicianId);
        });
      }

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        trySaveAnyAvailableToken(technicianId);
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

      await PushNotifications.register();
      window.setTimeout(() => trySaveAnyAvailableToken(technicianId), 800);
    } catch (err) {
      console.warn('[tech-push] register failed', err);
      trySaveAnyAvailableToken(technicianId);
      scheduleRetry(technicianId);
    } finally {
      registerInFlight = null;
    }
  })();

  await registerInFlight;
}

/** FCM token for this technician phone, if already registered (local only). */
export function getThisTechnicianDeviceToken(): string | null {
  return lastToken || readRememberedToken() || readNativeInjectedToken();
}

/** True unless Device Tracker → Detect calls is explicitly off for this phone. */
export function isTechnicianCallDetectEnabled(): boolean {
  const c = readPersist();
  if (!c) return true;
  return c.callAlertsEnabled !== false;
}

/** Update cached call-detect flag after Settings toggle (same phone). */
export function updateCachedTechnicianCallAlerts(enabled: boolean): void {
  const c = readPersist();
  if (!c) return;
  writePersist({ ...c, callAlertsEnabled: enabled });
}

function isIosSafariFamily(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

function webTechnicianDeviceLabel(): string {
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

export type TechnicianWebPushStatus =
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
    /* fall through to public key */
  }
  const { FIREBASE_WEB_VAPID_PUBLIC_KEY } = await import('@/lib/firebase');
  return FIREBASE_WEB_VAPID_PUBLIC_KEY || null;
}

function attachWebClickListener(): void {
  if (!swClickListenerAttached && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    swClickListenerAttached = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data as { type?: string; data?: Record<string, unknown> } | null;
      if (msg?.type === 'TECH_PUSH_CLICK') {
        if (typeof window !== 'undefined') {
          window.focus();
          window.dispatchEvent(
            new CustomEvent('tech-push-clicked', { detail: msg.data || {} })
          );
        }
      }
    });
  }
}

async function attachWebForegroundListener(): Promise<void> {
  if (webMessageListenerAttached) return;
  webMessageListenerAttached = true;
  try {
    const { isFirebaseConfigured, getFirebaseApp } = await import('@/lib/firebase');
    if (!isFirebaseConfigured()) {
      webMessageListenerAttached = false;
      return;
    }
    const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) {
      webMessageListenerAttached = false;
      return;
    }
    const messaging = getMessaging(getFirebaseApp());
    onMessage(messaging, (payload) => {
      const data = (payload.data || {}) as Record<string, unknown>;
      const title =
        payload.notification?.title ||
        String(data.msgTitle || data.title || '').trim() ||
        'Hydrogen RO';
      const body =
        payload.notification?.body ||
        String(data.msgBody || data.body || data.message || '').trim() ||
        '';

      // 1. In-app toast so technician sees it immediately if looking at the app
      if (body) {
        toast.info(title, {
          description: body,
          duration: 9000,
        });
      } else {
        toast.info(title, { duration: 9000 });
      }

      // 2. Play alert sound
      try {
        const audio = new Audio('/whatsapp-alert.wav');
        audio.play().catch(() => {});
      } catch {
        /* audio restrictions */
      }

      // 3. Vibrate device
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          /* ignore */
        }
      }

      // 4. Try browser system notification
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: '/favicon-32x32.png',
            tag: data.tag ? String(data.tag) : undefined,
            data,
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          /* ignore */
        }
      }

      // 5. Notify any listening UI components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tech-push-received', { detail: { ...data, title, body } })
        );
      }
    });
  } catch {
    webMessageListenerAttached = false;
  }
}

/** True when this browser already has a tech web push registration cached. */
export function isTechnicianWebPushRegisteredLocally(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  const c = readPersist();
  return Boolean(c?.platform === 'web' && c.token);
}

/**
 * Register this browser / Home Screen PWA for technician FCM web push.
 * Appears in Device Tracker — mute / types work like the Android app.
 */
export async function enableTechnicianWebPush(
  technicianId: string
): Promise<TechnicianWebPushStatus> {
  if (Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: 'native_app',
      message: 'This device already uses the Technician app push channel.',
    };
  }
  if (!technicianId) {
    return { ok: false, reason: 'error', message: 'Not logged in as a technician.' };
  }
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    if (isIosSafariFamily()) {
      return {
        ok: false,
        reason: 'ios_not_installed',
        message:
          'On iPhone: Safari → Share → Add to Home Screen, open HRO Technician from that icon, then enable notifications.',
      };
    }
    return {
      ok: false,
      reason: 'unsupported',
      message: 'This browser does not support web push.',
    };
  }

  const { isPWAMode, ensureTechnicianServiceWorker } = await import('@/lib/pwa');
  if (isIosSafariFamily() && !isPWAMode()) {
    return {
      ok: false,
      reason: 'ios_not_installed',
      message:
        'On iPhone: Safari → Share → Add to Home Screen, open HRO Technician from that icon, then enable notifications.',
    };
  }

  const { getFirebaseApp, isFirebaseConfigured } = await import('@/lib/firebase');
  if (!isFirebaseConfigured()) {
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
        'Web push is not configured yet. Add the Firebase Web Push VAPID key (app_secrets or VITE_FIREBASE_VAPID_KEY).',
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
      message: 'Notification permission was denied. Enable it in iOS Settings → HRO Technician.',
    };
  }

  const registration = await ensureTechnicianServiceWorker();
  if (!registration) {
    return {
      ok: false,
      reason: 'sw_missing',
      message: 'Could not register the Technician service worker.',
    };
  }
  try {
    await navigator.serviceWorker.ready;
  } catch {
    /* continue — getToken may still work with explicit registration */
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
      return { ok: false, reason: 'error', message: 'No FCM web token returned.' };
    }
    activeTechnicianId = technicianId;
    const ok = await saveToken(technicianId, token, 'web');
    if (!ok) {
      return {
        ok: false,
        reason: 'error',
        message: 'Got a token but could not save it. Try again in a moment.',
      };
    }
    attachWebClickListener();
    void attachWebForegroundListener();
    return { ok: true, token };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to enable web push';
    console.warn('[tech-push] enableTechnicianWebPush failed', message);
    return { ok: false, reason: 'error', message };
  }
}
