/**
 * Location sharing for the technician Android app (Capacitor wrapper).
 *
 * Always on — enabled automatically when the technician dashboard loads in
 * the native app (no toggle). Lean design: the app itself does nothing while
 * idle — no watcher, no realtime channel, no timers. Admin location requests
 * are answered entirely by the NATIVE push handler (HroMessagingService.java),
 * which receives the FCM data push even when Android has killed the app,
 * grabs a fix and uploads it via the upload-tech-location function.
 *
 * The only JS work happens on app start / resume (startLiveTracking):
 * mark the row is_tracking=true (gates admin pings) and run one brief
 * bootstrap fix (permission prompt + initial pin). FCM registration stays
 * on the technician dashboard resume.
 *
 * On the plain website/PWA `isNativeApp()` is false and none of this runs.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

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
let lastMarkedAt = 0;
let lastMarkedTechId = '';
const MARK_MIN_INTERVAL_MS = 3 * 60 * 1000;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
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

async function markSharingOn(technicianId: string): Promise<boolean> {
  const { error } = await supabase
    .from('technician_live_locations')
    .upsert(
      { technician_id: technicianId, is_tracking: true, updated_at: new Date().toISOString() },
      { onConflict: 'technician_id' }
    );
  if (error) {
    console.warn('[live-location] failed to set is_tracking=true:', error.message);
    return false;
  }
  return true;
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
        backgroundTitle: 'HydrogenRO',
        backgroundMessage: 'Syncing…',
        requestPermissions: true,
        stale: true, // a cached fix is fine for the initial position
        distanceFilter: 0,
      },
      (position, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            // Sharing can't work right now (permission denied or phone GPS
            // toggle off) — just mark sharing off so admin pings pause; it
            // recovers automatically on the next open/resume once fixed.
            // No settings redirect, no toast: permission is granted manually
            // in phone Settings, and the admin dialog already shows
            // "Sharing off" with the last known location.
            void stopLiveTracking(technicianId);
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

/**
 * Enable / refresh sharing. Safe to call on every resume — always re-writes
 * is_tracking=true so a stuck "Sharing off" recovers after permission is fixed.
 */
export async function startLiveTracking(technicianId: string): Promise<boolean> {
  if (!isNativeApp()) return false;

  // Admin pings gate on this flag. Rewrite it on resume, but not on every
  // visibility flicker in the same few minutes. A fresh app start always writes.
  const recentlyMarked =
    sharingEnabled &&
    lastMarkedTechId === technicianId &&
    Date.now() - lastMarkedAt < MARK_MIN_INTERVAL_MS;
  let marked = true;
  if (!recentlyMarked) {
    marked = await markSharingOn(technicianId);
    if (marked) {
      lastMarkedAt = Date.now();
      lastMarkedTechId = technicianId;
    }
  }

  if (sharingEnabled) {
    return marked;
  }
  sharingEnabled = true;

  // Bootstrap is best-effort (permission prompt + initial pin). Native FCM
  // location uploads do not need the watcher — so a failed bootstrap must NOT
  // flip is_tracking back off (that was leaving techs stuck on "Sharing off"
  // even with Location permission allowed).
  const ok = await runBootstrapFix(technicianId);
  if (!ok) {
    console.warn('[live-location] bootstrap watcher failed; keeping is_tracking on for FCM pings');
  }
  return marked;
}

/** Disable sharing: the server refuses location pings while is_tracking=false. */
export async function stopLiveTracking(technicianId: string): Promise<void> {
  sharingEnabled = false;
  lastMarkedAt = 0;
  lastMarkedTechId = '';
  await stopWatcherOnly();

  await supabase
    .from('technician_live_locations')
    .update({ is_tracking: false, updated_at: new Date().toISOString() })
    .eq('technician_id', technicianId);
}
