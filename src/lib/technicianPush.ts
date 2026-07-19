/**
 * FCM push registration for the technician Android app.
 *
 * Runs on login / app open / resume (native only). Low egress: one RPC per
 * new device token; delayed retries only if FCM hasn't delivered a token yet
 * (max 2 per process). Logout deletes this device's row.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';

let registered = false;
let listenersAttached = false;
let activeTechnicianId: string | null = null;
let lastToken: string | null = null;
/** Avoid re-RPC when startLiveTracking/resume fires repeatedly with the same token. */
let lastPersistedKey: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retriesScheduled = 0;

const TOKEN_CACHE_KEY = 'hro_tech_push_token_v1';
const MAX_TOKEN_RETRIES = 2;

function rememberToken(token: string): void {
  lastToken = token;
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, token);
  } catch {
    // Cache only backs up logout cleanup; ignore storage failures.
  }
}

function readRememberedToken(): string | null {
  if (lastToken) return lastToken;
  try {
    return localStorage.getItem(TOKEN_CACHE_KEY) || null;
  } catch {
    return null;
  }
}

async function saveToken(technicianId: string, token: string): Promise<void> {
  rememberToken(token);

  const persistKey = `${technicianId}::${token}`;
  if (lastPersistedKey === persistKey) return;
  lastPersistedKey = persistKey;

  // Device row keyed by token — this is what the send functions fan out to.
  // SECURITY DEFINER RPC so the row re-binds to the current technician even
  // if another technician used this phone before.
  const { error } = await supabase.rpc('register_technician_push_token', { p_token: token });
  if (error) {
    // Allow a later attempt if RPC failed (e.g. brief offline).
    lastPersistedKey = null;
    console.warn('[tech-push] token table registration failed:', error.message);
  }

  // Legacy single-token column (location pings + older senders).
  const { data } = await supabase
    .from('technician_live_locations')
    .update({ fcm_token: token })
    .eq('technician_id', technicianId)
    .select('technician_id');
  if (!data?.length) {
    await supabase.from('technician_live_locations').insert({
      technician_id: technicianId,
      fcm_token: token,
      is_tracking: false,
    });
  }
}

/**
 * Best-effort: remove this device's token so a logged-out phone stops
 * receiving technician pushes.
 */
export async function unregisterTechnicianPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const token = readRememberedToken();
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
    // Stale rows are pruned server-side when FCM reports the token dead.
  }
}

function scheduleTokenRetry(technicianId: string): void {
  if (retriesScheduled >= MAX_TOKEN_RETRIES || lastToken) return;
  retriesScheduled += 1;
  const delayMs = retriesScheduled === 1 ? 3000 : 12000;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (lastToken || activeTechnicianId !== technicianId) return;
    void registerTechnicianPushToken(technicianId);
  }, delayMs);
}

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token. Safe to call on every app start / login / resume.
 */
export async function registerTechnicianPushToken(technicianId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !technicianId) return;
  activeTechnicianId = technicianId;

  // Warm from local cache after reinstall+same WebView storage — re-bind without
  // waiting for another FCM round-trip when possible.
  if (!lastToken) {
    const cached = readRememberedToken();
    if (cached) lastToken = cached;
  }

  if (lastToken) {
    void saveToken(technicianId, lastToken);
    return;
  }

  if (registered && !lastToken) {
    try {
      await PushNotifications.register();
      scheduleTokenRetry(technicianId);
    } catch {
      /* best-effort */
    }
    return;
  }

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      console.warn('[tech-push] notification permission not granted');
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

    if (!listenersAttached) {
      listenersAttached = true;
      await PushNotifications.addListener('registration', (token) => {
        if (activeTechnicianId && token?.value) {
          void saveToken(activeTechnicianId, token.value);
        }
      });
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[tech-push] FCM registrationError', err);
        registered = false;
        scheduleTokenRetry(technicianId);
      });
    }

    await PushNotifications.register();
    registered = true;
    // FCM token arrives async — one or two light retries if it never lands.
    scheduleTokenRetry(technicianId);
  } catch (err) {
    console.warn('[tech-push] register failed', err);
    registered = false;
    scheduleTokenRetry(technicianId);
  }
}
