/**
 * FCM push registration for the technician Android app.
 *
 * Runs once per app start (native only) so the technician receives job
 * assignment notifications even when they never touch the location toggle.
 *
 * Multi-device: the token is upserted into technician_push_tokens (one row
 * per DEVICE, via the register_technician_push_token RPC so a phone that
 * changes hands re-owns its row), so a technician logged in on two phones
 * gets pushes on both. The legacy technician_live_locations.fcm_token column
 * is still written as a fallback for devices/functions that predate the
 * table. Logout deletes this device's row (see unregisterTechnicianPushToken).
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';

let registered = false;
let listenersAttached = false;
let activeTechnicianId: string | null = null;
let lastToken: string | null = null;

const TOKEN_CACHE_KEY = 'hro_tech_push_token_v1';

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

  // Device row keyed by token — this is what the send functions fan out to.
  // SECURITY DEFINER RPC so the row re-binds to the current technician even
  // if another technician used this phone before. Always write (one tiny
  // call per app start): the server deletes rows when FCM reports the token
  // dead, so a local "already saved" cache could leave this phone
  // permanently unregistered after a reinstall.
  const { error } = await supabase.rpc('register_technician_push_token', { p_token: token });
  if (error) {
    // Table/RPC missing (SQL script not run yet) — legacy column still works.
    console.warn('[tech-push] token table registration failed:', error.message);
  }

  // Legacy single-token column (location pings gate on this row's is_tracking;
  // also keeps pushes working until add-technician-push-tokens.sql is run).
  const { data } = await supabase
    .from('technician_live_locations')
    .update({ fcm_token: token })
    .eq('technician_id', technicianId)
    .select('technician_id');
  if (!data?.length) {
    // No row yet — create one without pretending location sharing is on.
    await supabase.from('technician_live_locations').insert({
      technician_id: technicianId,
      fcm_token: token,
      is_tracking: false,
    });
  }
}

/**
 * Best-effort: remove this device's token so a logged-out phone stops
 * receiving technician pushes. Must be called BEFORE the Supabase session
 * is cleared (the delete needs the technician's RLS credentials). Other
 * devices of the same technician are untouched: rows are keyed by token.
 */
export async function unregisterTechnicianPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const token = readRememberedToken();
  if (!token) return;
  try {
    localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    /* ignore */
  }
  try {
    // Don't let a slow network hold up logout.
    await Promise.race([
      Promise.allSettled([
        supabase.from('technician_push_tokens').delete().eq('token', token),
        // Clear the legacy column too so old function versions stop using it.
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

/**
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token. Safe to call on every app start / login.
 */
export async function registerTechnicianPushToken(technicianId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !technicianId) return;
  activeTechnicianId = technicianId;

  // Already have a token on this process — just re-bind ownership for login switches.
  if (lastToken) {
    void saveToken(technicianId, lastToken);
    return;
  }

  // registration() was called earlier but FCM never delivered a token yet —
  // do not early-return forever; allow another register() attempt.
  if (registered && !lastToken) {
    try {
      await PushNotifications.register();
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

    // Location-request pushes are handled natively (HroMessagingService), so
    // the only JS listener needed is the token registration.
    if (!listenersAttached) {
      listenersAttached = true;
      await PushNotifications.addListener('registration', (token) => {
        if (activeTechnicianId && token?.value) {
          void saveToken(activeTechnicianId, token.value);
        }
      });
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn('[tech-push] FCM registrationError', err);
        // Allow a later start/resume to call register() again.
        registered = false;
      });
    }

    await PushNotifications.register();
    registered = true;
  } catch (err) {
    // Push is best-effort; the app works without it.
    console.warn('[tech-push] register failed', err);
    registered = false;
  }
}
