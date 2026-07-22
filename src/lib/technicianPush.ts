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
import { getNativeDeviceLabel, syncDevicePrefsToNative } from '@/lib/devicePrefs';

let listenersAttached = false;
let nativeListenerAttached = false;
let activeTechnicianId: string | null = null;
let lastToken: string | null = null;
let lastPersistedKey: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retriesScheduled = 0;
let registerInFlight: Promise<void> | null = null;

const TOKEN_CACHE_KEY = 'hro_tech_push_token_v1';
const PERSIST_KEY = 'hro_tech_push_persist_v2';
const MAX_RETRIES = 6;

type TechPushPersist = {
  token: string;
  technicianId: string;
  callAlertsEnabled: boolean;
};

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

async function saveToken(technicianId: string, token: string): Promise<boolean> {
  const key = persistKey(technicianId, token);

  const cached = readPersist();
  if (cached?.token === token && cached.technicianId === technicianId) {
    // Always re-fetch call-detect (Settings may have toggled it remotely).
    // Do not short-circuit on lastPersistedKey — resume must refresh native prefs.
    lastPersistedKey = key;
    lastToken = token;
    const { data: prefsRow } = await supabase
      .from('technician_push_tokens')
      .select('call_alerts_enabled')
      .eq('token', token)
      .maybeSingle();
    const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
    writePersist({ ...cached, callAlertsEnabled });
    await syncDevicePrefsToNative({ callAlertsEnabled, fcmToken: token });
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

  const deviceLabel = await getNativeDeviceLabel();
  const prior = readPersist();
  const isNewToken = prior?.token !== token;
  const patch: Record<string, string> = {};
  if (deviceLabel) patch.device_model = deviceLabel;
  if (isNewToken || !prior) {
    patch.display_name = registrationDeviceName('technician', token, deviceLabel);
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from('technician_push_tokens').update(patch).eq('token', token);
  }

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

  const { data: prefsRow } = await supabase
    .from('technician_push_tokens')
    .select('call_alerts_enabled')
    .eq('token', token)
    .maybeSingle();

  const callAlertsEnabled = prefsRow?.call_alerts_enabled !== false;
  writePersist({ token, technicianId, callAlertsEnabled });
  lastToken = token;
  lastPersistedKey = key;
  rememberTokenLocally(token);
  await syncDevicePrefsToNative({ callAlertsEnabled, fcmToken: token });
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
  if (!Capacitor.isNativePlatform()) return;
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
  if (!Capacitor.isNativePlatform() || !technicianId) return;
  activeTechnicianId = technicianId;

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

/** Update cached call-detect flag after Settings toggle (same phone). */
export function updateCachedTechnicianCallAlerts(enabled: boolean): void {
  const c = readPersist();
  if (!c) return;
  writePersist({ ...c, callAlertsEnabled: enabled });
}
