/**
 * FCM push registration for the technician Android app.
 *
 * Runs once per app start (native only) so the technician receives job
 * assignment notifications even when they never touch the location toggle.
 * The token is stored on the technician's technician_live_locations row —
 * created with is_tracking=false so token registration never makes the
 * admin view think location sharing is on.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';

let registered = false;
let listenersAttached = false;
let activeTechnicianId: string | null = null;

type LocationRequestHandler = () => void;
let locationRequestHandler: LocationRequestHandler | null = null;

/** technicianLiveLocation.ts registers here to react to silent location pings. */
export function setLocationRequestHandler(handler: LocationRequestHandler | null): void {
  locationRequestHandler = handler;
}

async function saveToken(technicianId: string, token: string): Promise<void> {
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
 * Idempotent: requests notification permission, registers with FCM and
 * saves the device token. Safe to call on every app start / login.
 */
export async function registerTechnicianPushToken(technicianId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !technicianId) return;
  activeTechnicianId = technicianId;
  if (registered) return;

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    // Channel referenced by job-assignment pushes (visible name in Android settings).
    await PushNotifications.createChannel({
      id: 'job_alerts',
      name: 'Job alerts',
      description: 'New job assignments and updates',
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
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        if ((notification?.data as { type?: string })?.type === 'location_request') {
          locationRequestHandler?.();
        }
      });
    }

    await PushNotifications.register();
    registered = true;
  } catch {
    // Push is best-effort; the app works without it.
  }
}
