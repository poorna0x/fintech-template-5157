/**
 * On-demand location for the technician Android app (Capacitor wrapper).
 *
 * One-shot design: nothing runs continuously. When an admin opens the
 * "Technician live location" view (or taps Refresh) the app receives a ping —
 * over Supabase realtime while awake, or an FCM data push when Android has
 * frozen it — grabs a single GPS fix, uploads it and stops immediately.
 * The status-bar notification only appears for those few seconds.
 *
 * On enable we run one fix to trigger the Android permission prompt and store
 * a "last known" location, then shut down.
 *
 * On the plain website/PWA `isNativeApp()` is false and none of this runs.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerTechnicianPushToken, setLocationRequestHandler } from '@/lib/technicianPush';

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

/** Give up on a fix (and remove the notification) if GPS can't deliver by then. */
const ONE_SHOT_TIMEOUT_MS = 45_000;

let sharingEnabled = false;
let watcherId: string | null = null;
let startingWatcher = false;
let watcherTimeout: ReturnType<typeof setTimeout> | null = null;
let lastPingAt = 0;
let pingChannel: RealtimeChannel | null = null;
let currentTechnicianId: string | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when the "Share live location" switch is on (listener active). */
export function isLiveTrackingActive(): boolean {
  return sharingEnabled;
}

async function uploadLocation(technicianId: string, loc: Location): Promise<void> {
  await supabase.from('technician_live_locations').upsert(
    {
      technician_id: technicianId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      speed: loc.speed,
      heading: loc.bearing,
      is_tracking: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'technician_id' }
  );
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
 * Grab one location fix, upload it and stop. `stale: true` (enable bootstrap)
 * accepts a cached fix; pings use `stale: false` for a fresh one.
 */
async function runOneShotFix(technicianId: string, stale: boolean): Promise<boolean> {
  if (watcherId !== null || startingWatcher) return true;
  startingWatcher = true;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'HRO Technician is active',
        backgroundMessage: 'Sending your current location…',
        requestPermissions: true,
        stale,
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
        void uploadLocation(technicianId, position);
        void stopWatcherOnly();
      }
    );
    // Never leave the watcher (and its notification) hanging if no fix arrives.
    watcherTimeout = setTimeout(() => void stopWatcherOnly(), ONE_SHOT_TIMEOUT_MS);
    return true;
  } catch {
    watcherId = null;
    return false;
  } finally {
    startingWatcher = false;
  }
}

function startPingListener(technicianId: string): void {
  stopPingListener();
  pingChannel = supabase
    .channel(`tech-live-loc-${technicianId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'technician_live_locations',
        filter: `technician_id=eq.${technicianId}`,
      },
      (payload) => {
        const ping = (payload.new as { ping_requested_at?: string | null })?.ping_requested_at;
        if (!ping) return;
        const pingMs = new Date(ping).getTime();
        if (pingMs <= lastPingAt) return; // our own upload echoing back
        lastPingAt = pingMs;
        void runOneShotFix(technicianId, false);
      }
    )
    .subscribe();
}

function stopPingListener(): void {
  if (pingChannel) {
    void supabase.removeChannel(pingChannel);
    pingChannel = null;
  }
}

/** Treat a wake-up signal (FCM push) exactly like a fresh admin ping. */
function onLocationRequested(): void {
  const technicianId = currentTechnicianId;
  if (!sharingEnabled || !technicianId) return;
  lastPingAt = Date.now();
  void runOneShotFix(technicianId, false);
}

/**
 * Register for FCM push (shared with job notifications) and route silent
 * { type: 'location_request' } pushes to the one-shot fix. The push wakes the
 * app even when the realtime websocket is frozen in the background.
 */
async function setupPushWakeup(technicianId: string): Promise<void> {
  setLocationRequestHandler(onLocationRequested);
  await registerTechnicianPushToken(technicianId);
}

/**
 * Enable location sharing: registers the ping listener, requests the location
 * permission via a brief one-shot fix, then stays idle until an admin
 * actually requests the location.
 */
export async function startLiveTracking(technicianId: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (sharingEnabled) return true;

  sharingEnabled = true;
  currentTechnicianId = technicianId;

  // Row marks the technician as sharing even before the first fix arrives.
  await supabase
    .from('technician_live_locations')
    .upsert(
      { technician_id: technicianId, is_tracking: true, updated_at: new Date().toISOString() },
      { onConflict: 'technician_id' }
    );

  startPingListener(technicianId);
  void setupPushWakeup(technicianId);

  const ok = await runOneShotFix(technicianId, true);
  if (!ok) {
    await stopLiveTracking(technicianId);
    return false;
  }
  return true;
}

/** Disable sharing entirely: stop watcher + listener, mark the row off. */
export async function stopLiveTracking(technicianId: string): Promise<void> {
  sharingEnabled = false;
  currentTechnicianId = null;
  lastPingAt = 0;

  stopPingListener();
  await stopWatcherOnly();

  await supabase
    .from('technician_live_locations')
    .update({ is_tracking: false, updated_at: new Date().toISOString() })
    .eq('technician_id', technicianId);
}
