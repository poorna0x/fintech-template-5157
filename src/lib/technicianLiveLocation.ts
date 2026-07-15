/**
 * Location sharing for the technician Android app (Capacitor wrapper).
 *
 * Lean design: the app itself does nothing while sharing is on — no watcher,
 * no realtime channel, no timers. Admin location requests are answered
 * entirely by the NATIVE push handler (HroMessagingService.java), which
 * receives the FCM data push even when Android has killed the app, grabs a
 * fix and uploads it via the upload-tech-location function.
 *
 * The only JS work happens on the toggle:
 *  - enable: run one brief fix through the background-geolocation plugin
 *    (this triggers the Android permission prompt), upload it as the initial
 *    "last known" position, mark the row is_tracking=true, register FCM.
 *  - disable: mark the row is_tracking=false (the server then refuses pings).
 *
 * On the plain website/PWA `isNativeApp()` is false and none of this runs.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { registerTechnicianPushToken } from '@/lib/technicianPush';

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  time: number | null;
}

interface CallbackError extends Error {
  code?: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position?: Location, error?: CallbackError) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Give up on the enable-time bootstrap fix (and remove its notification) by then. */
const BOOTSTRAP_TIMEOUT_MS = 30_000;

let sharingEnabled = false;
let watcherId: string | null = null;
let watcherTimeout: ReturnType<typeof setTimeout> | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when the "Share location" switch is on. */
export function isLiveTrackingActive(): boolean {
  return sharingEnabled;
}

async function stopWatcherOnly(): Promise<void> {
  if (watcherTimeout) {
    clearTimeout(watcherTimeout);
    watcherTimeout = null;
  }
  const id = watcherId;
  watcherId = null;
  if (id !== null) {
    try {
      await BackgroundGeolocation.removeWatcher({ id });
    } catch {
      // watcher already gone
    }
  }
}

/**
 * One brief fix on enable: triggers the permission prompt and stores an
 * initial position so the admin view isn't empty before the first request.
 */
async function runBootstrapFix(technicianId: string): Promise<boolean> {
  if (watcherId !== null) return true;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'HRO Technician is active',
        backgroundMessage: 'Setting up location sharing…',
        requestPermissions: true,
        stale: true, // a cached fix is fine for the initial position
        distanceFilter: 0,
      },
      (position, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            void stopLiveTracking(technicianId);
            void BackgroundGeolocation.openSettings();
          } else {
            void stopWatcherOnly();
          }
          return;
        }
        if (!position) return;
        void supabase.from('technician_live_locations').upsert(
          {
            technician_id: technicianId,
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            fix_time: position.time ? new Date(position.time).toISOString() : null,
            is_tracking: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'technician_id' }
        );
        void stopWatcherOnly();
      }
    );
    watcherTimeout = setTimeout(() => void stopWatcherOnly(), BOOTSTRAP_TIMEOUT_MS);
    return true;
  } catch {
    watcherId = null;
    return false;
  }
}

/** Enable sharing: permission prompt + initial fix + FCM registration. */
export async function startLiveTracking(technicianId: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (sharingEnabled) return true;

  sharingEnabled = true;

  // Row marks the technician as sharing even before the first fix arrives.
  await supabase
    .from('technician_live_locations')
    .upsert(
      { technician_id: technicianId, is_tracking: true, updated_at: new Date().toISOString() },
      { onConflict: 'technician_id' }
    );

  // Native location requests arrive over FCM, so the token must be registered.
  void registerTechnicianPushToken(technicianId);

  const ok = await runBootstrapFix(technicianId);
  if (!ok) {
    await stopLiveTracking(technicianId);
    return false;
  }
  return true;
}

/** Disable sharing: the server refuses location pings while is_tracking=false. */
export async function stopLiveTracking(technicianId: string): Promise<void> {
  sharingEnabled = false;
  await stopWatcherOnly();

  await supabase
    .from('technician_live_locations')
    .update({ is_tracking: false, updated_at: new Date().toISOString() })
    .eq('technician_id', technicianId);
}
