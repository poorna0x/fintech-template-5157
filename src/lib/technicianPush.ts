/**
 * FCM push registration for the technician Android app.
 *
 * Runs on login / app open / resume (native only). Low egress: one successful
 * RPC per device token; retries only when FCM/auth save fails.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';

let listenersAttached = false;
let activeTechnicianId: string | null = null;
let lastToken: string | null = null;
/** Only set after a successful server save — avoids treating a failed upload as done. */
let lastPersistedKey: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retriesScheduled = 0;
let registerInFlight: Promise<void> | null = null;

const TOKEN_CACHE_KEY = 'hro_tech_push_token_v1';
const MAX_RETRIES = 4;

function rememberTokenLocally(token: string): void {
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, token);
  } catch {
    /* ignore */
  }
}

function readRememberedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_CACHE_KEY) || null;
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
  const persistKey = `${technicianId}::${token}`;
  if (lastPersistedKey === persistKey) return true;

  // Must be logged in — RPC uses auth.uid() as technician_id.
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

  const { data } = await supabase
    .from('technician_live_locations')
    .update({ fcm_token: token })
    .eq('technician_id', technicianId)
    .select('technician_id');
  if (!data?.length) {
    const { error: insErr } = await supabase.from('technician_live_locations').insert({
      technician_id: technicianId,
      fcm_token: token,
      is_tracking: false,
    });
    if (insErr) {
      // Row may already exist — update path race; ignore unique violations.
      console.warn('[tech-push] live_locations insert:', insErr.message);
    }
  }

  lastToken = token;
  lastPersistedKey = persistKey;
  rememberTokenLocally(token);
  return true;
}

/**
 * Best-effort: remove this device's token so a logged-out phone stops
 * receiving technician pushes.
 */
export async function unregisterTechnicianPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const token = lastToken || readRememberedToken();
  lastToken = null;
  lastPersistedKey = null;
  retriesScheduled = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    localStorage.removeItem(TOKEN_CACHE_KEY);
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
  if (lastPersistedKey?.startsWith(`${technicianId}::`)) return;
  retriesScheduled += 1;
  const delayMs = retriesScheduled === 1 ? 2000 : retriesScheduled === 2 ? 5000 : 12000;
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
    void registerTechnicianPushToken(technicianId);
  }, delayMs);
}

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token. Safe on every app start / login / resume.
 */
export async function registerTechnicianPushToken(technicianId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !technicianId) return;
  activeTechnicianId = technicianId;

  if (registerInFlight) {
    await registerInFlight;
    return;
  }

  registerInFlight = (async () => {
    try {
      // Attach listener BEFORE register() so we never miss the first token.
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
          scheduleRetry(technicianId);
        });
      }

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        console.warn('[tech-push] notification permission not granted:', perm);
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

      // Always ask FCM for a token. Never trust localStorage alone.
      await PushNotifications.register();
      scheduleRetry(technicianId);
    } catch (err) {
      console.warn('[tech-push] register failed', err);
      scheduleRetry(technicianId);
    } finally {
      registerInFlight = null;
    }
  })();

  await registerInFlight;
}
